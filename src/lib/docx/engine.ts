/**
 * Motor de renderizacao DOCX -> DOCX preenchido.
 *
 * Pipeline:
 *   1. preprocessDocxBuffer injeta `{tag}` no XML para o docxtemplater
 *   2. Docxtemplater faz o merge das variaveis
 *   3. Retorna buffer DOCX final
 *
 * Conversao final para PDF acontece em outra camada (Gotenberg / LibreOffice).
 */

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { preprocessDocxBuffer, DELIMITER_OPEN, DELIMITER_CLOSE } from './preprocess'
import { buildLiteralToCanonical } from './known-tags'

export interface RenderOptions {
  /**
   * Se true, fonte de dados usa as chaves canônicas (patient_name etc.) e o
   * motor monta automaticamente o dicionario para cada `literal` -> valor da
   * chave canônica correspondente. Default: true.
   */
  useCanonicalMapping?: boolean

  /**
   * Comportamento quando tag tem valor undefined/null.
   *   - 'empty' (default): substitui por string vazia
   *   - 'literal': mantem o texto da tag original
   */
  nullStrategy?: 'empty' | 'literal'
}

export interface RenderResult {
  buffer: Buffer
  tagsUsed: string[]      // tags que tinham valor mapeado
  tagsMissing: string[]   // tags presentes no DOCX porem sem valor
}

/**
 * Renderiza um buffer DOCX com os dados fornecidos.
 * O `data` aceita chaves canônicas (patient_name) — o motor monta os literais
 * (Custom_patient) automaticamente.
 */
export function renderDocxTemplate(
  templateBuffer: Buffer | Uint8Array,
  data: Record<string, unknown>,
  opts: RenderOptions = {},
): RenderResult {
  const useCanonical = opts.useCanonicalMapping !== false
  const nullStrategy = opts.nullStrategy ?? 'empty'

  // 1) preprocessa: injeta {literal} no XML
  const preprocessed = preprocessDocxBuffer(templateBuffer)

  // 2) monta dicionario literal -> valor
  const dict: Record<string, unknown> = {}
  if (useCanonical) {
    const map = buildLiteralToCanonical()
    for (const [literal, canonical] of map.entries()) {
      const v = data[canonical]
      if (v !== undefined && v !== null) dict[literal] = v
    }
    // Tambem aceita literais diretos no data (override manual)
    for (const k of Object.keys(data)) {
      if (data[k] !== undefined && data[k] !== null) dict[k] = data[k]
    }
  } else {
    Object.assign(dict, data)
  }

  // 3) renderiza
  const zip = new PizZip(preprocessed)

  const tagsSeen = new Set<string>()
  const tagsMissing = new Set<string>()

  const doc = new Docxtemplater(zip, {
    delimiters: { start: DELIMITER_OPEN, end: DELIMITER_CLOSE },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter(part) {
      const tag = (part as { value?: string })?.value ?? ''
      if (tag) tagsMissing.add(tag)
      return nullStrategy === 'literal'
        ? `${DELIMITER_OPEN}${tag}${DELIMITER_CLOSE}`
        : ''
    },
  })

  // Hook para coletar tags usadas
  const originalRender = doc.render.bind(doc)
  doc.render = function (renderData?: Record<string, unknown>) {
    const merged = renderData ?? dict
    for (const k of Object.keys(merged)) tagsSeen.add(k)
    return originalRender(merged)
  } as typeof doc.render

  doc.render(dict)

  const out = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer

  return {
    buffer: out,
    tagsUsed: Array.from(tagsSeen),
    tagsMissing: Array.from(tagsMissing),
  }
}
