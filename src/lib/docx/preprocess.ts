/**
 * Pre-processador do DOCX antes do docxtemplater.
 *
 * Problema 1 — runs fragmentados: o Word divide texto em multiplos
 * `<w:r><w:t>` consecutivos quando ha edicoes minimas de formatacao, entao
 * `Custom_` e `patient` (ou `{{`, `tag`, `}}`) podem viver em runs diferentes.
 * docxtemplater normaliza alguns casos sozinho, mas placeholders proximos a
 * SDT / content controls geram ambiguidades. Garantimos achatando.
 *
 * Problema 2 — delimiters duplos: alguns templates da clinica (mailmerge do
 * Word) ja chegam com `{{tag}}` literal. Outros chegam com `tag` puro. Para
 * suportar ambos, o pipeline:
 *   1. Padroniza para `{{tag}}` (delimitadores duplos) — formato nativo de
 *      mailmerge do Word, evita conflito com `{` solto que aparece em codigo.
 *   2. Se a tag ja vem com `{{...}}`, mantem inalterada — apenas achata runs.
 *   3. Se a tag vem pura (`Custom_patient`), envolve com `{{Custom_patient}}`.
 *
 * O motor docxtemplater (engine.ts) e' configurado com delimiters
 * `{{` / `}}` para casar.
 *
 * Compromisso: parágrafos que contem uma tag perdem variacao interna de
 * formatacao (negrito intercalado, cor diferente etc) por causa do
 * achatamento. Para templates de receituario isso e aceitavel.
 */

import PizZip from 'pizzip'
import { getAllKnownTags } from './known-tags'

const DOCUMENT_XML = 'word/document.xml'

export const DELIMITER_OPEN = '{{'
export const DELIMITER_CLOSE = '}}'

/**
 * Aplica preprocessamento em buffer DOCX.
 * Retorna novo buffer com `{{tag}}` consolidado e runs achatados.
 */
export function preprocessDocxBuffer(buffer: Buffer | Uint8Array): Buffer {
  const zip = new PizZip(buffer)
  const docXmlFile = zip.file(DOCUMENT_XML)
  if (!docXmlFile) throw new Error('DOCX invalido: ausente word/document.xml')

  const xml = docXmlFile.asText()
  const normalized = normalizeParagraphs(xml)
  zip.file(DOCUMENT_XML, normalized)

  return zip.generate({ type: 'nodebuffer' }) as Buffer
}

/** Itera todos os <w:p>...</w:p> e processa cada um. */
export function normalizeParagraphs(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    return processParagraph(paragraph)
  })
}

/**
 * Para um parágrafo:
 *   1. Pega todos os <w:t>...</w:t> em ordem e concatena.
 *   2. Aplica wrapKnownTags (idempotente: ignora tags ja com `{{...}}`).
 *   3. Se mudou ou se a versao concatenada difere do XML original, achata o
 *      parágrafo em um unico <w:r>{rPr}<w:t>{texto}</w:t></w:r>.
 *   4. Caso contrario, devolve intocado.
 *
 * O achatamento e' decisivo mesmo quando nao injetamos nada: garante que
 * `{{` / tag / `}}` que estavam em runs separados ficam em UM run,
 * eliminando o erro classico "Duplicate close tag" do docxtemplater.
 */
function processParagraph(paragraph: string): string {
  const textMatches = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
  if (textMatches.length === 0) return paragraph

  const rawCombined = textMatches.map((m) => decodeXmlText(m[1])).join('')
  // Corrige `{{tagPrefix}}suffix` onde prefix+suffix forma tag conhecida —
  // padrao bizarro que aparece quando o Word particiona o nome da tag pelo
  // meio (ex: `{{Cidade_da_clinic}}a` para Cidade_da_clinica).
  const combined = repairFragmentedDelimiters(rawCombined)
  const { wrapped, found } = wrapKnownTags(combined)

  // Detecta se delimitadores {{ / }} aparecem fragmentados em runs diferentes
  // (ex.: run1='{{', run2='Custom_patient', run3='}}'): isso sozinho ja
  // justifica achatamento mesmo sem injecao.
  const hasFragmentedDelimiters =
    combined.includes('{{') && textMatches.some((m) => /^\{\{$|^\}\}$|^\{$|^\}$/.test(m[1]))

  const wasRepaired = combined !== rawCombined
  if (!found && !hasFragmentedDelimiters && !wasRepaired) return paragraph

  // Pegar rPr do primeiro <w:r> para preservar formatacao base
  const firstRunMatch = paragraph.match(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/)
  const rPrMatch = firstRunMatch?.[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
  const rPr = rPrMatch?.[0] ?? ''

  const newRun =
    '<w:r>' +
    rPr +
    '<w:t xml:space="preserve">' +
    encodeXmlText(wrapped) +
    '</w:t>' +
    '</w:r>'

  const pPrMatch = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
  const pPr = pPrMatch?.[0] ?? ''
  const openTagMatch = paragraph.match(/^<w:p\b[^>]*>/)
  const openTag = openTagMatch?.[0] ?? '<w:p>'

  return openTag + pPr + newRun + '</w:p>'
}

/**
 * Procura tags literais conhecidas em `text` e envolve com `{{...}}`.
 *
 * Idempotente: NAO envolve novamente quando a tag ja esta dentro de
 * `{{tag}}` no proprio texto. Isso e' o que evita o bug catastrofico
 * `{{{Custom_patient}}}` que gera Duplicate close tag.
 */
export function wrapKnownTags(text: string): { wrapped: string; found: boolean } {
  let wrapped = text
  let found = false

  // Ordena por tamanho desc para resolver overlaps de prefixo
  // (ex: `Medicamento1_posologia` antes de `Medicamento1`).
  const tags = getAllKnownTags()
    .map((t) => t.literal)
    .sort((a, b) => b.length - a.length)

  for (const literal of tags) {
    if (!wrapped.includes(literal)) continue
    found = true
    const safe = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // (?<!\{\{) — nao tem `{{` imediatamente antes (ja envolvido)
    // (?!\}\})  — nao tem `}}` imediatamente depois (ja envolvido)
    // Isso impede DOUBLE wrap. Tambem evita match dentro de tag mais
    // longa ja envolvida: `{{Custom_indicações_medicamento1}}` nao casa
    // o literal `Custom_indicações_medicamento` (sem digito) porque
    // o anterior eh `{{`.
    const re = new RegExp(`(?<!\\{\\{)${safe}(?!\\}\\})`, 'g')
    wrapped = wrapped.replace(re, `{{${literal}}}`)
  }

  return { wrapped, found }
}

/**
 * Conserta tags onde o Word fechou os delimitadores `}}` no MEIO do nome.
 * Padroes reais AlmaVet (Dra. clicou em campos no Word e quebrou):
 *   `{{Cidade_da_clinic}}a`    -> `{{Cidade_da_clinica}}`
 *   `{{Custo}}m_idade`         -> `{{Custom_idade}}`
 *   `{{ano_}}atendimento`      -> `{{ano_atendimento}}`
 *   `{{Medicaments_via}}_uso`  -> `{{Medicaments_via_uso}}`
 *   `{{D}}ia_atendimento`      -> `{{Dia_atendimento}}`
 *
 * Algoritmo: para cada `{{prefix}}suffix...` onde `prefix` nao e' tag
 * conhecida MAS `prefix + parte_de_suffix` e', faz merge para `{{tag}}`.
 * Itera ate estabilizar (cobre multi-fragmento).
 */
function repairFragmentedDelimiters(text: string): string {
  const knownLiterals = new Set(getAllKnownTags().map((t) => t.literal))

  let prev = ''
  let out = text
  let safetyIterations = 5
  while (prev !== out && safetyIterations-- > 0) {
    prev = out
    out = out.replace(
      /\{\{([A-Za-z0-9_çãéíóúáàâêôõ]+)\}\}([A-Za-z0-9_çãéíóúáàâêôõ]*)/g,
      (full, prefix: string, suffix: string) => {
        if (knownLiterals.has(prefix)) return full // ja eh tag valida
        // tenta o maior cut possivel de suffix tal que prefix+cut = tag conhecida
        for (let cut = suffix.length; cut >= 1; cut--) {
          const candidate = prefix + suffix.slice(0, cut)
          if (knownLiterals.has(candidate)) {
            return `{{${candidate}}}` + suffix.slice(cut)
          }
        }
        return full
      },
    )
  }
  return out
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
