'use client'

import { useState } from 'react'
import {
  X, FileText, Send, Loader2, Download, Edit3, Eye, PenLine, Pill
} from 'lucide-react'

// ─── Detecção de Controlados (mirrors ClinicalActionsSection) ─────────────────
const CONTROLLED_DCBS = [
  'fenobarbital','diazepam','midazolam','clonazepam','alprazolam','lorazepam',
  'ketamina','zolazepam','tiletamina','telazol',
  'morfina','tramadol','fentanil','meperidina','petidina','buprenorfina',
  'oxicodona','codeina','codeína','butorfanol','nalbufina',
  'propofol','tiopental','pentobarbital','secobarbital',
  'xilazina','dexmedetomidina','medetomidina','detomidina',
  'acepromazina','clorpromazina',
  'fluoxetina','amitriptilina','clomipramina',
]
function isControlledDrug(name: string): boolean {
  const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return CONTROLLED_DCBS.some(dcb =>
    lower.includes(dcb.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  )
}
import { createClient } from '@/lib/supabase/client'
import type { PrescriptionData } from '@/lib/actions/reports'
import type { HospitalizationCard } from '@/lib/actions/hospitalizations'
import { speciesLabel } from '@/lib/species'

interface Props {
  data:    PrescriptionData
  card:    HospitalizationCard
  onClose: () => void
}

export default function PrescriptionModal({ data, card, onClose }: Props) {
  const [text, setText] = useState(data.suggested_text)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  // ── PDF builder (client-side jspdf) ────────────────────────────────────────
  async function buildPdf(): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW  = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 20

    // ── Header ─────────────────────────────────────────────────────────────
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(60, 20, 160)
    doc.text(data.clinic_name.toUpperCase(), pageW / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text('Clínica Veterinária', pageW / 2, y, { align: 'center' })
    y += 5
    doc.setLineWidth(0.6)
    doc.setDrawColor(100, 60, 220)
    doc.line(margin, y, pageW - margin, y)
    y += 7

    // ── Title + date ────────────────────────────────────────────────────────
    const hasControlled = data.medications.some(m => isControlledDrug(m.name))
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(25)
    doc.text(
      hasControlled ? 'RECEITUÁRIO DE CONTROLE ESPECIAL' : 'RECEITUÁRIO VETERINÁRIO',
      pageW / 2, y, { align: 'center' },
    )
    if (hasControlled) {
      y += 4
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(29, 78, 216)
      doc.text('Retenção de via na Farmácia obrigatória — CFMV', pageW / 2, y, { align: 'center' })
    }
    y += 5
    const issuedDate = new Date(data.issued_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(130)
    doc.text(`Emitido em: ${issuedDate}`, pageW - margin, y, { align: 'right' })
    y += 9

    // ── Patient / Tutor box ─────────────────────────────────────────────────
    const boxH = data.patient.weight_kg ? 28 : 24
    doc.setFillColor(248, 246, 255)
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 2, 2, 'F')
    doc.setDrawColor(210, 190, 250)
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 2, 2, 'S')

    const halfW = (pageW - margin * 2) / 2
    // divider
    doc.setDrawColor(220, 200, 250)
    doc.line(margin + halfW, y + 2, margin + halfW, y + boxH - 2)

    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 40, 160)
    doc.text('ANIMAL (PET)', margin + 4, y)
    doc.text('TUTOR (RESPONSÁVEL)', margin + halfW + 4, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40)
    doc.text(`Nome: ${data.patient.name}`, margin + 4, y)
    doc.text(`Nome: ${data.tutor.name}`, margin + halfW + 4, y)
    y += 4
    doc.text(`Espécie: ${speciesLabel(data.patient.species)}   Raça: ${data.patient.breed ?? 'SRD'}`, margin + 4, y)
    if (data.tutor.phone) {
      doc.text(`Tel: ${data.tutor.phone}`, margin + halfW + 4, y)
    }
    if (data.patient.weight_kg) {
      y += 4
      doc.text(`Peso: ${data.patient.weight_kg} kg`, margin + 4, y)
    }
    y += 10

    // ── Medications ────────────────────────────────────────────────────────
    if (data.medications.length > 0) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(25)
      doc.text('PRESCRIÇÃO', margin, y)
      y += 5

      for (const [idx, med] of data.medications.entries()) {
        const medControlled = isControlledDrug(med.name)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(60, 20, 160)
        const medLabel = medControlled ? `${idx + 1}. ${med.name}  [Controle Especial]` : `${idx + 1}. ${med.name}`
        doc.text(medLabel, margin + 3, y)
        y += 4
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(40)
        doc.text(`Dose: ${med.dose}   Via: ${med.route}`, margin + 8, y)
        y += 4
        if (med.notes) {
          doc.setTextColor(80)
          doc.text(`Posologia: ${med.notes}`, margin + 8, y)
          y += 4
        }
        y += 2
      }
      y += 3
    }

    // ── Orientações ao Tutor ───────────────────────────────────────────────
    const plainText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .trim()

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(25)
    doc.text('ORIENTAÇÕES AO TUTOR', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(50)
    const lines = doc.splitTextToSize(plainText, pageW - margin * 2)
    doc.text(lines, margin, y)
    y += lines.length * 4.5 + 10

    // ── Signature block ────────────────────────────────────────────────────
    const sigY = Math.max(y + 10, 220)
    doc.setDrawColor(80)
    doc.setLineWidth(0.4)
    doc.line(margin, sigY, margin + 75, sigY)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(25)
    doc.text(data.vet_name, margin, sigY + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80)
    if (data.vet_crmv) doc.text(`CRMV: ${data.vet_crmv}`, margin, sigY + 9)
    doc.text('Médico(a) Veterinário(a)', margin, sigY + (data.vet_crmv ? 13 : 9))

    // Digital signature placeholder
    doc.setFontSize(7)
    doc.setTextColor(160)
    doc.text('[Assinatura Digital / Carimbo]', margin, sigY + (data.vet_crmv ? 18 : 14))

    // ── CFMV Footer ────────────────────────────────────────────────────────
    const footY = doc.internal.pageSize.getHeight() - 12
    doc.setDrawColor(200)
    doc.setLineWidth(0.2)
    doc.line(margin, footY - 4, pageW - margin, footY - 4)
    doc.setFontSize(6.5)
    doc.setTextColor(150)
    doc.text(
      'Documento gerado pela SysVetMax • CFMV Resolução 1084/2012 • Válido somente com assinatura do Médico Veterinário responsável.',
      pageW / 2, footY,
      { align: 'center', maxWidth: pageW - margin * 2 },
    )

    return doc.output('blob') as Blob
  }

  // ── Download PDF ──────────────────────────────────────────────────────────
  async function handleDownload() {
    setIsGenerating(true)
    try {
      const blob = await buildPdf()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `receita-${data.patient.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Erro ao gerar PDF.')
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Share via WhatsApp ────────────────────────────────────────────────────
  async function handleShareWhatsApp() {
    setIsSharing(true)
    try {
      const blob     = await buildPdf()
      const supabase = createClient()
      const fileName = `receita-${data.patient.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`
      const path     = `${card.clinic_id}/${card.id}/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('clinical-documents')
        .upload(path, blob, { contentType: 'application/pdf', upsert: false })

      if (uploadErr) {
        alert('Erro ao salvar PDF: ' + uploadErr.message)
        return
      }

      const { data: signed } = await supabase.storage
        .from('clinical-documents')
        .createSignedUrl(path, 3600)

      const pdfUrl = signed?.signedUrl ?? '(ver arquivo em anexo)'
      const phone  = data.tutor.phone?.replace(/\D/g, '')
      const msg    = encodeURIComponent(
        `Olá ${data.tutor.name}, segue a receita digital de ${data.patient.name} gerada pela SysVetMax.\n\nAcesse em: ${pdfUrl}\n\nReceituário emitido em: ${new Date(data.issued_at).toLocaleDateString('pt-BR')}\nMV ${data.vet_name}${data.vet_crmv ? ` — CRMV ${data.vet_crmv}` : ''}`
      )
      const waUrl = phone
        ? `https://wa.me/55${phone}?text=${msg}`
        : `https://wa.me/?text=${msg}`

      window.open(waUrl, '_blank')
    } catch (err) {
      alert('Erro ao compartilhar.')
      console.error(err)
    } finally {
      setIsSharing(false)
    }
  }

  const busy = isGenerating || isSharing

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-200">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Receituário Veterinário</h3>
              <p className="text-xs text-slate-500">{data.patient.name} • Tutor: {data.tutor.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Edit / Preview toggle */}
        <div className="px-6 pt-4 flex items-center justify-between">
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                mode === 'edit'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Edit3 className="h-3 w-3" /> Editar
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                mode === 'preview'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Eye className="h-3 w-3" /> Pré-visualizar
            </button>
          </div>
          <span className="text-[10px] text-amber-600 font-medium">
            ⚠️ Sugestão da IA — revise antes de assinar
          </span>
        </div>

        {/* Editor / Preview */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {mode === 'edit' ? (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full h-52 p-4 text-sm rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none font-mono text-slate-700 leading-relaxed"
              placeholder="Orientações ao tutor e condutas prescritas..."
            />
          ) : (
            <div className="w-full min-h-52 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
              {text.trim()
                ? text
                : <span className="text-slate-400 italic">Nenhum conteúdo.</span>
              }
            </div>
          )}

          {/* Medications list */}
          {data.medications.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Pill className="h-3 w-3" /> Medicações Prescritas ({data.medications.length})
              </p>
              <div className="space-y-1.5">
                {data.medications.map((med, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                    <span className="text-[10px] font-bold text-violet-600 w-4 flex-shrink-0">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-violet-900">{med.name}</span>
                      <span className="text-[10px] text-violet-600 ml-2">{med.dose} • {med.route}</span>
                      {med.notes && <p className="text-[10px] text-slate-500 mt-0.5">{med.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patient / Vet info summary */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">Animal</span>
              <p className="font-medium text-slate-800">{data.patient.name}</p>
              <p className="text-slate-500">
                {speciesLabel(data.patient.species)} · {data.patient.breed ?? 'SRD'}
                {data.patient.weight_kg ? ` · ${data.patient.weight_kg} kg` : ''}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">Tutor</span>
              <p className="font-medium text-slate-800">{data.tutor.name}</p>
              {data.tutor.phone && <p className="text-slate-500">{data.tutor.phone}</p>}
            </div>
            <div className="col-span-2">
              <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">Médico(a) Veterinário(a)</span>
              <p className="font-medium text-slate-800">
                {data.vet_name}{data.vet_crmv ? ` · CRMV ${data.vet_crmv}` : ''}
              </p>
            </div>
          </div>

          {/* Signature field notice */}
          <div className="p-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 flex items-start gap-2.5">
            <PenLine className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-violet-600 uppercase mb-0.5">Assinatura Digital</p>
              <p className="text-[10px] text-slate-500 leading-tight">
                O PDF incluirá espaço reservado para assinatura do MV responsável ({data.vet_name})
                conforme CFMV Resolução 1084/2012.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={handleDownload}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-100 transition-all disabled:opacity-50 text-sm"
          >
            {isGenerating
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {isGenerating ? 'Gerando PDF...' : 'Baixar Receituário'}
          </button>
          <button
            onClick={handleShareWhatsApp}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 text-sm"
          >
            {isSharing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            {isSharing ? 'Enviando...' : 'Compartilhar WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}
