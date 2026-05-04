'use client'

import type { PrintState } from '@/components/vet/DocumentsSection'

const PDF_TIMEOUT_MS = 30_000  // Increased for HTML rendering

const DOC_TYPE_LABELS: Record<string, string> = {
  laudo: 'Laudo',
  receita: 'Receita',
  encaminhamento: 'Encaminhamento',
  termo: 'Termo',
  exame: 'Exame',
  outro: 'Outro',
}

/**
 * Carrega uma imagem com timeout. Se falhar ou demorar, retorna null.
 */
function loadImageSafe(src: string, timeoutMs = 5_000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    try {
      const img = new Image()
      const timer = setTimeout(() => { resolve(null) }, timeoutMs)
      img.onload = () => { clearTimeout(timer); resolve(img) }
      img.onerror = () => { clearTimeout(timer); resolve(null) }
      img.src = src
    } catch { resolve(null) }
  })
}

// ── HTML Template → Rendered HTML ───────────────────────────────────────────

function renderTemplateHtml(
  templateHtml: string,
  fields: Record<string, any>,
  extractedFields: { field_name: string; label: string }[],
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): string {
  let html = templateHtml

  // Replace field placeholders {{field_name}} with actual values
  for (const ef of extractedFields) {
    const val = fields[ef.field_name]
    const display = val === null || val === undefined || val === ''
      ? `<span style="color:#9ca3af;font-style:italic;">[${ef.label}]</span>`
      : typeof val === 'boolean'
      ? (val ? 'Sim' : 'Nao')
      : String(val)
    const placeholder = new RegExp(`\\{\\{${ef.field_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g')
    html = html.replace(placeholder, display)
  }

  // Replace common system placeholders
  const sysReplacements: Record<string, string> = {
    '{{logo_clinica}}': `<div style="text-align:center;font-weight:bold;font-size:1.2em;padding:8px;">${clinicName}</div>`,
    '{{nome_clinica}}': clinicName,
    '{{data_atual}}': new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    '{{data_curta}}': new Date().toLocaleDateString('pt-BR'),
    '{{paciente_nome}}': patient.name,
    '{{especie}}': patient.species,
    '{{raca}}': patient.breed || '',
    '{{tutor_nome}}': tutor.name,
    '{{tutor_cpf}}': tutor.cpf || '',
  }

  for (const [key, val] of Object.entries(sysReplacements)) {
    html = html.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), val)
  }

  return html
}

// ── HTML-based PDF generation (visual fidelity) ─────────────────────────────

async function _buildPdfFromHtml(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Modo HTML — renderizando template com fidelidade visual...')

  const renderedHtml = renderTemplateHtml(
    printData.template_html!,
    printData.fields,
    printData.extracted_fields,
    clinicName,
    patient,
    tutor,
  )

  // Wrap in a print-ready container
  const fullHtml = `
    <div id="pdf-content" style="
      width: 190mm;
      min-height: 267mm;
      padding: 10mm;
      font-family: 'Helvetica', 'Arial', sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
      box-sizing: border-box;
    ">
      ${renderedHtml}
    </div>
  `

  // Create temporary container in DOM for html2canvas
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;background:white;z-index:-1;'
  container.innerHTML = fullHtml
  document.body.appendChild(container)

  try {
    const { jsPDF } = await import('jspdf')
    const html2canvas = (await import('html2canvas')).default

    const contentEl = container.querySelector('#pdf-content') as HTMLElement
    if (!contentEl) throw new Error('Elemento #pdf-content nao encontrado')

    // Render HTML to canvas
    console.log('[PDF] Renderizando HTML para canvas...')
    const canvas = await html2canvas(contentEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,  // A4 at 96dpi
      windowWidth: 794,
    })

    console.log('[PDF] Canvas renderizado:', canvas.width, 'x', canvas.height)

    // Create PDF from canvas
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const imgW = pageW
    const imgH = (canvas.height * pageW) / canvas.width

    // Handle multi-page if content is taller than one page
    let yOffset = 0
    let pageNum = 0

    while (yOffset < imgH) {
      if (pageNum > 0) doc.addPage()

      // Calculate source crop for this page
      const sourceY = (yOffset / imgH) * canvas.height
      const sourceH = Math.min((pageH / imgH) * canvas.height, canvas.height - sourceY)
      const destH = (sourceH / canvas.height) * imgH

      // Create a cropped canvas for this page
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceH
      const ctx = pageCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH)
      }

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95)
      doc.addImage(pageImgData, 'JPEG', 0, 0, pageW, destH)

      yOffset += pageH
      pageNum++
    }

    const blob = doc.output('blob')
    console.log('[PDF] PDF HTML gerado:', blob.size, 'bytes,', pageNum, 'pagina(s)')
    return blob
  } finally {
    document.body.removeChild(container)
  }
}

// ── Classic jsPDF generation (fallback for templates without HTML) ───────────

async function _buildPdfClassic(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Modo classico — layout padrao...')
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const L = 14
  const R = W - L
  let y = 14

  const nl = (n = 1) => { y += n }
  const newPageIfNeeded = (needed: number) => {
    if (y + needed > H - 20) { doc.addPage(); y = 14 }
  }

  const dateStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  // Header
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text(`${clinicName.toUpperCase()} — DOCUMENTO CLINICO`, L, y)
  doc.text(dateStr, R, y, { align: 'right' })
  nl(6)

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(DOC_TYPE_LABELS[printData.type] ?? printData.type, L, y)
  nl(7)

  // Controlled meds banner
  if (printData.type === 'receita' && printData.hasControlledMeds) {
    doc.setFillColor(219, 234, 254)
    doc.setDrawColor(147, 197, 253)
    doc.setLineWidth(0.3)
    doc.roundedRect(L, y, R - L, 7, 1, 1, 'FD')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(29, 78, 216)
    doc.text('RECEITUARIO DE CONTROLE ESPECIAL — Retencao de via na Farmacia obrigatoria (CFMV)', L + 3, y + 4.5)
    nl(11)
  } else {
    nl(1)
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(75, 85, 99)
  doc.text(printData.name.split('—')[0].trim(), L, y)
  nl(5)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(L, y, R, y)
  nl(8)

  // Patient data
  const C2 = L + (R - L) / 2
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)

  const inlineText = (x: number, yp: number, label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, x, yp)
    doc.setFont('helvetica', 'normal')
    doc.text(value, x + doc.getTextWidth(label), yp)
  }

  inlineText(L, y, 'Pet: ', patient.name)
  inlineText(C2, y, 'Tutor: ', tutor.name)
  nl(6)

  inlineText(L, y, 'Especie: ', patient.species + (patient.breed ? ` — ${patient.breed}` : ''))
  inlineText(C2, y, 'CPF Tutor: ', tutor.cpf || '—')
  nl(7)

  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.2)
  doc.line(L, y, R, y)
  nl(8)

  // Document fields
  for (const field of printData.extracted_fields) {
    const val = printData.fields[field.field_name]
    if (val === null || val === undefined || val === '') continue
    const valStr = typeof val === 'boolean' ? (val ? 'Sim' : 'Nao') : String(val)
    const lines = doc.splitTextToSize(valStr, R - L)

    newPageIfNeeded(14 + lines.length * 5)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(107, 114, 128)
    doc.text(field.label.toUpperCase(), L, y)
    nl(4)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text(lines, L, y)
    nl(lines.length * 5 + 2)

    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.2)
    doc.line(L, y, R, y)
    nl(6)
  }

  // Signatures
  const footerY = Math.max(y + 15, H - 42)
  if (footerY + 18 > H) { doc.addPage(); y = H - 42 } else { y = footerY }

  const half = (R - L) / 2
  const S1 = L + half * 0.25 + 24
  const S2 = L + half + half * 0.25 + 24

  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.line(S1 - 28, y, S1 + 28, y)
  doc.line(S2 - 28, y, S2 + 28, y)
  nl(5)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(55, 65, 81)
  doc.text('Medico Veterinario Responsavel', S1, y, { align: 'center' })
  doc.text('Tutor / Responsavel', S2, y, { align: 'center' })
  nl(4)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text('CRMV: _____________________', S1, y, { align: 'center' })
  doc.text(`CPF: ${tutor.cpf || ''}`, S2, y, { align: 'center' })

  const blob = doc.output('blob')
  console.log('[PDF] PDF classico gerado:', blob.size, 'bytes')
  return blob
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Gera PDF usando template HTML (fidelidade visual) ou fallback classico. */
export function generateDocumentPdfBlob(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Iniciando geracao — timeout de', PDF_TIMEOUT_MS / 1000, 's')
  console.log('[PDF] template_html:', printData.template_html ? `${printData.template_html.length} chars` : 'nao disponivel')

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout: geracao de PDF excedeu ${PDF_TIMEOUT_MS / 1000}s`)),
      PDF_TIMEOUT_MS,
    )
  )

  const builder = printData.template_html
    ? _buildPdfFromHtml(printData, clinicName, patient, tutor)
    : _buildPdfClassic(printData, clinicName, patient, tutor)

  return Promise.race([builder, timeout])
}

/** Converte Blob para base64. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout: conversao blob->base64 excedeu 10s'))
    }, 10_000)

    const reader = new FileReader()
    reader.onload = () => {
      clearTimeout(timer)
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = (err) => {
      clearTimeout(timer)
      reject(err)
    }
    reader.readAsDataURL(blob)
  })
}

export { loadImageSafe }
