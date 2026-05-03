'use client'

import { useState } from 'react'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import { reverseCashierEntry } from '@/lib/actions/cashier-sessions'
import type { CentralCashierEntry } from '@/lib/actions/core-management'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  entry:     CentralCashierEntry
  onClose:   () => void
  onSuccess: () => void
  onToast:   (msg: string, type: 'success' | 'error') => void
}

export default function CashierReversalModal({ entry, onClose, onSuccess, onToast }: Props) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      onToast('Justificativa é obrigatória para estorno', 'error')
      return
    }

    setLoading(true)
    const res = await reverseCashierEntry(entry.id, reason.trim())
    setLoading(false)

    if ('error' in res) { onToast(res.error, 'error'); return }

    onToast('Estorno registrado com sucesso!', 'success')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Estornar Lançamento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Entry summary */}
        <div className="rounded-xl bg-red-50 border border-red-100 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-red-800">
                {fmt(Number(entry.amount))} — {entry.reason ?? entry.source_module}
              </p>
              <p className="text-red-600 text-xs mt-0.5">
                {new Date(entry.created_at).toLocaleString('pt-BR')}
              </p>
              <p className="text-red-600 text-xs mt-0.5">
                Esta ação é irreversível. O lançamento será marcado como estornado.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Justificativa do Estorno <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Descreva o motivo do estorno (ex: cobrança duplicada, erro de valor)..."
              required
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
