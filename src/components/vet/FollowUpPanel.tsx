'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, ClipboardList, Mic, MicOff, Check, Stethoscope, LogOut } from 'lucide-react'
import { saveFollowUp } from '@/lib/actions/followup'
import { useClinicalVoiceAssistant } from '@/hooks/useClinicalVoiceAssistant'
import type { VetConsultationDetail } from '@/lib/actions/vet'
import { speciesLabel } from '@/lib/species'

/**
 * FollowUpPanel — fluxo express "Acompanhamento" (M2).
 * Renderizado pelo ConsultationDetail quando visit_reason='acompanhamento'.
 * Prontuário (por voz) + sinais vitais → finaliza com ALTA (sem caixa) ou
 * CONSULTA (converte em consulta normal já preenchida).
 */

interface Props {
  consultation: VetConsultationDetail
}

export default function FollowUpPanel({ consultation }: Props) {
  const router = useRouter()
  const { patient, tutor } = consultation

  const [notes, setNotes] = useState(consultation.vet_notes ?? '')
  const [weight, setWeight]           = useState('')
  const [temperature, setTemperature] = useState('')
  const [heartRate, setHeartRate]     = useState('')
  const [respRate, setRespRate]       = useState('')
  const [systolic, setSystolic]       = useState('')
  const [glucose, setGlucose]         = useState('')

  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isFinalized = consultation.status === 'completed' || consultation.status === 'cancelled'

  // Prontuário por voz — mesmo hook do consultório. onAutoSave anexa ao texto.
  const voice = useClinicalVoiceAssistant({
    onAutoSave: (t) => { if (t.trim()) setNotes(prev => (prev ? prev.trim() + ' ' : '') + t.trim()) },
  })
  useEffect(() => {
    voice.activate()
    return () => voice.deactivate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const isRecording = voice.state === 'RECORDING'

  function buildVitalSigns(): Record<string, number> | null {
    const v: Record<string, number> = {}
    const set = (k: string, s: string) => { const n = parseFloat(s.replace(',', '.')); if (Number.isFinite(n) && n > 0) v[k] = n }
    set('weight', weight); set('temperature', temperature); set('heart_rate', heartRate)
    set('respiratory_rate', respRate); set('systolic_bp', systolic); set('glucose', glucose)
    return Object.keys(v).length > 0 ? v : null
  }

  function submit(mode: 'alta' | 'consulta') {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await saveFollowUp({
        consultation_id: consultation.id,
        vet_notes:       notes.trim() || null,
        vital_signs:     buildVitalSigns(),
        mode,
      })
      if ('error' in res) { setError(res.error); return }
      voice.deactivate()
      if (mode === 'alta') {
        setSuccess(`Acompanhamento de ${patient.name} concluído (alta). Não foi lançado no caixa.`)
        setTimeout(() => router.push('/dashboard/reception'), 1800)
      } else {
        setSuccess(`Abrindo consulta completa de ${patient.name}…`)
        setTimeout(() => router.refresh(), 800)
      }
    })
  }

  const vitalField = (label: string, value: string, onChange: (v: string) => void, ph: string) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} placeholder={ph} disabled={isFinalized || pending}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />Voltar
        </button>
        <span className="text-xs font-semibold text-cyan-700 bg-cyan-100 px-2.5 py-1 rounded-full flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />Fluxo express · Acompanhamento
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4">
        <h1 className="text-lg font-semibold text-slate-900">{patient.name}</h1>
        <p className="text-xs text-slate-500">
          {speciesLabel(patient.species)}{patient.breed ? ` · ${patient.breed}` : ''} · Tutor: {tutor.name}
        </p>
      </div>

      {/* Prontuário por voz */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Stethoscope className="h-4 w-4 text-cyan-600" /> Prontuário</h2>
          {!isFinalized && (
            <button type="button" onClick={() => voice.manualToggle()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                isRecording ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-cyan-600 text-white hover:bg-cyan-700'}`}>
              {isRecording ? <><MicOff className="h-3.5 w-3.5" /> Parar</> : <><Mic className="h-3.5 w-3.5" /> Gravar</>}
            </button>
          )}
        </div>
        <div className="p-5 space-y-2">
          <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} disabled={isFinalized || pending}
            placeholder='Descreva o acompanhamento (ou dite por voz: diga "Assistente" e fale).'
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
          {isRecording && voice.transcript && (
            <p className="text-xs text-cyan-600 italic">🎙️ {voice.transcript}</p>
          )}
        </div>
      </div>

      {/* Sinais vitais rápidos */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 bg-slate-50/60">
          <h2 className="text-sm font-semibold text-slate-800">Sinais Vitais</h2>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {vitalField('Peso (kg)', weight, setWeight, 'Ex: 12.5')}
          {vitalField('Temp. (°C)', temperature, setTemperature, 'Ex: 38.5')}
          {vitalField('FC (bpm)', heartRate, setHeartRate, 'Ex: 90')}
          {vitalField('FR (mov/min)', respRate, setRespRate, 'Ex: 25')}
          {vitalField('PAS (mmHg)', systolic, setSystolic, 'Ex: 120')}
          {vitalField('Glicemia (mg/dL)', glucose, setGlucose, 'Ex: 90')}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
          <Check className="h-4 w-4" /> {success}
        </div>
      )}

      {!isFinalized && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => submit('alta')} disabled={pending || !!success}
              title="Encerra o acompanhamento. NÃO lança no caixa — fica só no histórico do pet."
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white disabled:opacity-50 transition-colors shadow-sm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Dar alta (sem caixa)
            </button>
            <button type="button" onClick={() => submit('consulta')} disabled={pending || !!success}
              title="Converte em consulta normal, já com o prontuário e sinais preenchidos."
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 py-3 text-sm font-bold text-white disabled:opacity-50 transition-colors shadow-sm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Virar consulta
            </button>
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            <strong>Dar alta:</strong> registra no histórico do pet, sem cobrança. {' · '}
            <strong>Virar consulta:</strong> abre o prontuário completo para lançar serviços/medicação.
          </p>
        </>
      )}
      {isFinalized && <p className="text-center text-xs text-slate-500 italic">Atendimento já finalizado.</p>}
    </div>
  )
}
