'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import { cancelAttendance, type AttendanceEntity } from '@/lib/actions/attendance-cancel'

const ENTITY_LABEL: Record<AttendanceEntity, string> = {
  triage:          'triagem',
  consultation:    'atendimento',
  exam:            'requisição de exame',
  hospitalization: 'internação',
  surgery:         'cirurgia',
}

interface Props {
  entity:        AttendanceEntity
  id:            string
  patientName?:  string | null
  onClose:       () => void
  onCancelled?:  () => void
}

export default function CancelAttendanceModal({ entity, id, patientName, onClose, onCancelled }: Props) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Portal exige DOM — evita mismatch de hidratação no primeiro render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await cancelAttendance({ entity, id, reason })
      if ('error' in res) {
        setError(res.error)
        return
      }
      onCancelled?.()
      onClose()
      router.refresh()
    })
  }

  if (!mounted) return null

  // Portal no <body>: o modal era renderizado DENTRO do <Link> do card da
  // fila — re-renders do realtime remontavam o card e engoliam os cliques
  // (incidente Almavet 27/07: "cancela mas a tela pisca; a Mel não vai"),
  // e o clique no backdrop borbulhava para o Link, navegando para o pet.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cancelar ${ENTITY_LABEL[entity]}`}
      className="fixed inset-0 z-[9970] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={e => { e.stopPropagation(); onClose() }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Cancelar {ENTITY_LABEL[entity]}
              </h2>
              {patientName && (
                <p className="text-xs text-slate-500">{patientName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
              Motivo do cancelamento <span className="text-red-600">*</span>
            </label>
            <textarea
              id="cancel-reason"
              required
              minLength={3}
              maxLength={500}
              rows={4}
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex.: Tutor desistiu, paciente não compareceu, agendamento duplicado..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <p className="mt-1 text-xs text-slate-400">{reason.length}/500 caracteres</p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Esta ação remove o card da fila ativa. O registro fica no histórico marcado como cancelado.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {pending ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
