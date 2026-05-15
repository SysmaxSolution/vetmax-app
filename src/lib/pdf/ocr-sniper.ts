/**
 * OCR Sniper — Operação Pixel Perfect (Bypass Vision para coordenadas).
 *
 * Lê o textContent NATIVO do PDF (via pdfjs.getTextContent → PdfTextItem[])
 * e identifica deterministicamente:
 *
 *   • Quais itens são RÓTULOS (labels) — heurísticas estáveis (sufixo ":",
 *     comprimento, isolamento)
 *   • Bbox EXATA de cada rótulo (do PDF, não estimada por modelo)
 *   • Bbox CALCULADA do VALOR adjacente (campo dinâmico) — matemática
 *     vetorial: x_valor = label.x + label.w + margem, y_valor = label.y
 *   • Bbox do TEXTO ANTIGO porventura preenchido (para whiteout cirúrgico)
 *   • Alinhamento herdado do texto antigo (center/left/right)
 *   • Campos GLOBAIS (que se repetem em todas as páginas — header/footer)
 *
 * O Claude entra DEPOIS, apenas para o de-para semântico:
 *   label_text "Proprietário:" → field_name "tutor_nome"
 */

import type { PdfTextItem, PdfPagesResult } from '../pdf-to-images'

// ── Tipos públicos ──────────────────────────────────────────────────────────

export interface LabelCandidate {
  page: number
  /** Texto raw do rótulo, como aparece no PDF (ex: "Paciente:") */
  label_text: string
  /** Normalizado: sem ':', sem acentos, lowercase (ex: "paciente") */
  label_normalized: string
  /** Bbox exata do rótulo, em % da página (top-left origin) */
  label_bbox: Bbox
  /** Bbox calculada para o VALOR dinâmico (à direita do rótulo) */
  value_bbox: Bbox
  /** Alinhamento herdado do texto antigo na posição do valor */
  align: 'left' | 'center' | 'right'
  /** Texto que JÁ ESTÁ preenchido naquele campo (a ser apagado pelo whiteout) */
  existing_value_text?: string
  /** Bbox exata do texto antigo (cirúrgico para whiteout) */
  existing_value_bbox?: Bbox
  /** Tamanho da fonte estimado em pt (a partir da altura do label) */
  font_size_pt: number
  /** PM-3: baseline Y em % do topo da página (do texto original). Usada
   * para alinhar drawText exatamente onde o texto antigo estava. */
  baseline_y_pct: number
}

export interface Bbox {
  x_pct: number
  y_pct: number
  w_pct: number
  h_pct: number
}

export interface SniperOptions {
  /** Gap horizontal entre label e o início do valor (em % da largura da página). Default 0.5%. */
  margin_pct?: number
  /** Largura mínima do bbox do valor (% da página). Default 10%. */
  value_min_w_pct?: number
  /** Largura máxima do bbox do valor (até onde se estende — % da página). Default 50%. */
  value_max_w_pct?: number
  /** Tolerância para agrupar itens na mesma linha (% da altura). Default 0.6%. */
  line_y_tolerance_pct?: number
}

// ── Constantes ──────────────────────────────────────────────────────────────

const DEFAULT_MARGIN_PCT = 0.5
const DEFAULT_VALUE_MIN_W_PCT = 10
const DEFAULT_VALUE_MAX_W_PCT = 50
const DEFAULT_LINE_TOLERANCE_PCT = 0.6

/**
 * LEI 2 — Whiteout Seguro.
 *
 * Margem de segurança ENTRE o rótulo e o início do retângulo branco. Garante
 * matematicamente que o whiteout NUNCA toque a tipografia do label.
 *
 * 0.3% de uma página A4 (≈595pt de largura) ≈ 1.8pt ≈ 2px (a 100% zoom).
 */
const WHITEOUT_SAFETY_PCT = 0.3

/**
 * INTERVENCAO CIRURGICA — Regra do ":".
 *
 * Para QUALQUER label terminado em ":", o whiteout DEVE comecar
 * estritamente APOS o caractere ":". Margem >= COLON_SAFETY_PCT (~5px em A4
 * a 100%, ~6px em alta resolucao). Esta margem se sobrepoe a WHITEOUT_SAFETY_PCT
 * — usamos a MAIOR das duas (sempre COLON_SAFETY_PCT quando ha ":").
 *
 * Em 595pt: 0.85% ≈ 5pt ≈ 5px @ 100%.
 */
const COLON_SAFETY_PCT = 0.85

/**
 * IC-12 — Gutter de coluna.
 *
 * Quando o limite direito vem de OUTRO LABEL na mesma linha (next_label ou
 * symmetry), aplicamos uma margem MAIOR que WHITEOUT_SAFETY_PCT (0.3%) — o
 * usuario ve uma DIVISORIA VISUAL entre as colunas da tabela (linhas
 * verticais), normalmente posicionada entre 5-15pt antes do proximo label.
 *
 * 2.5% em A4 (595pt) = ~15pt — respeita a divisoria sem comer o value util.
 *
 * Para limites "intocaveis" (sufixo, boundary), continuamos usando o SAFETY
 * pequeno: queremos chegar o MAIS PROXIMO possivel sem tocar.
 */
const COLUMN_GUTTER_PCT = 2.5

/**
 * Localiza a posicao X (% da pagina) do CARACTERE imediatamente apos o
 * ultimo ":" presente nos label_items. Retorna null se nenhum item contem ":".
 *
 * Calculo: x_pct = item.x + ((colonIdx+1) / strLen) * item.w
 *
 * A aproximacao usa proporcionalidade simples sobre o numero de caracteres —
 * imprecisa para fontes proporcionais (variacao ~3-5%), mas a margem
 * COLON_SAFETY_PCT cobre essa variacao com folga.
 */
function colonEndX(labelItems: PdfTextItem[]): number | null {
  for (let i = labelItems.length - 1; i >= 0; i--) {
    const it = labelItems[i]
    const colonIdx = it.str.lastIndexOf(':')
    if (colonIdx === -1) continue
    const len = it.str.length
    if (len === 0) return it.x_pct + it.w_pct
    const ratio = (colonIdx + 1) / len
    return it.x_pct + it.w_pct * ratio
  }
  return null
}

/**
 * Vocabulário de labels comuns em documentos veterinários — usado como
 * "boost" de confiança quando o texto não termina com ':' mas bate com a lista.
 */
const VET_LABEL_VOCABULARY = new Set([
  // Identidade do animal
  'paciente', 'pet', 'animal', 'nome do animal', 'nome do pet',
  'especie', 'raca', 'idade', 'sexo', 'peso', 'pelagem', 'cor',
  // Tutor
  'proprietario', 'tutor', 'responsavel', 'dono', 'cpf', 'telefone',
  'celular', 'email', 'endereco', 'cep',
  // Profissional
  'veterinario', 'medico', 'mv', 'crmv', 'responsavel tecnico',
  // Documento
  'data', 'data do exame', 'hora', 'clinica', 'hospital',
  // Clínico
  'temperatura', 'frequencia cardiaca', 'fc', 'frequencia respiratoria',
  'fr', 'pressao arterial', 'pa', 'condicao', 'ritmo',
  // Diagnóstico
  'diagnostico', 'conclusao', 'observacoes', 'anamnese', 'queixa',
  'medicacao', 'tratamento', 'prescricao',
])

// ── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function bboxFromItems(items: PdfTextItem[]): Bbox {
  if (items.length === 0) return { x_pct: 0, y_pct: 0, w_pct: 0, h_pct: 0 }
  const xMin = Math.min(...items.map(i => i.x_pct))
  const yMin = Math.min(...items.map(i => i.y_pct))
  const xMaxEnd = Math.max(...items.map(i => i.x_pct + i.w_pct))
  const yMaxEnd = Math.max(...items.map(i => i.y_pct + i.h_pct))
  return { x_pct: xMin, y_pct: yMin, w_pct: xMaxEnd - xMin, h_pct: yMaxEnd - yMin }
}

/**
 * Operacao Precisao Milimetrica — PM-1.
 *
 * pdfjs frequentemente retorna "Paciente: Snow" como UM unico item.
 * Sem split, o sniper trataria a string toda como label E o whiteout
 * apagaria o rotulo. Esta funcao quebra matematicamente o item em duas
 * partes: o rotulo (ate o ':' inclusive) e o valor (apos o ':').
 *
 * A largura de cada parte e calculada proporcionalmente ao numero de
 * caracteres (aproximacao razoavel — chars de fonte monospace seriam
 * exatos; em fontes proporcionais e ~5% de erro absoluto, suficiente
 * para o whiteout cobrir a regiao correta).
 */
function splitItemAtColon(item: PdfTextItem): PdfTextItem[] {
  const colonIdx = item.str.indexOf(':')
  // Quebra apenas se ':' esta no meio (nao no fim) E ha conteudo nao-espaco apos
  if (colonIdx === -1 || colonIdx === item.str.length - 1) return [item]
  const afterColon = item.str.slice(colonIdx + 1)
  if (!afterColon.trim()) return [item]

  const labelStr = item.str.slice(0, colonIdx + 1)        // "Paciente:"
  const trimmedValueStart = afterColon.length - afterColon.trimStart().length
  const valueStr = afterColon.trimStart()                  // "Snow"
  const totalLen = item.str.length

  // Proporcao de cada parte (em chars)
  const labelLenRatio = labelStr.length / totalLen
  const skippedRatio  = trimmedValueStart / totalLen
  const valueLenRatio = valueStr.length / totalLen

  const labelW_pct = item.w_pct * labelLenRatio
  const skippedW_pct = item.w_pct * skippedRatio
  const valueW_pct = item.w_pct * valueLenRatio

  const labelPart: PdfTextItem = {
    ...item,
    str: labelStr,
    w_pct: labelW_pct,
  }
  const valuePart: PdfTextItem = {
    ...item,
    str: valueStr,
    x_pct: item.x_pct + labelW_pct + skippedW_pct,
    w_pct: valueW_pct,
  }
  return [labelPart, valuePart]
}

/**
 * Aplica splitItemAtColon em todos os items de uma linha, expandindo items
 * compostos em dois pseudo-items antes do segmentLine identificar labels.
 */
function preprocessLineItems(items: PdfTextItem[]): PdfTextItem[] {
  const out: PdfTextItem[] = []
  for (const it of items) {
    const parts = splitItemAtColon(it)
    out.push(...parts)
  }
  return out
}

// ── Etapa 1: agrupar items por linha ────────────────────────────────────────

interface LineGroup {
  page: number
  items: PdfTextItem[]    // ordenados por X
  y_pct: number           // Y mínimo
  h_pct: number           // altura máxima
}

export function groupByLine(textItems: PdfTextItem[], tolerance_pct = DEFAULT_LINE_TOLERANCE_PCT): LineGroup[] {
  const byPage = new Map<number, PdfTextItem[]>()
  for (const it of textItems) {
    if (!byPage.has(it.page)) byPage.set(it.page, [])
    byPage.get(it.page)!.push(it)
  }

  const lines: LineGroup[] = []
  for (const [page, items] of byPage) {
    const sorted = [...items].sort((a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct)
    let current: PdfTextItem[] = []
    let currentYAvg = 0

    const flush = () => {
      if (current.length === 0) return
      const sortedByX = [...current].sort((a, b) => a.x_pct - b.x_pct)
      const yMin = Math.min(...current.map(i => i.y_pct))
      const hMax = Math.max(...current.map(i => i.h_pct))
      lines.push({ page, items: sortedByX, y_pct: yMin, h_pct: hMax })
      current = []
    }

    for (const it of sorted) {
      if (current.length === 0) {
        current.push(it)
        currentYAvg = it.y_pct
      } else if (Math.abs(it.y_pct - currentYAvg) <= tolerance_pct) {
        current.push(it)
        // média móvel para acomodar pequenas variações
        currentYAvg = (currentYAvg * (current.length - 1) + it.y_pct) / current.length
      } else {
        flush()
        current = [it]
        currentYAvg = it.y_pct
      }
    }
    flush()
  }
  return lines
}

// ── Etapa 2: extrair label + valor existente de uma linha ───────────────────

interface LineSegmentation {
  label_items: PdfTextItem[]      // itens que compõem o label
  value_items: PdfTextItem[]      // itens que compõem o valor existente
  next_label_x_pct: number | null // X do próximo label na mesma linha (limite do valor)
  // TZ-3: sufixo de unidade (cm, m/s, mmHg, bpm, %, kg) — quando presente,
  // o value_bbox deve ficar ENTRE label.right e suffix.left
  suffix_items?: PdfTextItem[]
  suffix_x_pct?: number           // X do sufixo (limite direito do valor)
  // INTERVENCAO CIRURGICA: boundary direita — texto FIXO do template que
  // delimita o valor pela direita SEM ser apagado (referencias clinicas
  // entre parenteses, "Referência: X – Y", etc).
  right_boundary_x_pct?: number
  // IC-10: simetria de coluna — quando ha 2+ labels na mesma linha, o
  // ultimo label "herda" a largura media dos values dos labels anteriores.
  // Evita que a coluna direita estique ate a borda da pagina.
  symmetry_next_x_pct?: number
}

// TZ-3: Padrões de unidades de medida comuns em laudos veterinários.
// Quando um item da linha (após o label) bate com este regex, é tratado
// como SUFIXO — o value_bbox para drawText fica ENTRE o label e este sufixo.
const SUFFIX_UNIT_REGEX = /^(?:cm|mm|m\/s|m\/seg|mmHg(?:\/s)?|bpm|mpm|spm|%|kg|°C|ºC|Hz|ms|s|ml|mg|µg|ug|g|dl|UI|UI\/L)$/i

function isSuffixUnit(text: string): boolean {
  return SUFFIX_UNIT_REGEX.test(text.trim())
}

/**
 * INTERVENCAO CIRURGICA: items que sao informacoes FIXAS do template e
 * delimitam o valor a direita sem serem apagados.
 *
 * Exemplos:
 *   "(normal até 1,7)"          — referencia em parenteses
 *   "Referência: 60% – 80%"     — bloco de referencia inteiro
 *   "Ref:"                      — abreviacao
 */
function isBoundaryItem(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('(')) return true
  // IC-9: comparadores iniciam referencias clinicas tipo ">30%", "<2.5"
  if (/^[><≥≤]/.test(t)) return true
  if (/^Refer[êe]ncia/i.test(t)) return true
  if (/^Ref\.?:?$/i.test(t)) return true
  if (/^Normal\b/i.test(t) && /\b(at[ée]|de)\b/i.test(t)) return true
  return false
}

/**
 * IC-9: titulos de secao ("OBSERVAÇÕES", "CONCLUSÃO", "PARÂMETROS ANALISADOS")
 * sao texto todo em maiusculas e NAO devem virar campos via vocabulary match.
 *
 * Siglas curtas (CRMV, CPF, RG, FC, FR) sao consideradas labels validos —
 * threshold de 6 chars exclui essas.
 */
function isAllCapsTitle(text: string): boolean {
  const t = text.trim().replace(/[:\.,;]/g, '')
  if (t.length < 6) return false   // CRMV (4), CPF (3), etc passam
  if (!/[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]/.test(t)) return false
  return t === t.toUpperCase()
}

/**
 * Rotulos FIXOS do template que NAO viram campos do usuario. Mesmo
 * terminando em ":", representam dados imutaveis (referencia clinica, faixa
 * normal, observacao do template).
 *
 * Tratado como PREFIX: "Normal até:" -> "normal ate" bate com prefix "normal".
 */
const TEMPLATE_FIXED_LABEL_PREFIXES = [
  'referencia',
  'ref',
  'normal',
  'valor normal',
  'faixa normal',
  'range',
]

function isTemplateFixedLabel(labelNormalized: string): boolean {
  return TEMPLATE_FIXED_LABEL_PREFIXES.some(p =>
    labelNormalized === p || labelNormalized.startsWith(p + ' '),
  )
}

/**
 * Detecta se um item ou sequência forma um label.
 *
 * Criterios:
 *   1. Texto termina com ':' — caso classico
 *   2. IC-19: texto termina com 5+ pontos de preenchimento — padrao comum
 *      em hemogramas e relatorios laboratoriais para alinhar valores em
 *      colunas ("ERITRÓCITOS(milhões/mm³)..............")
 *
 * 5+ pontos eh o threshold seguro: descarta reticencias (3 pontos), itens
 * decimais ("3.14") e abreviacoes ("etc..."), mas captura corretamente o
 * padrao de preenchimento de tabelas.
 */
function isLabelEnding(text: string): boolean {
  const t = text.trim()
  if (/[:][\s]*$/.test(t)) return true
  if (/\.{5,}\s*$/.test(t)) return true
  return false
}

function isLabelVocab(text: string): boolean {
  return VET_LABEL_VOCABULARY.has(normalizeLabel(text))
}

/**
 * Para uma linha (sequência de items), encontra todos os labels e segmenta.
 * Retorna array de {label, value, nextLabelX}.
 */
function segmentLine(line: LineGroup): LineSegmentation[] {
  // PM-1: pre-processa items para quebrar "Label: Valor" coladados em um unico item
  const items = preprocessLineItems(line.items)
  if (items.length === 0) return []

  // Encontra os ÍNDICES dos items que TERMINAM com ':' (alta confiança)
  const labelEnds: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (isLabelEnding(items[i].str)) labelEnds.push(i)
  }

  // Se não tem nenhum ":", tenta vocabulário (label sem ":")
  // Mas só para items isolados curtos no início da linha
  if (labelEnds.length === 0) {
    // Tenta agrupar primeiros 1-3 items se baterem com vocabulário
    for (let len = 3; len >= 1; len--) {
      if (items.length < len) continue
      const candidate = items.slice(0, len).map(i => i.str).join(' ')
      // IC-9: titulos all-caps ("OBSERVAÇÕES", "CONCLUSÃO") sao secao, nao label
      if (isAllCapsTitle(candidate)) continue
      if (isLabelVocab(candidate)) {
        // Considera os primeiros `len` items como label
        labelEnds.push(len - 1)
        break
      }
    }
  }

  if (labelEnds.length === 0) return []

  // Para cada label end, agrupa items até o início do label (inclusive)
  // e os items entre esse label e o próximo (ou fim da linha) como valor.
  const segments: LineSegmentation[] = []
  let labelStartIdx = 0

  for (let li = 0; li < labelEnds.length; li++) {
    const labelEndIdx = labelEnds[li]
    const labelItems = items.slice(labelStartIdx, labelEndIdx + 1)
    const valueStartIdx = labelEndIdx + 1
    const nextLabelStartIdx = li + 1 < labelEnds.length
      ? labelEnds[li + 1] - countConsecutiveContiguous(items, labelEnds[li + 1])
      : items.length

    let valueItems = items.slice(valueStartIdx, nextLabelStartIdx)
    const nextLabelX = li + 1 < labelEnds.length
      ? items[nextLabelStartIdx].x_pct
      : null

    // INTERVENCAO CIRURGICA: detecta item BOUNDARY entre value items —
    // textos como "(normal até 1,7)" sao referencias clinicas FIXAS que
    // delimitam o valor a direita SEM serem apagados pelo whiteout.
    const boundaryIdx = valueItems.findIndex(it => isBoundaryItem(it.str))
    let rightBoundaryX: number | undefined
    if (boundaryIdx >= 0) {
      rightBoundaryX = valueItems[boundaryIdx].x_pct
      // Tudo a partir do boundary deixa de ser "value antigo do campo" —
      // permanece intocavel no template.
      valueItems = valueItems.slice(0, boundaryIdx)
    }

    // IC-19: para labels com pontos de preenchimento (hemogramas), o VALOR
    // eh apenas o PRIMEIRO item apos o label. Items subsequentes na mesma
    // linha sao UNIDADE + REFERENCIA (intocaveis). Ex linha 1 hemograma:
    //   "ERITRÓCITOS(milhões/mm³)......" + "7,1" + "milhões/mm³" + "5,5 - 10 milhões/mm³"
    //   label:                          ^value^  ^suffix/ref^   ^reference (boundary)^
    // Sem essa logica, o whiteout cobria 50% da pagina e apagava as
    // referencias intactas.
    const labelEndsWithDots = /\.{5,}\s*$/.test(items[labelEndIdx].str)
    if (labelEndsWithDots && valueItems.length >= 2 && rightBoundaryX === undefined) {
      // Promove o segundo item a boundary (limita o whiteout)
      rightBoundaryX = valueItems[1].x_pct
      valueItems = valueItems.slice(0, 1)
    }

    // IC-9: detecta sufixo de unidade em ANY posicao do value (nao so o ultimo).
    // Casos:
    //   - campo vazio com unidade depois: "RDAP index:" + "%" + ">30%"
    //     (boundary ">30%" ja foi removido acima; sobra ["%"] — sufixo no primeiro)
    //   - campo com valor + unidade: "Aorta:" + "0,76" + "cm" (sufixo no ultimo)
    //   - sufixo fragmentado: "m" + "/s" (combina ultimos 2)
    let suffixItems: PdfTextItem[] | undefined
    let suffixX: number | undefined
    if (valueItems.length > 0) {
      const first = valueItems[0]
      const last = valueItems[valueItems.length - 1]
      if (isSuffixUnit(first.str)) {
        // PRIMEIRO item eh sufixo — campo vazio com unidade
        suffixItems = [first]
        suffixX = first.x_pct
        valueItems = valueItems.slice(1)
      } else if (isSuffixUnit(last.str)) {
        // ULTIMO item eh sufixo — campo preenchido com unidade no fim
        suffixItems = [last]
        suffixX = last.x_pct
        valueItems = valueItems.slice(0, -1)
      } else if (valueItems.length >= 2) {
        // Tenta combinação dos últimos 2 (ex: "m" + "/s" fragmentados)
        const combined = valueItems.slice(-2).map(i => i.str).join('')
        if (isSuffixUnit(combined)) {
          suffixItems = valueItems.slice(-2)
          suffixX = suffixItems[0].x_pct
          valueItems = valueItems.slice(0, -2)
        }
      }
    }

    segments.push({
      label_items: labelItems,
      value_items: valueItems,
      next_label_x_pct: nextLabelX,
      suffix_items: suffixItems,
      suffix_x_pct: suffixX,
      right_boundary_x_pct: rightBoundaryX,
    })
    labelStartIdx = nextLabelStartIdx
  }

  // IC-10: SIMETRIA DE COLUNA
  // Em linhas com 2+ labels, o ULTIMO segmento (coluna direita) NAO tem
  // next_label_x_pct. Sem isso o value pode esticar ate a borda da pagina
  // (50% via valueMaxW), enquanto a coluna esquerda foi limitada pelo
  // proximo label. Resultado visual: bbox direita muito maior que a esquerda.
  //
  // Heuristica: usa a largura MEDIA dos values dos labels anteriores
  // (label_right ate next_label) como sintetic next_label para o ultimo.
  if (segments.length >= 2) {
    const widths: number[] = []
    for (let i = 0; i < segments.length - 1; i++) {
      const s = segments[i]
      if (s.next_label_x_pct === null) continue
      const lb = bboxFromItems(s.label_items)
      const w = s.next_label_x_pct - (lb.x_pct + lb.w_pct)
      if (w > 0) widths.push(w)
    }
    if (widths.length > 0) {
      const avg = widths.reduce((a, b) => a + b, 0) / widths.length
      const last = segments[segments.length - 1]
      // Soh aplica se last NAO tem suffix nem boundary (ja delimitam)
      if (!last.suffix_x_pct && last.right_boundary_x_pct === undefined) {
        const lb = bboxFromItems(last.label_items)
        last.symmetry_next_x_pct = (lb.x_pct + lb.w_pct) + avg
      }
    }
  }

  return segments
}

/**
 * Helper: quantos itens contíguos antes de `endIdx` formam o "início" do label?
 * Para labels multi-palavra como "Frequência cardíaca:" onde o ':' está no
 * último item, queremos incluir as palavras anteriores que pertencem ao label.
 *
 * Heurística simples: caminha de trás para frente enquanto itens estão
 * "fortemente" próximos (gap horizontal < 1% da página).
 */
function countConsecutiveContiguous(items: PdfTextItem[], endIdx: number): number {
  let count = 0
  for (let i = endIdx; i > 0; i--) {
    const cur = items[i]
    const prev = items[i - 1]
    const gap = cur.x_pct - (prev.x_pct + prev.w_pct)
    // Mesma linha + gap pequeno = parte do mesmo "termo"
    if (gap >= 0 && gap < 1.5) count++
    else break
  }
  return count
}

// ── Etapa 3: detectar alinhamento herdado ───────────────────────────────────

function detectAlignment(
  valueItems: PdfTextItem[],
  containerLeft_pct: number,
  containerRight_pct: number,
): 'left' | 'center' | 'right' {
  if (valueItems.length === 0) return 'left'
  const valueBbox = bboxFromItems(valueItems)
  const valueCenter = valueBbox.x_pct + valueBbox.w_pct / 2
  const containerCenter = (containerLeft_pct + containerRight_pct) / 2
  const containerW = containerRight_pct - containerLeft_pct
  if (containerW <= 0) return 'left'

  // Distância normalizada do centro do valor ao centro do container
  const deltaCenter = Math.abs(valueCenter - containerCenter) / containerW
  if (deltaCenter < 0.1) return 'center'

  // Encostado à direita?
  const rightGap = containerRight_pct - (valueBbox.x_pct + valueBbox.w_pct)
  if (rightGap < 1 && (valueBbox.x_pct - containerLeft_pct) > containerW * 0.3) return 'right'

  return 'left'
}

// ── Etapa 4: snipeLabels — função principal ─────────────────────────────────

export function snipeLabels(
  textItems: PdfTextItem[],
  opts: SniperOptions = {},
): LabelCandidate[] {
  const margin = opts.margin_pct ?? DEFAULT_MARGIN_PCT
  const valueMaxW = opts.value_max_w_pct ?? DEFAULT_VALUE_MAX_W_PCT
  const valueMinW = opts.value_min_w_pct ?? DEFAULT_VALUE_MIN_W_PCT
  const lineTol = opts.line_y_tolerance_pct ?? DEFAULT_LINE_TOLERANCE_PCT

  const lines = groupByLine(textItems, lineTol)
  const candidates: LabelCandidate[] = []

  for (const line of lines) {
    const segments = segmentLine(line)
    for (const seg of segments) {
      if (seg.label_items.length === 0) continue
      const labelBbox = bboxFromItems(seg.label_items)
      const labelText = seg.label_items.map(i => i.str).join(' ').trim()
      const labelNorm = normalizeLabel(labelText)
      if (!labelNorm) continue

      // ── INTERVENCAO CIRURGICA — A MATEMATICA DO WHITE-OUT SEGURO ─────────
      //
      // PRIORIDADE 1 (regra do ":"): Se o label termina com ":", o whiteout
      //   comeca em colonEndX + COLON_SAFETY_PCT (5px @100% em A4). Esta
      //   regra anula qualquer outra — nunca, sob nenhuma circunstancia, o
      //   apagamento cruza o ":".
      //
      // PRIORIDADE 2 (label sem ":", batido por vocabulario): comeca em
      //   labelRight + WHITEOUT_SAFETY_PCT (2px).
      //
      // Limite a direita:
      //   suffix?    → suffixBbox.x_pct - SAFETY
      //   nextLabel? → nextLabel.x_pct  - SAFETY
      //   else       → 100              - SAFETY
      //
      // O `value_bbox` (alvo do drawText) coincide com o whiteout — o texto
      // novo eh escrito EXATAMENTE no espaco apagado.

      // INTERVENCAO CIRURGICA: rotulos fixos do template ("Referência:",
      // "Normal:", etc) NAO viram campos — sao informacoes imutaveis.
      if (isTemplateFixedLabel(labelNorm)) continue

      const colonX = colonEndX(seg.label_items)
      const labelRight = labelBbox.x_pct + labelBbox.w_pct
      const whiteoutLeft = colonX !== null
        ? colonX + COLON_SAFETY_PCT       // PRIORIDADE 1
        : labelRight + WHITEOUT_SAFETY_PCT  // PRIORIDADE 2
      const hasSuffix = typeof seg.suffix_x_pct === 'number'
      const hasBoundary = typeof seg.right_boundary_x_pct === 'number'
      const hasSymmetry = typeof seg.symmetry_next_x_pct === 'number'

      // Ordem de prioridade do limite DIREITO do whiteout:
      //   1. sufixo de unidade ("cm", "mmHg") — texto a manter intocavel (SAFETY pequeno)
      //   2. boundary item "(normal até..." — texto a manter intocavel (SAFETY pequeno)
      //   3. proximo label da mesma linha (GUTTER maior — respeita divisoria)
      //   4. IC-10: simetria com coluna esquerda (GUTTER maior)
      //   5. fim da pagina (GUTTER de margem)
      let whiteoutRight: number
      if (hasSuffix) {
        whiteoutRight = (seg.suffix_x_pct as number) - WHITEOUT_SAFETY_PCT
      } else if (hasBoundary) {
        whiteoutRight = (seg.right_boundary_x_pct as number) - WHITEOUT_SAFETY_PCT
      } else if (seg.next_label_x_pct !== null) {
        // IC-12: gutter maior para respeitar divisoria visual entre colunas
        whiteoutRight = seg.next_label_x_pct - COLUMN_GUTTER_PCT
      } else if (hasSymmetry) {
        whiteoutRight = Math.min(seg.symmetry_next_x_pct as number, 100) - COLUMN_GUTTER_PCT
      } else {
        // Sem nada delimitando — margem da borda direita da pagina
        whiteoutRight = 100 - COLUMN_GUTTER_PCT
      }

      // Defesa: largura mínima de 1% e nunca negativa. Quando whiteoutRight
      // <= whiteoutLeft (impossível porque margem positiva, mas guarda),
      // marca whiteoutRight = whiteoutLeft + valueMinW (sem ultrapassar).
      let whiteoutWidth = whiteoutRight - whiteoutLeft
      if (whiteoutWidth < valueMinW) {
        // Linha apertada: aceita o mínimo, mas SEM ultrapassar o lado direito
        // permitido (suffix ou nextLabel). Mantém prioridade da LEI 2.
        const allowedMax = whiteoutRight
        whiteoutWidth = Math.max(0, Math.min(valueMinW, allowedMax - whiteoutLeft))
      }
      // Sem sufixo, boundary ou simetria, respeita o limite valueMaxW para
      // nao comer toda a pagina em campos sem next_label.
      if (!hasSuffix && !hasBoundary && !hasSymmetry && seg.next_label_x_pct === null) {
        whiteoutWidth = Math.min(whiteoutWidth, valueMaxW)
      }

      // value_bbox = whiteout_bbox: drawText escreve onde se apagou.
      const valueBbox: Bbox = {
        x_pct: whiteoutLeft,
        y_pct: labelBbox.y_pct,
        w_pct: Math.min(whiteoutWidth, 100 - whiteoutLeft),
        h_pct: labelBbox.h_pct,
      }

      // Texto antigo (já preenchido) — apenas para registro/debug
      const existingValueItems = seg.value_items
      const existingValueText = existingValueItems.length > 0
        ? existingValueItems.map(i => i.str).join(' ').trim()
        : undefined

      // existing_value_bbox = whiteout SEGURO. Por LEI 2, este SEMPRE existe
      // (mesmo em campos vazios — limpa sublinhados/dashes do template original)
      // e SEMPRE respeita a fronteira do label/suffix.
      const existingValueBbox: Bbox = {
        x_pct: whiteoutLeft,
        y_pct: labelBbox.y_pct,
        w_pct: Math.min(whiteoutWidth, 100 - whiteoutLeft),
        h_pct: labelBbox.h_pct,
      }

      // Alinhamento:
      //  • com sufixo OU boundary → center (valor centralizado no espaco delimitado)
      //  • sem ambos + texto antigo → herda do texto antigo
      //  • sem ambos + sem texto → left
      let align: 'left' | 'center' | 'right' = (hasSuffix || hasBoundary) ? 'center' : 'left'
      if (!hasSuffix && !hasBoundary && existingValueItems.length > 0) {
        align = detectAlignment(
          existingValueItems,
          whiteoutLeft,
          whiteoutLeft + whiteoutWidth,
        )
      }

      // Tamanho de fonte estimado: altura do label em pt
      // (page total height_pt corresponde a 100% h_pct; conversão real é feita no consumidor)
      const fontSize_pt_estimate = labelBbox.h_pct

      // PM-3: baseline Y herdada do label original (ou valor antigo, se mais
      // confiavel — o valor antigo TEM o baseline alinhado com o que queremos
      // escrever). Prioridade: existing_value > label.
      const baselineSource = existingValueItems.length > 0
        ? existingValueItems[0]
        : seg.label_items[0]
      const baseline_y_pct = baselineSource.baseline_y_pct

      candidates.push({
        page: line.page,
        label_text: labelText,
        label_normalized: labelNorm,
        label_bbox: labelBbox,
        value_bbox: valueBbox,
        align,
        existing_value_text: existingValueText,
        existing_value_bbox: existingValueBbox,
        font_size_pt: fontSize_pt_estimate,
        baseline_y_pct,
      })
    }
  }

  return candidates
}

// ── Etapa 5: detecção de campos globais (header/footer repetidos) ──────────

export interface GlobalFieldGroup {
  /** Texto normalizado do rótulo */
  label_normalized: string
  /** Páginas onde aparece */
  pages: number[]
  /** Bboxes do label em cada página (mesma ordem que pages) */
  label_bboxes: Bbox[]
  /** Bboxes do valor em cada página */
  value_bboxes: Bbox[]
  /** Y médio normalizado (para identificar header/footer) */
  y_pct_avg: number
  /** Bboxes do texto antigo a apagar (se houver) */
  existing_value_bboxes: (Bbox | undefined)[]
  /** Baselines exatas em cada página (PM-3) */
  baseline_y_pcts: number[]
  /** Alinhamento consenso */
  align: 'left' | 'center' | 'right'
  /** Font size médio em pt */
  font_size_pt: number
}

/**
 * Agrupa candidates por label normalizado. Se o mesmo label aparece em ≥80% das
 * páginas com Y aproximadamente igual (variação ≤3%), considera GLOBAL.
 */
export function detectGlobalFields(
  candidates: LabelCandidate[],
  pageCount: number,
  thresholds: { min_pages_ratio?: number; y_variation_max?: number } = {},
): { globals: GlobalFieldGroup[]; non_globals: LabelCandidate[] } {
  const minRatio = thresholds.min_pages_ratio ?? 0.8
  const yVarMax = thresholds.y_variation_max ?? 3

  // Agrupa por label_normalized
  const byLabel = new Map<string, LabelCandidate[]>()
  for (const c of candidates) {
    if (!byLabel.has(c.label_normalized)) byLabel.set(c.label_normalized, [])
    byLabel.get(c.label_normalized)!.push(c)
  }

  const globals: GlobalFieldGroup[] = []
  const globalIds = new Set<LabelCandidate>()  // referencia direta

  for (const [labelNorm, group] of byLabel) {
    if (group.length < Math.ceil(pageCount * minRatio)) continue

    // Confere variação de Y entre instâncias
    const ys = group.map(c => c.label_bbox.y_pct)
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    if (yMax - yMin > yVarMax) continue

    // Cluster válido: campo global
    globals.push({
      label_normalized: labelNorm,
      pages: group.map(c => c.page),
      label_bboxes: group.map(c => c.label_bbox),
      value_bboxes: group.map(c => c.value_bbox),
      y_pct_avg: ys.reduce((a, b) => a + b, 0) / ys.length,
      existing_value_bboxes: group.map(c => c.existing_value_bbox),
      baseline_y_pcts: group.map(c => c.baseline_y_pct),
      align: group[0].align,
      font_size_pt: group[0].font_size_pt,
    })
    for (const c of group) globalIds.add(c)
  }

  const non_globals = candidates.filter(c => !globalIds.has(c))
  return { globals, non_globals }
}

// ── Etapa 6: API pública wrapper ───────────────────────────────────────────

export interface SniperResult {
  candidates: LabelCandidate[]         // todos os candidates achados
  globals: GlobalFieldGroup[]          // campos repetidos em N páginas
  non_globals: LabelCandidate[]        // campos únicos por página
  stats: {
    total_lines: number
    total_candidates: number
    total_globals: number
    pages_processed: number
  }
}

export function runOcrSniper(
  pdfResult: Pick<PdfPagesResult, 'textItems' | 'dimensions'>,
  opts: SniperOptions = {},
): SniperResult {
  const candidates = snipeLabels(pdfResult.textItems, opts)
  const pageCount = pdfResult.dimensions.length
  const { globals, non_globals } = detectGlobalFields(candidates, pageCount)

  return {
    candidates,
    globals,
    non_globals,
    stats: {
      total_lines: groupByLine(pdfResult.textItems).length,
      total_candidates: candidates.length,
      total_globals: globals.length,
      pages_processed: pageCount,
    },
  }
}
