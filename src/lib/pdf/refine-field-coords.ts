/**
 * Refinamento de coordenadas: alinha as coordenadas APROXIMADAS retornadas
 * pela Vision API com as coordenadas EXATAS extraidas do textContent do PDF
 * via pdfjs-dist.
 *
 * Por que isso?
 *   - Vision API retorna posicoes estimadas com erro tipico de 3-5% (~30px num A4)
 *   - pdfjs.getTextContent extrai o texto NATIVO do PDF com coords sub-pixel
 *   - Combinando: Vision detecta QUAIS campos existem; pdfjs diz ONDE estao
 *
 * Estrategia:
 *   1. Para cada field detectado pela IA, procura sua `label` nos textItems
 *   2. Normaliza ambos (remove ":", lowercase, trim, sem acentos)
 *   3. Tenta match exato, depois "label contem text" ou "text contem label"
 *   4. Tenta sequencias multi-token (label = varias palavras)
 *   5. Se acha: posiciona o VALOR a direita do label (mesma linha) com coords exatas
 *   6. Se nao acha: mantem o que a Vision disse (fallback)
 */

import type { ExtractedField } from '@/types'
import type { PdfTextItem } from '../pdf-to-images'

// ── Normalizacao ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[:\.,;\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Agrupamento por linha ───────────────────────────────────────────────────

/**
 * Agrupa text items por linha (mesma pagina + Y proximo).
 * pdfjs retorna texto fragmentado (cada glifo/palavra um item) — precisamos
 * reagrupar para fazer match com labels multi-palavra.
 */
interface TextLine {
  page: number
  items: PdfTextItem[]
  joinedText: string        // texto concatenado normalizado
  x_pct: number             // left do primeiro item
  y_pct: number             // top minimo dos items
  w_pct: number             // soma das larguras (do primeiro ao ultimo)
  h_pct: number             // max altura dos items
}

function groupByLine(textItems: PdfTextItem[]): TextLine[] {
  // Agrupa por (page, faixa_de_y). Tolerancia: items na mesma linha tem y
  // tipicamente diferindo em <1% (depende do font-size).
  const TOLERANCE_PCT = 0.8

  const byPage = new Map<number, PdfTextItem[]>()
  for (const it of textItems) {
    if (!byPage.has(it.page)) byPage.set(it.page, [])
    byPage.get(it.page)!.push(it)
  }

  const lines: TextLine[] = []
  for (const [page, items] of byPage) {
    // Ordena por Y (top), depois X
    const sorted = [...items].sort((a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct)
    let current: PdfTextItem[] = []
    let currentY: number | null = null

    const flush = () => {
      if (current.length === 0) return
      // Items podem nao estar ordenados horizontalmente; reordena
      current.sort((a, b) => a.x_pct - b.x_pct)
      const xMin = current[0].x_pct
      const xMaxEnd = Math.max(...current.map(i => i.x_pct + i.w_pct))
      const yMin = Math.min(...current.map(i => i.y_pct))
      const hMax = Math.max(...current.map(i => i.h_pct))
      lines.push({
        page,
        items: current.slice(),
        joinedText: normalize(current.map(i => i.str).join(' ')),
        x_pct: xMin,
        y_pct: yMin,
        w_pct: xMaxEnd - xMin,
        h_pct: hMax,
      })
      current = []
    }

    for (const it of sorted) {
      if (currentY === null || Math.abs(it.y_pct - currentY) <= TOLERANCE_PCT) {
        current.push(it)
        currentY = currentY === null ? it.y_pct : (currentY + it.y_pct) / 2 // media movel
      } else {
        flush()
        current = [it]
        currentY = it.y_pct
      }
    }
    flush()
  }
  return lines
}

// ── Match: encontra a label no textContent ──────────────────────────────────

interface LabelMatch {
  line: TextLine
  labelEndX_pct: number  // X onde o label termina (inicio do VALOR)
  labelTopY_pct: number  // Y do topo do label (= topo do VALOR)
  labelHeight_pct: number // altura do label (= altura aprox do VALOR)
}

function findLabelInLines(label: string, lines: TextLine[]): LabelMatch | null {
  const target = normalize(label)
  if (!target) return null
  const targetTokens = target.split(' ').filter(Boolean)

  // Estrategia 1: linha INTEIRA contem o label normalizado
  for (const line of lines) {
    if (line.joinedText.includes(target)) {
      // Encontra os items que cobrem o label dentro da linha
      // Reune subsequencia de items cujo texto concatenado contem o target
      const itemsNorm = line.items.map(i => normalize(i.str))
      // Tenta achar a janela de tamanho minimo
      for (let start = 0; start < line.items.length; start++) {
        for (let end = start; end < line.items.length; end++) {
          const window = itemsNorm.slice(start, end + 1).join(' ').trim()
          if (window.includes(target)) {
            const winItems = line.items.slice(start, end + 1)
            const lastItem = winItems[winItems.length - 1]
            return {
              line,
              labelEndX_pct: lastItem.x_pct + lastItem.w_pct,
              labelTopY_pct: Math.min(...winItems.map(i => i.y_pct)),
              labelHeight_pct: Math.max(...winItems.map(i => i.h_pct)),
            }
          }
        }
      }
      // Se nao isolou janela mais curta, usa a linha inteira
      return {
        line,
        labelEndX_pct: line.x_pct + line.w_pct,
        labelTopY_pct: line.y_pct,
        labelHeight_pct: line.h_pct,
      }
    }
  }

  // Estrategia 2: primeira palavra do label aparece em uma linha
  if (targetTokens.length > 0) {
    const head = targetTokens[0]
    for (const line of lines) {
      if (line.joinedText.startsWith(head + ' ') || line.joinedText === head || line.joinedText.startsWith(head)) {
        // Aceita match parcial: posiciona o VALOR ao final da linha (apos toda a label)
        return {
          line,
          labelEndX_pct: line.x_pct + line.w_pct,
          labelTopY_pct: line.y_pct,
          labelHeight_pct: line.h_pct,
        }
      }
    }
  }

  return null
}

// ── API publica ─────────────────────────────────────────────────────────────

export interface RefineResult {
  refined: ExtractedField[]
  stats: {
    total: number
    refined_count: number
    fallback_count: number
  }
}

/**
 * Refina as coordenadas dos fields combinando a deteccao semantica da Vision
 * com a posicao exata extraida pelo pdfjs. Para cada field cuja label foi
 * achada no textContent, substitui x_percent/y_percent pelas coords reais.
 */
export function refineFieldsWithPdfText(
  fields: ExtractedField[],
  textItems: PdfTextItem[],
): RefineResult {
  if (!textItems || textItems.length === 0) {
    return { refined: fields, stats: { total: fields.length, refined_count: 0, fallback_count: fields.length } }
  }

  const lines = groupByLine(textItems)
  const linesByPage = new Map<number, TextLine[]>()
  for (const l of lines) {
    if (!linesByPage.has(l.page)) linesByPage.set(l.page, [])
    linesByPage.get(l.page)!.push(l)
  }

  let refinedCount = 0
  let fallbackCount = 0

  const refined = fields.map(f => {
    const page = f.page ?? 0
    const pageLines = linesByPage.get(page) ?? []
    const match = findLabelInLines(f.label, pageLines)

    if (!match) {
      fallbackCount++
      return f
    }

    // VALOR comeca apos o label, mesma linha. Pequeno gap horizontal (0.8%).
    const HORIZONTAL_GAP_PCT = 0.8
    const valueX = Math.min(match.labelEndX_pct + HORIZONTAL_GAP_PCT, 95)
    const valueY = match.labelTopY_pct

    // Width: preserva o que a Vision sugeriu, mas garante minimo razoavel
    const valueWidth = Math.max(f.width_percent ?? 20, 15)

    // Height: usa a altura medida do label (+ pequena folga para descender)
    const valueHeight = match.labelHeight_pct * 1.15

    refinedCount++
    return {
      ...f,
      x_percent: valueX,
      y_percent: valueY,
      width_percent: Math.min(valueWidth, 100 - valueX),
      height_percent: Math.max(valueHeight, 1.5),
    }
  })

  return {
    refined,
    stats: { total: fields.length, refined_count: refinedCount, fallback_count: fallbackCount },
  }
}
