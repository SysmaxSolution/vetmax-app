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

function bboxFromItems(items: PdfTextItem[]): Bbox {
  if (items.length === 0) return { x_pct: 0, y_pct: 0, w_pct: 0, h_pct: 0 }
  const xMin = Math.min(...items.map(i => i.x_pct))
  const yMin = Math.min(...items.map(i => i.y_pct))
  const xMaxEnd = Math.max(...items.map(i => i.x_pct + i.w_pct))
  const yMaxEnd = Math.max(...items.map(i => i.y_pct + i.h_pct))
  return { x_pct: xMin, y_pct: yMin, w_pct: xMaxEnd - xMin, h_pct: yMaxEnd - yMin }
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
}

/**
 * Detecta se um item ou sequência forma um label.
 * Critério primário: texto termina com ':'
 * Critério secundário: bate com vocabulário conhecido (boost).
 */
function isLabelEnding(text: string): boolean {
  return /[:][\s]*$/.test(text.trim())
}

function isLabelVocab(text: string): boolean {
  return VET_LABEL_VOCABULARY.has(normalizeLabel(text))
}

/**
 * Para uma linha (sequência de items), encontra todos os labels e segmenta.
 * Retorna array de {label, value, nextLabelX}.
 */
function segmentLine(line: LineGroup): LineSegmentation[] {
  const items = line.items
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

    const valueItems = items.slice(valueStartIdx, nextLabelStartIdx)
    const nextLabelX = li + 1 < labelEnds.length
      ? items[nextLabelStartIdx].x_pct
      : null

    segments.push({
      label_items: labelItems,
      value_items: valueItems,
      next_label_x_pct: nextLabelX,
    })
    labelStartIdx = nextLabelStartIdx
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

      // Largura do VALOR: do fim do label até o próximo label OU 100% da página
      // OU valueMaxW (limite superior). Min: valueMinW.
      const valueStartX = labelBbox.x_pct + labelBbox.w_pct + margin
      const valueEndX_max = seg.next_label_x_pct !== null
        ? seg.next_label_x_pct - margin
        : 100
      const valueWidthRaw = valueEndX_max - valueStartX
      const valueWidth = Math.max(valueMinW, Math.min(valueWidthRaw, valueMaxW))

      // BBOX do valor dinâmico (onde drawText vai escrever)
      const valueBbox: Bbox = {
        x_pct: valueStartX,
        y_pct: labelBbox.y_pct,
        w_pct: Math.min(valueWidth, 100 - valueStartX),
        h_pct: labelBbox.h_pct,
      }

      // Texto antigo (já preenchido) no campo
      const existingValueItems = seg.value_items
      let existingValueBbox: Bbox | undefined
      let existingValueText: string | undefined
      let align: 'left' | 'center' | 'right' = 'left'

      if (existingValueItems.length > 0) {
        existingValueBbox = bboxFromItems(existingValueItems)
        existingValueText = existingValueItems.map(i => i.str).join(' ').trim()
        align = detectAlignment(
          existingValueItems,
          valueStartX,
          valueStartX + valueWidth,
        )
      }

      // Tamanho de fonte estimado: altura do label em pt
      // (page total height_pt corresponde a 100% h_pct; conversão real é feita no consumidor)
      const fontSize_pt_estimate = labelBbox.h_pct

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
