'use client'

/**
 * IC-23: Conversao client-side de HTML (vindo de DOCX/mammoth) em PDF.
 *
 * Fluxo:
 *   1. Cria iframe oculto com o HTML estilizado A4
 *   2. Aguarda fontes carregarem
 *   3. Usa jsPDF.html() (que usa html2canvas internamente) para gerar PDF
 *   4. Retorna File de PDF pronto para entrar no pipeline normal
 *
 * Vantagens vs conversao server-side:
 *   - Sem libreoffice/puppeteer (~200MB de bloat no Vercel)
 *   - Reusa jsPDF (ja instalado) + html2canvas (recem instalado)
 *   - Identidade visual preservada (mammoth mantem estilos basicos)
 *   - Imagens embutidas (logo da clinica) entram como data URLs
 */

// Estilo CSS basico para imitar Word (A4 portrait + margens razoaveis)
const A4_STYLES = `
  @page { size: A4; margin: 0; }
  body {
    margin: 0;
    padding: 25mm 20mm;
    width: 210mm;
    min-height: 297mm;
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
  /* Remover sombras/fundos azuis de "campos" do Word (se mammoth deixou inline-styles) */
  span[style*="background-color"] { background-color: transparent !important; }
`

/**
 * Renderiza HTML em um iframe oculto com tamanho A4 e converte para PDF
 * usando jsPDF.html() (que usa html2canvas internamente).
 *
 * Retorna um File com nome `<base>-converted.pdf`.
 */
export async function convertHtmlToPdfFile(
  html: string,
  baseName = 'documento',
): Promise<File> {
  // Sanitiza HTML basico (remove scripts inline)
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '')

  // Monta o documento completo no iframe
  const fullDoc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>${A4_STYLES}</style>
</head>
<body>${cleanHtml}</body>
</html>`

  // Cria iframe oculto FORA do viewport para nao perturbar UI
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  iframe.style.border = '0'
  iframe.style.background = 'white'
  // sandbox: permite mesmo origem para que jsPDF possa ler o body
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  try {
    // Renderiza HTML no iframe
    const doc = iframe.contentDocument
    if (!doc) throw new Error('iframe sem contentDocument')
    doc.open()
    doc.write(fullDoc)
    doc.close()

    // Aguarda fontes/imagens carregarem (1.5s de buffer geralmente basta)
    await new Promise(r => setTimeout(r, 1500))

    // Espera imagens completarem
    const imgs = Array.from(doc.images)
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>(res => {
        img.onload = () => res()
        img.onerror = () => res()
      })
    }))

    // Importa jsPDF (peso so quando precisa)
    const { jsPDF } = await import('jspdf')
    await import('html2canvas')  // peer dep do jsPDF.html()

    // Cria PDF A4
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    // jsPDF.html eh assincrono — usa promise
    await new Promise<void>((resolve, reject) => {
      pdf.html(doc.body, {
        callback: () => resolve(),
        x: 0,
        y: 0,
        // jsPDF html() converte mm <-> px usando 96dpi (default). Para
        // bater com nosso A4 (210mm), html2canvas escala automaticamente.
        autoPaging: 'text',
        html2canvas: {
          scale: 2,                  // 2x para qualidade — vira ~192 DPI
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
        },
        width: 210,
        windowWidth: 794,            // 210mm em px @96dpi
      }).then(() => resolve()).catch(reject)
    })

    const blob = pdf.output('blob') as Blob
    const safeName = baseName.replace(/\.docx$/i, '').replace(/[^\w\s-]/g, '_')
    return new File([blob], `${safeName}-converted.pdf`, { type: 'application/pdf' })
  } finally {
    // Sempre limpa o iframe (mesmo em caso de erro)
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
}
