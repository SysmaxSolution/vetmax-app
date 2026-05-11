'use client'

import { useState, useTransition } from 'react'
import { X, Trash2, Loader2 } from 'lucide-react'
import { removeFromQueue } from '@/lib/actions/queue'
import { useRouter } from 'next/navigation'

interface Props {
  consultationId: string
  patientId:      string
  patientName:    string
  module:         'triage' | 'vet' | 'exams'
  redirectTo?:    string
  onClose:        () => void
}

export function RemoveFromQueueModal({
  consultationId,
  patientId,
  patientName,
  module,
  redirectTo,
  onClose,
}: Props) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const MODULE_LABELS = { triage: 'Triagem', vet: 'Consultório', exams: 'Exames' }

  function handleConfirm() {
    if (!reason.trim()) { setError('Informe o motivo da remoção.'); return }
    setError('')
    startTransition(async () => {
      const res = await removeFromQueue({ consultationId, patientId, patientName, module, reason })
      if ('error' in res) { setError(res.error); return }
      onClose()
      if (redirectTo) router.push(redirectTo)
      else router.back()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Remover da Fila de {MODULE_LABELS[module]}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Paciente <strong>{patientName}</strong> será removido da fila e a consulta marcada como cancelada.
            Esta ação é auditada.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Motivo da remoção *
            </label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              placeholder="Ex: Pet retirado pelo tutor antes do atendimento..."
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || !reason.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isPending ? 'Removendo...' : 'Remover da Fila'}
          </button>
        </div>
      </div>
    </div>
  )
}
