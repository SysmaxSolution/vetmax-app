'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope, Loader2, Check } from 'lucide-react'
import { submitPreconsultation } from '@/lib/actions/portal-preconsult'

export default function PreconsultForm({ petId, petName }: { petId: string; petName: string }) {
  const router = useRouter()
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [durationText, setDurationText] = useState('')
  const [fasting, setFasting] = useState<'yes' | 'no' | ''>('')
  const [currentMeds, setCurrentMeds] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    if (chiefComplaint.trim().length < 3) { setError('Descreva o motivo da consulta.'); return }
    setBusy(true); setError(null)
    const r = await submitPreconsultation({
      petId, chiefComplaint, symptoms, durationText,
      fasting: fasting === '' ? null : fasting === 'yes',
      currentMeds, notes,
    })
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-[#EDE9E0] p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <p className="text-lg text-[#16221C]" style={{ fontFamily: 'var(--font-fraunces), serif' }}>Pré-consulta enviada</p>
        <p className="mt-1 text-sm text-[#8A968E]">A recepção já verá estas informações quando {petName} chegar. Obrigado por adiantar!</p>
        <button onClick={() => router.push(`/portal/pet/${petId}`)} className="mt-6 rounded-full bg-[#0E3B2E] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#134A38]">
          Voltar ao pet
        </button>
      </div>
    )
  }

  const label = 'block text-[13px] font-medium text-[#4A574F] mb-1.5'
  const field = 'w-full rounded-xl border border-[#E5E0D5] bg-white px-3.5 py-2.5 text-sm text-[#16221C] focus:border-[#17624A] focus:outline-none focus:ring-2 focus:ring-[#17624A]/15'

  return (
    <div className="bg-white rounded-2xl border border-[#EDE9E0] p-6 sm:p-8">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17624A]/10"><Stethoscope className="h-4.5 w-4.5 text-[#17624A]" /></span>
        <h1 className="text-xl text-[#16221C]" style={{ fontFamily: 'var(--font-fraunces), serif' }}>Pré-consulta de {petName}</h1>
      </div>
      <p className="text-sm text-[#8A968E] mb-6">Adiante o que está acontecendo. A recepção e o veterinário já chegam sabendo o essencial — o atendimento fica mais rápido.</p>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        <div>
          <label className={label}>Motivo da consulta *</label>
          <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} rows={2} placeholder="Ex.: está vomitando desde ontem e não quer comer" className={field} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Sintomas observados</label>
            <input value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="Ex.: apatia, diarreia, coceira" className={field} />
          </div>
          <div>
            <label className={label}>Há quanto tempo?</label>
            <input value={durationText} onChange={e => setDurationText(e.target.value)} placeholder="Ex.: 2 dias" className={field} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Está em jejum?</label>
            <div className="flex gap-2">
              {([['yes', 'Sim'], ['no', 'Não'], ['', 'Não sei']] as const).map(([v, t]) => (
                <button key={t} type="button" onClick={() => setFasting(v)}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-medium transition ${fasting === v ? 'border-[#17624A] bg-[#17624A]/5 text-[#17624A]' : 'border-[#E5E0D5] text-[#6A7A72] hover:border-[#C9C2B4]'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Medicações em uso</label>
            <input value={currentMeds} onChange={e => setCurrentMeds(e.target.value)} placeholder="Ex.: nenhuma / antibiótico X" className={field} />
          </div>
        </div>
        <div>
          <label className={label}>Observações</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Qualquer detalhe que ajude o veterinário" className={field} />
        </div>
      </div>

      <button onClick={submit} disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0E3B2E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#134A38] disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}Enviar pré-consulta
      </button>
    </div>
  )
}
