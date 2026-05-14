'use client'

/**
 * Operacao Zero-Touch — Canvas Eraser.
 *
 * Apaga regioes de um canvas pintando retangulos brancos (ou outra cor) por
 * cima. Usado para LIMPAR PIXELS dos valores antigos e assinaturas do PDF
 * original ANTES de virar PNG de fundo. O label e o sufixo ("Aorta:" e "cm")
 * permanecem intactos porque ja foram excluidos do bbox de erase pelo
 * sniper (LEI 2).
 *
 * Tudo client-side: roda dentro do ImportTemplateModal apos o `pdfjs.render`.
 */

/** Regiao a apagar — em % das dimensoes do canvas (top-left origin). */
export interface EraseRect {
  x_pct: number
  y_pct: number
  w_pct: number
  h_pct: number
}

/**
 * Pinta retangulos brancos sobre `regions` no canvas. Sem efeito se o
 * contexto 2D nao estiver disponivel.
 *
 * Por seguranca, clampa cada retangulo para dentro dos bounds do canvas e
 * adiciona 1px de "bleed" para garantir cobertura contra antialiasing.
 */
export function eraseRegions(
  canvas: HTMLCanvasElement,
  regions: EraseRect[],
  color = '#ffffff',
): number {
  const ctx = canvas.getContext('2d')
  if (!ctx || regions.length === 0) return 0
  ctx.save()
  ctx.fillStyle = color
  let painted = 0
  for (const r of regions) {
    if (r.w_pct <= 0 || r.h_pct <= 0) continue
    const xPx = (r.x_pct / 100) * canvas.width
    const yPx = (r.y_pct / 100) * canvas.height
    const wPx = (r.w_pct / 100) * canvas.width
    const hPx = (r.h_pct / 100) * canvas.height
    // Bleed de 1px ao redor para anti-aliasing
    const x = Math.max(0, Math.floor(xPx) - 1)
    const y = Math.max(0, Math.floor(yPx) - 1)
    const w = Math.min(canvas.width - x, Math.ceil(wPx) + 2)
    const h = Math.min(canvas.height - y, Math.ceil(hPx) + 2)
    if (w > 0 && h > 0) {
      ctx.fillRect(x, y, w, h)
      painted++
    }
  }
  ctx.restore()
  return painted
}

/**
 * Converte um canvas em Blob PNG (sem perdas).
 * Lanca se a conversao falhar.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new Error('canvas.toBlob retornou null')),
      'image/png',
    )
  })
}

/**
 * Calculo puro de pixels — exportado para teste sem precisar de canvas DOM.
 *
 * Aplica a mesma matematica usada por eraseRegions (clamp + bleed). Retorna
 * { x, y, w, h } em pixels, ou null se a regiao for invalida (fora dos
 * bounds ou degenerada).
 */
export function rectPctToPixelsClamped(
  rect: EraseRect,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; w: number; h: number } | null {
  if (rect.w_pct <= 0 || rect.h_pct <= 0) return null
  const xPx = (rect.x_pct / 100) * canvasWidth
  const yPx = (rect.y_pct / 100) * canvasHeight
  const wPx = (rect.w_pct / 100) * canvasWidth
  const hPx = (rect.h_pct / 100) * canvasHeight
  const x = Math.max(0, Math.floor(xPx) - 1)
  const y = Math.max(0, Math.floor(yPx) - 1)
  const w = Math.min(canvasWidth - x, Math.ceil(wPx) + 2)
  const h = Math.min(canvasHeight - y, Math.ceil(hPx) + 2)
  if (w <= 0 || h <= 0) return null
  return { x, y, w, h }
}
