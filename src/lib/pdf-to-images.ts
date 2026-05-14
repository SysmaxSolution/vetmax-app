'use client'

import type { PageDimensionsRecord } from '@/types'

/**
 * Item de texto extraido do PDF nativo via pdfjs.getTextContent().
 * Coordenadas em % (top-left origin) relativas a pagina, para alinhar com
 * o sistema de overlays do editor pixel-perfect.
 */
export interface PdfTextItem {
  str: string                  // string crua extraida
  page: number                 // 0-based
  x_pct: number                // left em %
  y_pct: number                // top em %
  w_pct: number                // largura em %
  h_pct: number                // altura em %
  // BASELINE Y do texto original em % do TOPO da pagina (top-left origin).
  // Usado pelo motor pdf-lib para alinhar drawText exatamente na baseline
  // do texto original — evita drift vertical entre fontes diferentes.
  baseline_y_pct: number
}

export interface PdfPagesResult {
  images: string[]                      // base64 data URLs (uma por pagina)
  dimensions: PageDimensionsRecord[]    // dimensoes em PDF points (uma por pagina)
  textItems: PdfTextItem[]              // texto nativo extraido com coordenadas exatas
}

/**
 * Converte um PDF em (a) imagens base64 para preview/editor, (b) dimensoes
 * exatas em PDF points e (c) texto nativo com coordenadas exatas (pdfjs).
 *
 * Os textItems sao usados no refinamento pos-Vision: a IA detecta QUAIS sao
 * os campos, mas as coordenadas EXATAS das labels vem do textContent do PDF.
 */
export async function pdfToImages(
  file: File,
  scale = 2 // 2x para qualidade
): Promise<PdfPagesResult> {
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []
  const dimensions: PageDimensionsRecord[] = []
  const textItems: PdfTextItem[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)

    // 1. Dimensoes em PDF points (scale=1)
    const baseViewport = page.getViewport({ scale: 1 })
    const pageW = baseViewport.width
    const pageH = baseViewport.height
    dimensions.push({ width_pt: pageW, height_pt: pageH })

    // 2. Render em alta resolucao para preview
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    images.push(dataUrl)

    // 3. Text content nativo do PDF — coordenadas exatas
    try {
      const tc = await page.getTextContent()
      for (const raw of tc.items as any[]) {
        if (!raw.str || !raw.str.trim()) continue
        // transform: [scaleX, skewY, skewX, scaleY, x, y] — origem bottom-left
        const tr = raw.transform as number[]
        if (!tr || tr.length < 6) continue
        const x_pt = tr[4]
        const y_pt = tr[5]                    // baseline (bottom-left do glyph)
        const w_pt = raw.width ?? 0
        const h_pt = raw.height ?? Math.abs(tr[3])
        // Converte para top-left (Y invertido para o sistema do editor)
        // y_pt eh a baseline; o topo do texto fica em y_pt + h_pt
        const top_pt = pageH - (y_pt + h_pt)
        // Baseline em % from top: pageH - y_pt e a distancia da baseline ao topo
        const baseline_pct = ((pageH - y_pt) / pageH) * 100
        textItems.push({
          str: raw.str,
          page: i - 1,
          x_pct: (x_pt / pageW) * 100,
          y_pct: (top_pt / pageH) * 100,
          w_pct: (w_pt / pageW) * 100,
          h_pct: (h_pt / pageH) * 100,
          baseline_y_pct: baseline_pct,
        })
      }
    } catch (e) {
      console.warn(`[pdfToImages] textContent falhou na pagina ${i}:`, e)
    }
  }

  return { images, dimensions, textItems }
}
