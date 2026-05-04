'use client'

/**
 * Converts a PDF file to an array of base64 PNG images (one per page).
 * Uses pdfjs-dist in the browser — no server-side dependencies needed.
 */
export async function pdfToImages(
  file: File,
  scale = 2 // 2x for good quality
): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist')

  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

    // Convert to JPEG for smaller size (quality 0.85)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    // Strip the data:image/jpeg;base64, prefix
    images.push(dataUrl)
  }

  return images
}
