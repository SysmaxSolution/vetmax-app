'use client'

import type { PrintState } from '@/components/vet/DocumentsSection'

const PDF_TIMEOUT_MS = 10_000

const DOC_TYPE_LABELS: Record<string, string> = {
  laudo: 'Laudo',
  receita: 'Receita',
  encaminhamento: 'Encaminhamento',
  termo: 'Termo',
  exame: 'Exame',
  outro: 'Outro',
}

/**
 * Carrega uma imagem com timeout. Se falhar ou demorar, retorna null
 * em vez de rejeitar — assim o PDF é gerado sem a logo.
 */
function loadImageSafe(src: string, timeoutMs = 5_000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    try {
      const img = new Image()
      const timer = setTimeout(() => {
        console.warn('[PDF] Imagem não carregou a tempo, continuando sem ela:', src)
        resolve(null)
      }, timeoutMs)
      img.onload = () => { clearTimeout(timer); resolve(img) }
      img.onerror = (err) => {
        clearTimeout(timer)
        console.warn('[PDF] Erro ao carregar imagem, continuando sem ela:', src, err)
        resolve(null) // nunca rejeita — PDF segue sem imagem
      }
      img.src = src
    } catch (err) {
      console.warn('[PDF] Exceção ao tentar carregar imagem:', err)
      resolve(null)
    }
  })
}

/** Gera um Blob PDF replicando o layout visual do portal de impressão da clínica. */
export function generateDocumentPdfBlob(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  console.log('[PDF] Iniciando geração — timeout de', PDF_TIMEOUT_MS / 1000, 's ativo')

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout: geração de PDF excedeu ${PDF_TIMEOUT_MS / 1000}s`)),
      PDF_TIMEOUT_MS,
    )
  )

  return Promise.race([_buildPdf(printData, clinicName, patient, tutor), timeout])
}

async function _buildPdf(
  printData: PrintState,
  clinicName: string,
  patient: { name: string; species: string; breed: string | null },
  tutor: { name: string; cpf: string },
): Promise<Blob> {
  try {
    console.log('[PDF] Importando jsPDF...')
    const { jsPDF } = await import('jspdf')
    console.log('[PDF] jsPDF importado com sucesso')

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    console.log('[PDF] Documento criado')

    const W = doc.internal.pageSize.getWidth()   // 210 mm
    const H = doc.internal.pageSize.getHeight()  // 297 mm
    const L = 14
    const R = W - L
    let y   = 14

    const nl = (n = 1) => { y += n }
    const newPageIfNeeded = (needed: number) => {
      if (y + needed > H - 20) { doc.addPage(); y = 14 }
    }

    const dateStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })

    // ── Cabeçalho ────────────────────────────────────────────────────────────
    console.log('[PDF] Adicionando cabeçalho...')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text(`${clinicName.toUpperCase()} — DOCUMENTO CLÍNICO`, L, y)
    doc.text(dateStr, R, y, { align: 'right' })
    nl(6)

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(DOC_TYPE_LABELS[printData.type] ?? printData.type, L, y)
    nl(7)

    // ── Banner Receituário de Controle Especial ──────────────────────────────
    if (printData.type === 'receita' && printData.hasControlledMeds) {
      doc.setFillColor(219, 234, 254)   // blue-100
      doc.setDrawColor(147, 197, 253)   // blue-300
      doc.setLineWidth(0.3)
      doc.roundedRect(L, y, R - L, 7, 1, 1, 'FD')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(29, 78, 216)    // blue-700
      doc.text('RECEITUÁRIO DE CONTROLE ESPECIAL — Retenção de via na Farmácia obrigatória (CFMV)', L + 3, y + 4.5)
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

    // ── Dados do paciente (2 colunas) ─────────────────────────────────────
    console.log('[PDF] Adicionando dados do paciente...')
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

    inlineText(L, y, 'Espécie: ', patient.species + (patient.breed ? ` — ${patient.breed}` : ''))
    inlineText(C2, y, 'CPF Tutor: ', tutor.cpf || '—')
    nl(7)

    doc.setDrawColor(209, 213, 219)
    doc.setLineWidth(0.2)
    doc.line(L, y, R, y)
    nl(8)

    // ── Campos do documento ───────────────────────────────────────────────
    console.log(`[PDF] Adicionando campos do documento (${printData.extracted_fields.length} campo(s))...`)
    for (const field of printData.extracted_fields) {
      const val = printData.fields[field.field_name]
      if (val === null || val === undefined || val === '') continue
      console.log(`[PDF] Campo: "${field.label}"`)
      const valStr = typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val)
      const lines  = doc.splitTextToSize(valStr, R - L)

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

    // ── Rodapé — assinaturas ───────────────────────────────────────────────
    console.log('[PDF] Adicionando rodapé/assinaturas...')
    const footerY = Math.max(y + 15, H - 42)
    if (footerY + 18 > H) { doc.addPage(); y = H - 42 } else { y = footerY }

    const half = (R - L) / 2
    const S1   = L + half * 0.25 + 24
    const S2   = L + half + half * 0.25 + 24

    doc.setDrawColor(0)
    doc.setLineWidth(0.3)
    doc.line(S1 - 28, y, S1 + 28, y)
    doc.line(S2 - 28, y, S2 + 28, y)
    nl(5)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(55, 65, 81)
    doc.text('Médico Veterinário Responsável', S1, y, { align: 'center' })
    doc.text('Tutor / Responsável', S2, y, { align: 'center' })
    nl(4)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text('CRMV: _____________________', S1, y, { align: 'center' })
    doc.text(`CPF: ${tutor.cpf || ''}`, S2, y, { align: 'center' })

    console.log('[PDF] Serializando para blob...')
    const blob = doc.output('blob')
    console.log('[PDF] PDF gerado com sucesso! Tamanho:', blob.size, 'bytes')
    return blob
  } catch (err) {
    console.error('[PDF] ERRO durante geração do PDF:', err)
    throw err  // propaga para o Promise.race rejeitar e o catch do caller tratar
  }
}

/** Converte um Blob para base64 usando FileReader (suporta arquivos grandes). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('[PDF] Iniciando conversão blob → base64...')

    const timer = setTimeout(() => {
      reject(new Error('Timeout: conversão blob→base64 excedeu 10s'))
    }, 10_000)

    const reader = new FileReader()
    reader.onload = () => {
      clearTimeout(timer)
      const dataUrl = reader.result as string
      console.log('[PDF] Base64 gerado, tamanho aprox.:', Math.round(dataUrl.length / 1024), 'KB')
      resolve(dataUrl.split(',')[1])  // remove "data:application/pdf;base64,"
    }
    reader.onerror = (err) => {
      clearTimeout(timer)
      console.error('[PDF] Erro no FileReader:', err)
      reject(err)
    }
    reader.readAsDataURL(blob)
  })
}

// Exporta helper para uso futuro com logos de clínica
export { loadImageSafe }
