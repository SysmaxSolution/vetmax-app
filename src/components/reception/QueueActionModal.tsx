'use client'

import { useState } from 'react'
import { X, AlertTriangle, Calendar } from 'lucide-react'
import { DateTimePicker } from '@/components/ui/DatePicker'
import { cancelAttendance } from '@/lib/actions/attendance-cancel'
import { rescheduleConsultation } from '@/lib/actions/consultations'

type Mode = 'cancel' | 'reschedule'

interface Props {
  mode:           Mode
  consultationId: string
  patientName:    string
  tutorName:      string
  onClose:        () => void
  onSuccess:      (mode: Mode) => void
}

export default function QueueActionModal({ mode, consultationId, patientName, tutorName, onClose, onSuccess }: Props) {
  const [reason, setReason]       = useState('')
  const [newDate, setNewDate]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleCancel() {
    if (reason.trim().length < 3) {
      setError('Informe um motivo (mínimo 3 caracteres).')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await cancelAttendance({ entity: 'consultation', id: consultationId, reason: reason.trim() })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess('cancel')
  }

  async function handleReschedule() {
    if (!newDate) {
      setError('Selecione a nova data e horário.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await rescheduleConsultation(consultationId, newDate)
    setSubmitting(false)
    if (res?.error) { setError(res.error); return }
    onSuccess('reschedule')
  }

  const isCancel = mode === 'cancel'

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isCancel ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
              {isCancel ? <AlertTriangle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isCancel ? 'Cancelar atendimento' : 'Reagendar atendimento'}
              </h2>
              <p className="text-xs text-slate-500">
                {patientName} · Tutor: {tutorName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {isCancel ? (
            <>
              <p className="text-sm text-slate-600">
                Esta ação remove o atendimento da fila e marca como <span className="font-semibold">cancelado</span>. Informe o motivo (auditoria CFMV).
              </p>
              <textarea
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex.: tutor desistiu, pet passou bem em casa, agendamento duplicado..."
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
              <p className="text-[11px] text-slate-400 text-right">{reason.length}/500</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Selecione a nova data e horário. O atendimento volta para <span className="font-semibold">Agendados</span> e some da fila atual.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nova data e horário</label>
                <DateTimePicker value={newDate} onChange={setNewDate} placeholder="Selecione data e horário" />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            onClick={isCancel ? handleCancel : handleReschedule}
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              isCancel ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {submitting ? 'Processando...' : isCancel ? 'Cancelar atendimento' : 'Confirmar reagendamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
