/**
 * Coordinate System — Operação Pixel Perfect
 *
 * Única fonte da verdade para conversões entre:
 *   • Percentual relativo à página (storage: layout_overlays.x_pct/y_pct/w_pct/h_pct)
 *   • CSS pixels (browser: editor + preview)
 *   • PDF points (pdf-lib: geração final, origem bottom-left)
 *
 * INVARIANTES:
 *   - x_pct, y_pct sempre 0..100, do CANTO SUPERIOR ESQUERDO do overlay
 *   - w_pct, h_pct sempre 0..100, % da página
 *   - PDF points origem bottom-left (padrão PDF)
 *   - drawText anchor: baseline-left
 */

// ── Page dimensions em PDF points ──────────────────────────────────────────

export const PDF_PAGE = {
  A4_PORTRAIT:  { width_pt: 595.28, height_pt: 841.89 },
  A4_LANDSCAPE: { width_pt: 841.89, height_pt: 595.28 },
  LETTER:       { width_pt: 612.00, height_pt: 792.00 },
  LEGAL:        { width_pt: 612.00, height_pt: 1008.00 },
} as const

export type PageDimensions = { width_pt: number; height_pt: number }

// ── Tipos do overlay (alinhado com layout_overlays JSONB) ─────────────────

export type OverlayRect = {
  x_pct: number   // 0..100 — top-left X em % da largura da página
  y_pct: number   // 0..100 — top-left Y em % da altura da página
  w_pct: number   // 0..100 — largura em % da largura da página
  h_pct: number   // 0..100 — altura em % da altura da página
}

export type FontMetrics = {
  size_pt: number
  ascender_ratio?: number  // padrão 0.78 (Helvetica/Times)
  family?: 'Helvetica' | 'Times' | 'Courier'
}

// Ascender ratio aproximado por família (proporção do tamanho da fonte
// que fica ACIMA da baseline). Valores tirados das tabelas Adobe Type 1.
const ASCENDER_BY_FAMILY: Record<NonNullable<FontMetrics['family']>, number> = {
  Helvetica: 0.718,
  Times:     0.683,
  Courier:   0.629,
}

export function ascenderRatio(font: FontMetrics): number {
  if (typeof font.ascender_ratio === 'number') return font.ascender_ratio
  if (font.family) return ASCENDER_BY_FAMILY[font.family]
  return 0.718
}

// ── % → CSS px ─────────────────────────────────────────────────────────────

/**
 * Converte um OverlayRect em estilo CSS para posicionamento absoluto
 * dentro de um container que tem o aspecto da página A4 (ou outra).
 *
 * O container deve ter `position: relative` e tamanho conhecido para o cálculo
 * de fontSize escalar — para layouts puramente em %, retornamos % também.
 */
export type CssRectStyle = {
  position: 'absolute'
  left: string
  top: string
  width: string
  height: string
}

export function pctRectToCssStyle(rect: OverlayRect): CssRectStyle {
  return {
    position: 'absolute',
    left:   `${rect.x_pct}%`,
    top:    `${rect.y_pct}%`,
    width:  `${rect.w_pct}%`,
    height: `${rect.h_pct}%`,
  }
}

/**
 * Quando precisamos de pixels concretos (ex: passar para react-rnd que
 * trabalha em px), use esta com o tamanho atual renderizado do container.
 */
export function pctRectToPixelRect(
  rect: OverlayRect,
  container: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x:      (rect.x_pct / 100) * container.width,
    y:      (rect.y_pct / 100) * container.height,
    width:  (rect.w_pct / 100) * container.width,
    height: (rect.h_pct / 100) * container.height,
  }
}

export function pixelRectToPctRect(
  pixelRect: { x: number; y: number; width: number; height: number },
  container: { width: number; height: number },
): OverlayRect {
  return {
    x_pct: clamp((pixelRect.x      / container.width)  * 100, 0, 100),
    y_pct: clamp((pixelRect.y      / container.height) * 100, 0, 100),
    w_pct: clamp((pixelRect.width  / container.width)  * 100, 0, 100),
    h_pct: clamp((pixelRect.height / container.height) * 100, 0, 100),
  }
}

// ── % → PDF points (pdf-lib drawText) ──────────────────────────────────────

/**
 * Converte coordenadas % de um overlay para os argumentos `x`/`y` esperados
 * pelo `page.drawText` do pdf-lib (baseline-left, origem bottom-left).
 *
 * INTERVENCAO CIRURGICA: a baseline eh DERIVADA do bbox do overlay
 * usando `y_pct + h_pct` (em coords top-down) — esse valor coincide com
 * a baseline original do texto reportado pelo pdfjs:
 *
 *   bbox_top = pageH - (baseline + h)      ← top-left storage
 *   baseline = pageH - (top_pct + h_pct) * pageH / 100
 *
 * Esse calculo eh CORRETO independente do fontSize usado no drawText,
 * porque depende apenas do bbox original. O calculo antigo `top +
 * fontSize * ascender_ratio` falhava quando fontSize gerado != fontSize
 * original (ex: signatures capadas em 11pt mas h_pct original era 1.539%
 * = 12.96pt).
 *
 * O parametro `font` permanece para compatibilidade com codigo legacy mas
 * nao influencia mais a baseline.
 */
export function overlayToDrawTextPoint(
  rect: OverlayRect,
  page: PageDimensions,
  _font: FontMetrics,
  align: 'left' | 'center' | 'right' = 'left',
  textWidth_pt = 0,
): { x: number; y: number } {
  const overlay_left_pt   = (rect.x_pct / 100) * page.width_pt
  const overlay_width_pt  = (rect.w_pct / 100) * page.width_pt

  // Baseline derivada do bbox: posicao do fundo tipografico em coords pdf
  const baseline_from_top_pt = (rect.y_pct + rect.h_pct) / 100 * page.height_pt
  const y_from_bottom_pt = page.height_pt - baseline_from_top_pt

  let x_pt = overlay_left_pt
  if (align === 'center') {
    x_pt = overlay_left_pt + (overlay_width_pt - textWidth_pt) / 2
  } else if (align === 'right') {
    x_pt = overlay_left_pt + (overlay_width_pt - textWidth_pt)
  }

  return { x: x_pt, y: y_from_bottom_pt }
}

/**
 * Caixa do overlay em PDF points — útil para drawRectangle/drawImage
 * (ex: logo, assinatura). pdf-lib usa origem bottom-left para o RETÂNGULO
 * também: `{ x, y, width, height }` onde `(x, y)` é o canto INFERIOR esquerdo.
 */
export function overlayToPdfBox(
  rect: OverlayRect,
  page: PageDimensions,
): { x: number; y: number; width: number; height: number } {
  const width_pt  = (rect.w_pct / 100) * page.width_pt
  const height_pt = (rect.h_pct / 100) * page.height_pt
  const left_pt   = (rect.x_pct / 100) * page.width_pt
  const top_pt    = (rect.y_pct / 100) * page.height_pt
  const bottom_pt = page.height_pt - top_pt - height_pt

  return { x: left_pt, y: bottom_pt, width: width_pt, height: height_pt }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Converte um tamanho em pixels (no editor renderizado) para points (PDF).
 * Útil quando o usuário ajusta fontSize visualmente no editor.
 *
 * O container do editor desenha o PDF inteiro em N pixels de largura.
 * Logo: 1px = (page.width_pt / containerWidth_px) points.
 */
export function pxToPt(px: number, containerWidth_px: number, page: PageDimensions): number {
  return px * (page.width_pt / containerWidth_px)
}

export function ptToPx(pt: number, containerWidth_px: number, page: PageDimensions): number {
  return pt * (containerWidth_px / page.width_pt)
}

/**
 * Detecta orientação a partir das dimensões e retorna o preset.
 */
export function detectPagePreset(dim: PageDimensions): keyof typeof PDF_PAGE | 'CUSTOM' {
  const within = (a: number, b: number, tol = 1) => Math.abs(a - b) < tol
  if (within(dim.width_pt, 595.28) && within(dim.height_pt, 841.89)) return 'A4_PORTRAIT'
  if (within(dim.width_pt, 841.89) && within(dim.height_pt, 595.28)) return 'A4_LANDSCAPE'
  if (within(dim.width_pt, 612.00) && within(dim.height_pt, 792.00)) return 'LETTER'
  if (within(dim.width_pt, 612.00) && within(dim.height_pt, 1008.00)) return 'LEGAL'
  return 'CUSTOM'
}
