'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { registerOutflow, type CashierOutflow } from '@/lib/actions/cashier-sessions'
import type { Supplier } from '@/lib/actions/suppliers'
import SupplierAutocomplete from '@/components/registry/suppliers/SupplierAutocomplete'

const CATEGORY_OPTIONS: { value: CashierOutflow['category']; label: string }[] = [
  { value: 'sangria',             label: 'Sangria de Caixa' },
  { value: 'despesa_operacional', label: 'Despesa Operacional' },
  { value: 'fornecedor',          label: 'Pagamento a Fornecedor' },
  { value: 'estorno',             label: 'Estorno em Dinheiro' },
  { value: 'other',               label: 'Outro' },
]

interface Props {
  sessionId?: string
  onClose:    () => void
  onSuccess:  () => void
  onToast:    (msg: string, type: 'success' | 'error') => void
}

export default function CashierOutflowModal({ sessionId, onClose, onSuccess, onToast }: Props) {
  const [amount,      setAmount]      = useState('')
  const [category,    setCategory]    = useState<CashierOutflow['category']>('sangria')
  const [description, setDescription] = useState('')
  const [supplier,    setSupplier]    = useState<Supplier | null>(null)
  const [loading,     setLoading]     = useState(false)

  const showSupplierField = category === 'fornecedor'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const amountNum = parseFloat(amount.replace(',', '.'))
    if (isNaN(amountNum) || amountNum <= 0) {
      onToast('Valor inválido', 'error')
      return
    }
    if (!description.trim()) {
      onToast('Descrição é obrigatória', 'error')
      return
    }
    if (showSupplierField && !supplier) {
      onToast('Selecione ou cadastre um fornecedor', 'error')
      return
    }

    setLoading(true)
    const res = await registerOutflow({
      amount:      amountNum,
      category,
      description: description.trim(),
      session_id:  sessionId,
      supplier_id: showSupplierField ? supplier?.id : null,
    })
    setLoading(false)

    if ('error' in res) { onToast(res.error, 'error'); return }

    onToast('Saída registrada com sucesso!', 'success')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Registrar Saída</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Categoria</label>
            <select
              value={category}
              onChange={e => {
                const next = e.target.value as CashierOutflow['category']
                setCategory(next)
                if (next !== 'fornecedor') setSupplier(null)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {CATEGORY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {showSupplierField && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                Fornecedor <span className="text-red-500">*</span>
              </label>
              <SupplierAutocomplete
                value={supplier}
                onChange={setSupplier}
                placeholder="Buscar fornecedor cadastrado..."
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Se não encontrar, digite o nome e clique em &quot;Cadastrar como novo fornecedor&quot;.
              </p>
            </div>
          )}

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
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descreva o motivo da saída..."
              required
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
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
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar Saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
