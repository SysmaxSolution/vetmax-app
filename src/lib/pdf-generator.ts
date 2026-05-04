'use client'

import type { PrintState } from '@/components/vet/DocumentsSection'

const PDF_TIMEOUT_MS = 30_000

const DOC_TYPE_LABELS: Record<string, string> = {
  laudo: 'Laudo',
  receita: 'Receita',
  encaminhamento: 'Encaminhamento',
  termo: 'Termo',
  exame: 'Exame',
  outro: 'Outro',
}

function loadImageSafe(src: string, timeoutMs = 5_000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    try {
      const img = new Image()
      const timer = setTimeout(() => resolve(null), timeoutMs)
      img.onload = () => { clearTimeout(timer); resolve(img) }
      img.onerror = () => { clearTimeout(timer); resolve(null) }
      img.crossOrigin = 'anonymous'
      img.src = src
    } catch { resolve(null) }
  })
}

// ── MODE 1: PDF with original page images as background + field overlays ────

async function _buildPdfFromPageImages(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Modo imagem de fundo — fidelidade visual maxima')
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()   // 210mm
  const H = doc.internal.pageSize.getHeight()  // 297mm

  const images = printData.page_images!

  for (let pageIdx = 0; pageIdx < images.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage()

    // Load and add background image
    const img = await loadImageSafe(images[pageIdx], 10_000)
    if (img) {
      // Calculate dimensions to fit A4 maintaining aspect ratio
      const imgRatio = img.naturalWidth / img.naturalHeight
      const pageRatio = W / H
      let imgW = W
      let imgH = H
      if (imgRatio > pageRatio) {
        imgH = W / imgRatio
      } else {
        imgW = H * imgRatio
      }
      const offsetX = (W - imgW) / 2
      const offsetY = (H - imgH) / 2
      doc.addImage(images[pageIdx], 'JPEG', offsetX, offsetY, imgW, imgH)
    }

    // Overlay field values on this page
    const pageFields = printData.extracted_fields.filter(f => {
      const fPage = f.page ?? 0
      return fPage === pageIdx && f.x_percent != null && f.y_percent != null
    })

    for (const field of pageFields) {
      const val = printData.fields[field.field_name]
      if (val === null || val === undefined || val === '') continue

      const valStr = typeof val === 'boolean' ? (val ? 'Sim' : 'Nao') : String(val)

      // Convert percentages to mm
      const x = (field.x_percent! / 100) * W
      const y = (field.y_percent! / 100) * H
      const w = ((field.width_percent ?? 25) / 100) * W

      // White background behind text for readability
      const fontSize = 9
      doc.setFontSize(fontSize)
      const textHeight = fontSize * 0.4 // approximate mm
      doc.setFillColor(255, 255, 255)
      doc.rect(x - 0.5, y - textHeight - 0.3, w + 1, textHeight + 1, 'F')

      // Render value text
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(fontSize)

      // Split long text
      const lines = doc.splitTextToSize(valStr, w)
      doc.text(lines, x, y)
    }
  }

  // If there are fields WITHOUT coordinates (fallback), add an extra page with them listed
  const fieldsWithoutCoords = printData.extracted_fields.filter(f =>
    f.x_percent == null && printData.fields[f.field_name] != null && printData.fields[f.field_name] !== ''
  )

  if (fieldsWithoutCoords.length > 0) {
    doc.addPage()
    let y = 15
    const L = 14
    const R = W - L

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(107, 114, 128)
    doc.text('CAMPOS ADICIONAIS', L, y)
    y += 6

    for (const field of fieldsWithoutCoords) {
      const val = printData.fields[field.field_name]
      if (val === null || val === undefined || val === '') continue
      const valStr = typeof val === 'boolean' ? (val ? 'Sim' : 'Nao') : String(val)
      const lines = doc.splitTextToSize(valStr, R - L)

      if (y + 10 + lines.length * 4 > H - 15) { doc.addPage(); y = 15 }

      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(107, 114, 128)
      doc.text(field.label.toUpperCase(), L, y)
      y += 4

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      doc.text(lines, L, y)
      y += lines.length * 4 + 4
    }
  }

  const blob = doc.output('blob')
  console.log('[PDF] PDF com imagem de fundo gerado:', blob.size, 'bytes,', images.length, 'pagina(s)')
  return blob
}

// ── MODE 2: HTML-based rendering ────────────────────────────────────────────

async function _buildPdfFromHtml(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Modo HTML — renderizando template')
  let html = printData.template_html!

  // Replace field placeholders
  for (const ef of printData.extracted_fields) {
    const val = printData.fields[ef.field_name]
    const display = val === null || val === undefined || val === '' ? '' : String(val)
    const placeholder = new RegExp(`\\{\\{${ef.field_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g')
    html = html.replace(placeholder, display)
  }

  // Replace system placeholders
  const sysMap: Record<string, string> = {
    '{{logo_clinica}}': clinicName,
    '{{nome_clinica}}': clinicName,
    '{{data_atual}}': new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    '{{data_curta}}': new Date().toLocaleDateString('pt-BR'),
    '{{paciente_nome}}': patient.name,
    '{{especie}}': patient.species,
    '{{raca}}': patient.breed || '',
    '{{tutor_nome}}': tutor.name,
    '{{tutor_cpf}}': tutor.cpf || '',
    '{{assinatura_digital}}': '',
  }
  for (const [k, v] of Object.entries(sysMap)) {
    html = html.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v)
  }

  const fullHtml = `<div id="pdf-content" style="width:190mm;min-height:267mm;padding:10mm;font-family:Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.5;color:#1a1a1a;background:white;">${html}</div>`

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;background:white;z-index:-1;'
  container.innerHTML = fullHtml
  document.body.appendChild(container)

  try {
    const { jsPDF } = await import('jspdf')
    const html2canvas = (await import('html2canvas')).default

    const contentEl = container.querySelector('#pdf-content') as HTMLElement
    const canvas = await html2canvas(contentEl, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 794, windowWidth: 794 })

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const imgH = (canvas.height * pageW) / canvas.width

    let yOffset = 0
    let pageNum = 0
    while (yOffset < imgH) {
      if (pageNum > 0) doc.addPage()
      const sourceY = (yOffset / imgH) * canvas.height
      const sourceH = Math.min((pageH / imgH) * canvas.height, canvas.height - sourceY)
      const destH = (sourceH / canvas.height) * imgH
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceH
      const ctx = pageCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH)
      }
      doc.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, destH)
      yOffset += pageH
      pageNum++
    }

    return doc.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}

// ── MODE 3: Classic jsPDF (fallback) ────────────────────────────────────────

async function _buildPdfClassic(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Modo classico — layout padrao')
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const L = 14
  const R = W - L
  let y = 14

  const nl = (n = 1) => { y += n }
  const newPage = (needed: number) => { if (y + needed > H - 20) { doc.addPage(); y = 14 } }

  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  doc.text(`${clinicName.toUpperCase()} — DOCUMENTO CLINICO`, L, y)
  doc.text(dateStr, R, y, { align: 'right' })
  nl(6)

  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0)
  doc.text(DOC_TYPE_LABELS[printData.type] ?? printData.type, L, y)
  nl(7)

  if (printData.type === 'receita' && printData.hasControlledMeds) {
    doc.setFillColor(219, 234, 254); doc.setDrawColor(147, 197, 253); doc.setLineWidth(0.3)
    doc.roundedRect(L, y, R - L, 7, 1, 1, 'FD')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(29, 78, 216)
    doc.text('RECEITUARIO DE CONTROLE ESPECIAL — Retencao de via na Farmacia obrigatoria (CFMV)', L + 3, y + 4.5)
    nl(11)
  } else nl(1)

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(75, 85, 99)
  doc.text(printData.name.split('—')[0].trim(), L, y); nl(5)

  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(L, y, R, y); nl(8)

  const C2 = L + (R - L) / 2
  doc.setFontSize(10); doc.setTextColor(0, 0, 0)
  const inl = (x: number, yp: number, lbl: string, val: string) => {
    doc.setFont('helvetica', 'bold'); doc.text(lbl, x, yp)
    doc.setFont('helvetica', 'normal'); doc.text(val, x + doc.getTextWidth(lbl), yp)
  }
  inl(L, y, 'Pet: ', patient.name); inl(C2, y, 'Tutor: ', tutor.name); nl(6)
  inl(L, y, 'Especie: ', patient.species + (patient.breed ? ` — ${patient.breed}` : '')); inl(C2, y, 'CPF Tutor: ', tutor.cpf || '—'); nl(7)

  doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.2); doc.line(L, y, R, y); nl(8)

  for (const field of printData.extracted_fields) {
    const val = printData.fields[field.field_name]
    if (val === null || val === undefined || val === '') continue
    const valStr = typeof val === 'boolean' ? (val ? 'Sim' : 'Nao') : String(val)
    const lines = doc.splitTextToSize(valStr, R - L)
    newPage(14 + lines.length * 5)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
    doc.text(field.label.toUpperCase(), L, y); nl(4)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0)
    doc.text(lines, L, y); nl(lines.length * 5 + 2)
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2); doc.line(L, y, R, y); nl(6)
  }

  const footerY = Math.max(y + 15, H - 42)
  if (footerY + 18 > H) { doc.addPage(); y = H - 42 } else y = footerY
  const half = (R - L) / 2
  const S1 = L + half * 0.25 + 24; const S2 = L + half + half * 0.25 + 24
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.line(S1 - 28, y, S1 + 28, y); doc.line(S2 - 28, y, S2 + 28, y); nl(5)
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
  doc.text('Medico Veterinario Responsavel', S1, y, { align: 'center' })
  doc.text('Tutor / Responsavel', S2, y, { align: 'center' }); nl(4)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  doc.text('CRMV: _____________________', S1, y, { align: 'center' })
  doc.text(`CPF: ${tutor.cpf || ''}`, S2, y, { align: 'center' })

  return doc.output('blob')
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generateDocumentPdfBlob(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  const hasPageImages = printData.page_images && printData.page_images.length > 0
  const hasHtml = !!printData.template_html

  console.log('[PDF] Modo:', hasPageImages ? 'IMAGEM DE FUNDO' : hasHtml ? 'HTML' : 'CLASSICO')

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: geracao de PDF excedeu ${PDF_TIMEOUT_MS / 1000}s`)), PDF_TIMEOUT_MS)
  )

  // Priority: page_images > template_html > classic
  const builder = hasPageImages
    ? _buildPdfFromPageImages(printData, clinicName, patient, tutor)
    : hasHtml
    ? _buildPdfFromHtml(printData, clinicName, patient, tutor)
    : _buildPdfClassic(printData, clinicName, patient, tutor)

  return Promise.race([builder, timeout])
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: conversao blob->base64 excedeu 10s')), 10_000)
    const reader = new FileReader()
    reader.onload = () => { clearTimeout(timer); resolve((reader.result as string).split(',')[1]) }
    reader.onerror = (err) => { clearTimeout(timer); reject(err) }
    reader.readAsDataURL(blob)
  })
}

export { loadImageSafe }
