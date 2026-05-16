'use client'

/**
 * IC-23/24/25: Conversao client-side de HTML (DOCX/mammoth) em PDF.
 *
 * Versao 3 (IC-25):
 *   - html2canvas captura visual (PNG) — preserva identidade visual
 *   - DOM walking via Range API extrai bounding rects de cada text node
 *   - pdf-lib desenha PNG como background + TEXTO INVISIVEL nas posicoes
 *     correspondentes → PDF tem text layer, pdfjs.getTextContent funciona
 *
 * Sem text layer (IC-24), o pipeline rejeitava o PDF como "escaneado".
 * Com text layer, os placeholders do mammoth (Custom_nome_profissional,
 * Code_crmv, etc) ficam acessiveis ao snipe normalmente.
 */

import { rgb, PDFDocument, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

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
  span[style*="background-color"] { background-color: transparent !important; }
`

interface TextBlock {
  text: string
  cssLeft: number   // px @96dpi
  cssTop: number    // px @96dpi (from top of body)
  cssWidth: number
  cssHeight: number
  fontSize: number  // px
}

/**
 * Walka o DOM coletando text nodes E suas bounding boxes via Range API.
 * Filtra textos vazios e nós escondidos.
 */
function collectTextBlocks(root: HTMLElement, bodyTopPx: number): TextBlock[] {
  const blocks: TextBlock[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue || ''
      if (!text.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const style = window.getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node: Text | null = walker.nextNode() as Text | null
  while (node) {
    const range = (node.ownerDocument || document).createRange()
    range.selectNodeContents(node)
    const rects = range.getClientRects()
    const parent = node.parentElement
    const fontSize = parent
      ? parseFloat(window.getComputedStyle(parent).fontSize || '11') || 11
      : 11
    // Para multi-linha (rects > 1), criamos UM bloco por linha
    if (rects.length > 0) {
      // Reconstroi por linha — Range pode dar varios rects para texto multiline
      const text = node.nodeValue || ''
      if (rects.length === 1) {
        const r = rects[0]
        blocks.push({
          text: text.trim(),
          cssLeft: r.left,
          cssTop: r.top - bodyTopPx,
          cssWidth: r.width,
          cssHeight: r.height,
          fontSize,
        })
      } else {
        // Texto wrappa varias linhas — usa bbox combinado (suficiente
        // para detectar placeholders, que tipicamente nao quebram linha)
        const combined: DOMRect = rects[0]
        let minLeft = combined.left
        let minTop = combined.top
        let maxRight = combined.right
        let maxBottom = combined.bottom
        for (const r of Array.from(rects)) {
          minLeft = Math.min(minLeft, r.left)
          minTop = Math.min(minTop, r.top)
          maxRight = Math.max(maxRight, r.right)
          maxBottom = Math.max(maxBottom, r.bottom)
        }
        blocks.push({
          text: text.trim(),
          cssLeft: minLeft,
          cssTop: minTop - bodyTopPx,
          cssWidth: maxRight - minLeft,
          cssHeight: maxBottom - minTop,
          fontSize,
        })
      }
    }
    node = walker.nextNode() as Text | null
  }
  return blocks
}

/**
 * Renderiza HTML em iframe oculto e converte para PDF preservando o numero
 * correto de paginas A4 + injetando text layer invisivel para que o pipeline
 * (pdfjs.getTextContent) consiga extrair os placeholders.
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
    await new Promise(r => setTimeout(r, 300))

    const body = doc.body
    const bodyRect = body.getBoundingClientRect()
    const contentHeight = Math.max(body.scrollHeight, body.offsetHeight, body.clientHeight)
    const contentWidth = Math.max(body.scrollWidth, body.offsetWidth, body.clientWidth)
    iframe.style.height = `${contentHeight}px`

    console.log(`[docx-to-pdf] iframe content: ${contentWidth}x${contentHeight}px`)

    // 1. Coleta text nodes + bounding boxes ANTES de capturar
    const textBlocks = collectTextBlocks(body, bodyRect.top)
    console.log(`[docx-to-pdf] ${textBlocks.length} text blocks coletados para text layer`)

    // 2. Captura imagem visual
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

    // 3. Calculo de paginacao
    const pxPerMmCanvas = canvas.width / A4_WIDTH_MM
    const a4PageHeightPxCanvas = Math.round(A4_HEIGHT_MM * pxPerMmCanvas)
    const totalPages = Math.max(1, Math.ceil(canvas.height / a4PageHeightPxCanvas))

    // Para o text layer (em CSS px, nao canvas px)
    const pxPerMmCss = contentWidth / A4_WIDTH_MM
    const a4PageHeightPxCss = A4_HEIGHT_MM * pxPerMmCss   // ~1123px
    const ptPerCssPx = A4_WIDTH_PT / contentWidth         // ~0.75 pt/px

    console.log(`[docx-to-pdf] canvas: ${canvas.width}x${canvas.height}px (raster), CSS: ${contentWidth}x${contentHeight}px, paginas A4: ${totalPages}`)

    // 4. Monta PDF com pdf-lib
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    for (let p = 0; p < totalPages; p++) {
      const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])

      // 4a. drawImage do recorte da imagem para esta pagina
      const sliceTop = p * a4PageHeightPxCanvas
      const sliceHeight = Math.min(a4PageHeightPxCanvas, canvas.height - sliceTop)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = a4PageHeightPxCanvas
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
      page.drawImage(png, {
        x: 0, y: 0, width: A4_WIDTH_PT, height: A4_HEIGHT_PT,
      })
      sliceCanvas.width = 0
      sliceCanvas.height = 0

      // 4b. Text layer INVISIVEL — desenha cada text block na posicao
      //     correspondente. Cor transparente (opacity 0) mas o texto
      //     fica registrado na text stream do PDF → pdfjs.getTextContent
      //     extrai normalmente.
      const pageCssTopMin = p * a4PageHeightPxCss
      const pageCssTopMax = (p + 1) * a4PageHeightPxCss
      drawInvisibleTextLayer(page, textBlocks, {
        pageCssTopMin,
        pageCssTopMax,
        ptPerCssPx,
        pageHeightPt: A4_HEIGHT_PT,
        font,
        fontBold,
      })
    }

    canvas.width = 0
    canvas.height = 0

    const pdfBytes = await pdf.save({ useObjectStreams: false })
    const safeName = baseName.replace(/\.docx$/i, '').replace(/[^\w\s-]/g, '_')
    return new File([pdfBytes.buffer as ArrayBuffer], `${safeName}-converted.pdf`, { type: 'application/pdf' })
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
}

interface InvisibleLayerOptions {
  pageCssTopMin: number
  pageCssTopMax: number
  ptPerCssPx: number       // conversao CSS px → PDF pt
  pageHeightPt: number     // 841.89
  font: PDFFont
  fontBold: PDFFont
}

/**
 * Desenha texto INVISIVEL no PDF a partir dos text blocks coletados do DOM.
 * Opacity zero — o texto nao aparece mas eh registrado na text stream do
 * PDF, permitindo extracao via pdfjs.getTextContent.
 */
function drawInvisibleTextLayer(
  page: PDFPage,
  blocks: TextBlock[],
  opts: InvisibleLayerOptions,
): void {
  const { pageCssTopMin, pageCssTopMax, ptPerCssPx, pageHeightPt, font } = opts
  for (const b of blocks) {
    // Filtra blocks fora da pagina atual
    if (b.cssTop < pageCssTopMin || b.cssTop >= pageCssTopMax) continue
    // Sanitiza o texto removendo caracteres nao-WinAnsi que pdf-lib nao
    // consegue codificar com a fonte Helvetica standard.
    const safe = sanitizeForHelvetica(b.text)
    if (!safe) continue
    const xPt = b.cssLeft * ptPerCssPx
    const cssOnPage = b.cssTop - pageCssTopMin
    // pdf-lib usa origem bottom-left. Y_pdf = pageHeight - Y_topdown - fontHeight
    const fontSizePt = Math.max(6, Math.min(24, b.fontSize * ptPerCssPx))
    const yPt = pageHeightPt - (cssOnPage * ptPerCssPx) - fontSizePt
    try {
      page.drawText(safe, {
        x: xPt,
        y: yPt,
        size: fontSizePt,
        font,
        color: rgb(1, 1, 1),  // branco
        opacity: 0,            // invisivel
      })
    } catch (e) {
      // Ignora text blocks com caracteres incompativeis em silencio
    }
  }
}

/**
 * Helvetica standard so suporta WinAnsi (Latin-1 estendido). Remove
 * caracteres fora desse range para evitar throw em pdf-lib.
 */
function sanitizeForHelvetica(text: string): string {
  return text
    .replace(/[​-‍﻿]/g, '')      // zero-width
    .replace(/[^\x00-\xFFĀ-ſ]/g, '?')  // mantem Latin-1 ext
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')    // controles
    .trim()
}
