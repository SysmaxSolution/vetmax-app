'use client'

import type { PageDimensionsRecord } from '@/types'

export interface PdfPagesResult {
  images: string[]                      // base64 data URLs (uma por pagina)
  dimensions: PageDimensionsRecord[]    // dimensoes em PDF points (uma por pagina)
}

/**
 * Converte um PDF em (a) imagens base64 para preview/editor e (b) dimensoes
 * exatas em PDF points para que o motor pdf-lib use o sistema de coordenadas
 * correto na geracao final.
 *
 * pdfjs-dist usa scale-1 viewport em PDF points (origem top-left). Logo a
 * dimensao em points e exatamente `getViewport({ scale: 1 }).width/height`.
 */
export async function pdfToImages(
  file: File,
  scale = 2 // 2x para qualidade
): Promise<PdfPagesResult> {
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []
  const dimensions: PageDimensionsRecord[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)

    // 1. Dimensoes em PDF points (scale=1)
    const baseViewport = page.getViewport({ scale: 1 })
    dimensions.push({
      width_pt: baseViewport.width,
      height_pt: baseViewport.height,
    })

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
  }

  return { images, dimensions }
}
