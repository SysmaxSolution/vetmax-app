'use client'

/**
 * IC-23/24: Conversao client-side de HTML (vindo de DOCX/mammoth) em PDF.
 *
 * Versao 2 — usa html2canvas DIRETO + pdf-lib para controle total da
 * paginacao. Versao 1 usava jsPDF.html() que paginava errado (gerava
 * 13 paginas para 1 pagina A4 do Word).
 *
 * Fluxo:
 *   1. Cria iframe oculto A4 com o HTML (sem min-height forcado)
 *   2. Aguarda fontes/imagens carregarem
 *   3. html2canvas captura o body INTEIRO (qualquer altura)
 *   4. Calcula quantas paginas A4 sao necessarias (altura/297mm)
 *   5. Para cada pagina, recorta uma "fatia" da imagem e desenha em PDF A4
 */

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

// CSS aplicado dentro do iframe — A4 portrait com margens tipicas Word
const A4_STYLES = `
  html, body { margin: 0; padding: 0; }
  body {
    width: ${A4_WIDTH_MM}mm;
    padding: 20mm 20mm;
    background: white;
    color: #000;
    font-family: 'Calibri', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    box-sizing: border-box;
  }
  p { margin: 0 0 6pt 0; }
  h1, h2, h3 { margin: 12pt 0 6pt 0; font-weight: bold; }
  h1.title { font-size: 18pt; text-align: center; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
  td, th { padding: 4pt 6pt; border: 1px solid #999; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  /* Remove fundos azuis de Content Controls do Word */
  span[style*="background-color"] { background-color: transparent !important; }
`

/**
 * Renderiza HTML em iframe oculto e converte para PDF preservando o numero
 * correto de paginas A4 baseado na altura real do conteudo.
 */
export async function convertHtmlToPdfFile(
  html: string,
  baseName = 'documento',
): Promise<File> {
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const fullDoc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>${A4_STYLES}</style>
</head>
<body>${cleanHtml}</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = `${A4_WIDTH_MM}mm`
  // SEM min-height — deixa o conteudo definir a altura real
  iframe.style.height = 'auto'
  iframe.style.border = '0'
  iframe.style.background = 'white'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('iframe sem contentDocument')
    doc.open()
    doc.write(fullDoc)
    doc.close()

    // Aguarda render + imagens
    await new Promise(r => setTimeout(r, 500))
    const imgs = Array.from(doc.images)
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>(res => {
        const done = () => res()
        img.onload = done
        img.onerror = done
      })
    }))
    // Buffer extra para garantir layout final
    await new Promise(r => setTimeout(r, 300))

    // Dimensiona iframe para conter o body completo (necessario para html2canvas)
    const body = doc.body
    const contentHeight = Math.max(body.scrollHeight, body.offsetHeight, body.clientHeight)
    const contentWidth = Math.max(body.scrollWidth, body.offsetWidth, body.clientWidth)
    iframe.style.height = `${contentHeight}px`

    console.log(`[docx-to-pdf] iframe content: ${contentWidth}x${contentHeight}px`)

    // Captura tudo em PNG (alta resolucao para qualidade)
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: contentWidth,
      windowHeight: contentHeight,
      width: contentWidth,
      height: contentHeight,
    })

    // Calcula numero de paginas A4 necessarias
    // A4 ratio: 297/210 = 1.4143
    // contentWidthPx representa 210mm. Pixels por mm = contentWidth / 210
    const pxPerMm = canvas.width / A4_WIDTH_MM
    const a4PageHeightPx = Math.round(A4_HEIGHT_MM * pxPerMm)
    const totalPages = Math.max(1, Math.ceil(canvas.height / a4PageHeightPx))
    console.log(`[docx-to-pdf] canvas: ${canvas.width}x${canvas.height}px, pxPerMm: ${pxPerMm.toFixed(2)}, paginas A4: ${totalPages}`)

    // pdf-lib monta o PDF final
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.create()

    for (let p = 0; p < totalPages; p++) {
      // Recorta uma "fatia" do canvas correspondente a 1 pagina A4
      const sliceTop = p * a4PageHeightPx
      const sliceHeight = Math.min(a4PageHeightPx, canvas.height - sliceTop)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = a4PageHeightPx
      const sliceCtx = sliceCanvas.getContext('2d')!
      sliceCtx.fillStyle = '#ffffff'
      sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
      sliceCtx.drawImage(
        canvas,
        0, sliceTop, canvas.width, sliceHeight,
        0, 0, canvas.width, sliceHeight,
      )
      const pngBlob: Blob = await new Promise(res =>
        sliceCanvas.toBlob(b => res(b!), 'image/png')
      )
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())
      const png = await pdf.embedPng(pngBytes)
      const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
      page.drawImage(png, {
        x: 0, y: 0,
        width: A4_WIDTH_PT, height: A4_HEIGHT_PT,
      })

      // Libera o canvas slice
      sliceCanvas.width = 0
      sliceCanvas.height = 0
    }

    // Libera o canvas grande
    canvas.width = 0
    canvas.height = 0

    const pdfBytes = await pdf.save({ useObjectStreams: false })
    const safeName = baseName.replace(/\.docx$/i, '').replace(/[^\w\s-]/g, '_')
    // Uint8Array → BlobPart (ArrayBuffer)
    return new File([pdfBytes.buffer as ArrayBuffer], `${safeName}-converted.pdf`, { type: 'application/pdf' })
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
}
