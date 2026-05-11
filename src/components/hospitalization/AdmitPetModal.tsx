'use client'

import { useState, useTransition, useRef } from 'react'
import { X, BedDouble, Loader2, AlertTriangle, Mic, Square } from 'lucide-react'
import { createHospitalization, type HospitalizationStatus } from '@/lib/actions/hospitalizations'

// ─── Opções de Ala ────────────────────────────────────────────────────────────

const WARD_OPTIONS: { value: HospitalizationStatus; label: string; description: string; color: string }[] = [
  {
    value:       'observation',
    label:       'Observação',
    description: 'Monitoramento de curta duração, sem risco imediato',
    color:       'border-amber-300 bg-amber-50 text-amber-700',
  },
  {
    value:       'ward',
    label:       'Enfermaria',
    description: 'Internação padrão para tratamento e recuperação',
    color:       'border-blue-300 bg-blue-50 text-blue-700',
  },
  {
    value:       'icu',
    label:       'UTA',
    description: 'Unidade de Terapia Animal — cuidados intensivos',
    color:       'border-red-300 bg-red-50 text-red-700',
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patientId:      string
  patientName:    string
  consultationId?: string
  onClose:        () => void
  onSuccess:      (reason: string, status: HospitalizationStatus) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdmitPetModal({
  patientId,
  patientName,
  consultationId,
  onClose,
  onSuccess,
}: Props) {
  const [status,      setStatus]      = useState<HospitalizationStatus>('observation')
  const [reason,      setReason]      = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<any>(null)

  function toggleVoice() {
    if (isRecording) { recognitionRef.current?.stop(); return }
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = false
    rec.onstart  = () => setIsRecording(true)
    rec.onend    = () => setIsRecording(false)
    rec.onerror  = () => setIsRecording(false)
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
      setReason(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    recognitionRef.current = rec
    rec.start()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) { setError('Informe o motivo da internação.'); return }
    setError(null)

    startTransition(async () => {
      const result = await createHospitalization({
        patient_id:      patientId,
        consultation_id: consultationId,
        status,
        reason,
      })
      if ('error' in result) {
        setError(result.error)
      } else {
        onSuccess(reason, status)
        onClose()
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <BedDouble className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Solicitar Internação</h2>
              <p className="text-xs text-rose-100">Internar {patientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-rose-100 hover:bg-rose-500 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Seleção de ala */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Ala de Internação</label>
            <div className="space-y-2">
              {WARD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`w-full flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    status === opt.value
                      ? opt.color + ' ring-2 ring-offset-1 ring-current'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    status === opt.value ? 'border-current' : 'border-slate-300'
                  }`}>
                    {status === opt.value && (
                      <div className="h-2 w-2 rounded-full bg-current" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-xs opacity-75">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Motivo da Internação <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={toggleVoice}
                title={isRecording ? 'Parar gravação' : 'Ditar motivo por voz'}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isRecording
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isRecording ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                {isRecording ? 'Parar' : 'Ditar'}
              </button>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Ex: Gastroenterite hemorrágica severa, necessita fluidoterapia e monitoramento..."
              className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 ${
                isRecording ? 'border-red-300 focus:border-red-500 bg-red-50/30' : 'border-slate-300 focus:border-rose-500'
              }`}
            />
          </div>

          {/* Aviso UTI */}
          {status === 'icu' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                Paciente será sinalizado como <strong>estado crítico</strong> no Kanban de Internação. A equipe de plantão será alertada.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-60"
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Internando...</>
                : <><BedDouble className="h-4 w-4" /> Confirmar Internação</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
