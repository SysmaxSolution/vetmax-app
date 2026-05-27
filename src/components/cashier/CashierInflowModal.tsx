'use client'

import { useState } from 'react'
import { Loader2, X, Plus } from 'lucide-react'
import { recordManualInflow } from '@/lib/actions/cashier-manual'

const REASON_PRESETS: { value: string; label: string }[] = [
  { value: 'suprimento',         label: 'Suprimento (entrada de caixa)' },
  { value: 'troco_inicial',      label: 'Reposição de troco' },
  { value: 'devolucao_cliente',  label: 'Devolução de cliente' },
  { value: 'aporte_socio',       label: 'Aporte do sócio' },
  { value: 'other',              label: 'Outra entrada manual' },
]

const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Dinheiro' },
  { value: 'pix',   label: 'PIX' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
] as const

interface Props {
  onClose:    () => void
  onSuccess:  () => void
  onToast:    (msg: string, type: 'success' | 'error') => void
}

export default function CashierInflowModal({ onClose, onSuccess, onToast }: Props) {
  const [amount,      setAmount]      = useState('')
  const [preset,      setPreset]      = useState<string>('suprimento')
  const [description, setDescription] = useState('')
  const [method,      setMethod]      = useState<'cash'|'pix'|'transfer'|'other'>('cash')
  const [date,        setDate]        = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading,     setLoading]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const amountNum = parseFloat(amount.replace(',', '.'))
    if (isNaN(amountNum) || amountNum <= 0) {
      onToast('Valor inválido', 'error')
      return
    }

    const presetLabel = REASON_PRESETS.find(p => p.value === preset)?.label ?? 'Entrada manual'
    const finalReason = description.trim()
      ? `${presetLabel} — ${description.trim()}`
      : presetLabel

    setLoading(true)
    const res = await recordManualInflow({
      amount:          amountNum,
      reason:          finalReason,
      payment_method:  method,
      effective_date:  date,
    })
    setLoading(false)

    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Entrada lançada com sucesso!', 'success')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
              <Plus className="h-5 w-5 text-emerald-700" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Lançar Entrada Manual</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Tipo</label>
            <select
              value={preset}
              onChange={e => setPreset(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {REASON_PRESETS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Valor (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0,00"
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Data efetiva</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Forma</label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`rounded-xl border-2 px-2 py-2 text-xs font-semibold transition-all ${
                    method === m.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Observação</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalhe a entrada (opcional)..."
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
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
              disabled={loading}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Lançar Entrada</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
