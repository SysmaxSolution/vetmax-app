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
  /** Data URLs PNG por pagina — preview no editor. */
  images: string[]
  /** Canvases brutos. Operacao Zero-Touch: passamos por eraseRegions antes
   *  de virarem PNG de fundo limpo. Pode estar [] se `keepCanvases=false`. */
  canvases: HTMLCanvasElement[]
  dimensions: PageDimensionsRecord[]
  textItems: PdfTextItem[]
}

export interface PdfToImagesOptions {
  /**
   * Escala de renderizacao. scale=4.17 corresponde a ~300 DPI (4.17 × 72).
   * Default 4.17 para qualidade de impressao Enterprise.
   */
  scale?: number
  /**
   * Mantem as referencias aos HTMLCanvasElement para que o caller possa
   * pintar retangulos brancos (canvas-eraser) antes de virar PNG final.
   * Default false (memoria solta apos render).
   */
  keepCanvases?: boolean
  /**
   * Formato da preview data URL. Operacao Zero-Touch usa PNG para nao
   * perder dados nas bordas de erase. Default 'png'.
   */
  previewFormat?: 'png' | 'jpeg'
}

const DEFAULT_SCALE_300DPI = 300 / 72   // 4.166...

/**
 * Renderiza cada pagina do PDF em canvas alta resolucao e extrai o
 * textContent nativo (com coordenadas exatas).
 */
export async function pdfToImages(
  file: File,
  opts: PdfToImagesOptions | number = {},
): Promise<PdfPagesResult> {
  // Backwards compat: pdfToImages(file, scale) ainda funciona
  const optsObj: PdfToImagesOptions = typeof opts === 'number'
    ? { scale: opts }
    : opts
  const scale = optsObj.scale ?? DEFAULT_SCALE_300DPI
  const keepCanvases = optsObj.keepCanvases ?? false
  const previewFormat = optsObj.previewFormat ?? 'png'

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []
  const canvases: HTMLCanvasElement[] = []
  const dimensions: PageDimensionsRecord[] = []
  const textItems: PdfTextItem[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)

    // 1. Dimensoes em PDF points (scale=1)
    const baseViewport = page.getViewport({ scale: 1 })
    const pageW = baseViewport.width
    const pageH = baseViewport.height
    dimensions.push({ width_pt: pageW, height_pt: pageH })

    // 2. Render em alta resolucao
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

    const mime = previewFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
    const quality = previewFormat === 'jpeg' ? 0.92 : undefined
    const dataUrl = canvas.toDataURL(mime, quality)
    images.push(dataUrl)
    if (keepCanvases) canvases.push(canvas)

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
        const top_pt = pageH - (y_pt + h_pt)
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

  return { images, canvases, dimensions, textItems }
}
