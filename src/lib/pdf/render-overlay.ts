/**
 * Renderizacao de overlays sobre paginas pdf-lib.
 *
 * Modulo PURO (sem Supabase nem `use server`) — pode ser testado isoladamente
 * e reusado em qualquer caminho que precise desenhar overlays.
 *
 * Padrao DocuSign: cada overlay aplica WHITEOUT (retangulo branco) antes do
 * drawText para apagar dados pre-preenchidos do PDF original do cliente
 * (textos de exemplo, valores fake nas linhas pontilhadas, etc).
 */

import { rgb } from 'pdf-lib'
import type { PDFPage, PDFFont } from 'pdf-lib'
import {
  overlayToDrawTextPoint, overlayToPdfBox,
  type PageDimensions,
} from './coordinate-system'
import type { LayoutOverlay } from '@/types'

// ── Word-wrap ───────────────────────────────────────────────────────────────

interface FontWidthMeasurer {
  widthOfTextAtSize: (s: string, size: number) => number
}

export function wrapTextToWidth(
  text: string,
  font: FontWidthMeasurer,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return []
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text]

  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = ''
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk); chunk = ch
          } else chunk += ch
        }
        current = chunk
      } else current = w
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── Main: applyOverlayToPage ───────────────────────────────────────────────

export interface ApplyOverlayOptions {
  helvetica: PDFFont
  helveticaBold: PDFFont
}

/**
 * Desenha um retangulo branco no bbox do overlay (whiteout) e em seguida
 * escreve o texto. Whiteout pode ser desativado por overlay setando
 * `overlay.whiteout = false`.
 */
export function applyOverlayToPage(
  page: PDFPage,
  overlay: LayoutOverlay,
  text: string,
  fonts: ApplyOverlayOptions,
  pageDim: PageDimensions,
): void {
  const font = overlay.font_weight === 'bold' ? fonts.helveticaBold : fonts.helvetica
  const fontSize_pt = overlay.font_size

  // ── Whiteout: apaga conteudo embaixo do overlay (default ON) ──────────
  // PRIORIDADE: se whiteout_bbox estiver definida (vinda do OCR Sniper com
  // a posicao EXATA do texto antigo), usa ela — mais cirurgico que o bbox
  // do overlay (que pode ter sido redimensionado pelo usuario).
  const shouldWhiteout = overlay.whiteout !== false
  if (shouldWhiteout) {
    const whiteoutRect = overlay.whiteout_bbox ?? {
      x_pct: overlay.x_pct,
      y_pct: overlay.y_pct,
      w_pct: overlay.w_pct,
      h_pct: overlay.h_pct,
    }
    const box = overlayToPdfBox(whiteoutRect, pageDim)
    const MARGIN_PT = 1
    try {
      page.drawRectangle({
        x: Math.max(0, box.x - MARGIN_PT),
        y: Math.max(0, box.y - MARGIN_PT),
        width:  Math.min(pageDim.width_pt,  box.width  + MARGIN_PT * 2),
        height: Math.min(pageDim.height_pt, box.height + MARGIN_PT * 2),
        color: rgb(1, 1, 1),
        opacity: 1,
      })
    } catch (e) {
      console.warn('[applyOverlayToPage] whiteout falhou:', overlay.field_name ?? overlay.id, e)
    }
  }

  // ── drawText com word-wrap ────────────────────────────────────────────
  const maxWidth_pt = (overlay.w_pct / 100) * pageDim.width_pt
  const lines = wrapTextToWidth(
    text,
    { widthOfTextAtSize: (s, sz) => font.widthOfTextAtSize(s, sz) },
    fontSize_pt,
    maxWidth_pt,
  )

  const lineHeight_pt = fontSize_pt * 1.2
  const align = overlay.text_align ?? 'left'

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const textWidth_pt = font.widthOfTextAtSize(line, fontSize_pt)
    const rect = {
      x_pct: overlay.x_pct,
      y_pct: overlay.y_pct + (li * lineHeight_pt / pageDim.height_pt) * 100,
      w_pct: overlay.w_pct,
      h_pct: overlay.h_pct,
    }
    let point = overlayToDrawTextPoint(
      rect, pageDim,
      { size_pt: fontSize_pt, family: 'Helvetica' },
      align, textWidth_pt,
    )
    // PM-3: se o overlay carrega a baseline EXATA do texto original (vinda do
    // OCR Sniper), usa essa baseline em vez da calculada via ascenderRatio.
    // Sem isso, a baseline da fonte Helvetica nova diverge da fonte original
    // do PDF e o texto fica acima/abaixo da linha pontilhada.
    if (typeof overlay.baseline_y_pct === 'number' && li === 0) {
      const baselineFromTop_pt = (overlay.baseline_y_pct / 100) * pageDim.height_pt
      const baselineY_bottomOrigin = pageDim.height_pt - baselineFromTop_pt
      point = { x: point.x, y: baselineY_bottomOrigin }
    } else if (typeof overlay.baseline_y_pct === 'number' && li > 0) {
      // Linhas subsequentes: desloca a baseline original em lineHeight para baixo
      const baselineFromTop_pt = (overlay.baseline_y_pct / 100) * pageDim.height_pt + li * lineHeight_pt
      const baselineY_bottomOrigin = pageDim.height_pt - baselineFromTop_pt
      point = { x: point.x, y: baselineY_bottomOrigin }
    }
    try {
      page.drawText(line, {
        x: point.x, y: point.y, size: fontSize_pt, font, color: rgb(0, 0, 0),
      })
    } catch (drawErr) {
      console.warn('[applyOverlayToPage] drawText falhou:', overlay.field_name ?? overlay.id, drawErr)
    }
  }
}
