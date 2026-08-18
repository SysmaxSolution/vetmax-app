'use client'

import { useState } from 'react'
import { Calendar, X, Save } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { updateCashierEffectiveDate } from '@/lib/actions/cashier-manual'
import type { CentralCashierEntry } from '@/lib/actions/core-management'

interface Props {
  entry:     CentralCashierEntry & { effective_date?: string | null }
  onClose:   () => void
  onSuccess: () => void
  onToast:   (msg: string, type: 'success' | 'error') => void
}

export default function CashierEditDateModal({ entry, onClose, onSuccess, onToast }: Props) {
  const original = (entry.effective_date as string | null) ?? entry.created_at.slice(0, 10)
  const [date,    setDate]    = useState(original)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { onToast('Informe uma data válida', 'error'); return }
    if (date > new Date().toISOString().slice(0, 10)) {
      onToast('Data não pode ser futura', 'error')
      return
    }
    setLoading(true)
    const res = await updateCashierEffectiveDate(entry.id, date)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Data efetiva atualizada.', 'success')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5 animate-scale-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
              <Calendar className="h-5 w-5 text-amber-700" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Editar Data Retroativa</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs space-y-1">
          <p className="text-slate-500">
            <strong className="text-slate-800">{entry.reason ?? entry.source_module}</strong>
          </p>
          <p className="text-slate-600">
            Valor: <strong className="font-mono tabular-nums">{Number(entry.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            {' · '}Lançado em <span className="font-mono tabular-nums">{new Date(entry.created_at).toLocaleDateString('pt-BR')}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Data efetiva contábil
            </label>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              Atualiza a data contábil deste recebimento. Útil quando o pagamento foi recebido em data anterior à do lançamento.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Spinner /> : <><Save className="h-4 w-4" /> Salvar Data</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
