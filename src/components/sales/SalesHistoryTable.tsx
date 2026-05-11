'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { cancelSale, type Sale } from '@/lib/actions/sales'
import { PAYMENT_LABELS } from './SalesCart'

interface SalesHistoryTableProps {
  sales:           Sale[]
  clinicId:        string
  onSalesUpdate:   (sales: Sale[]) => void
}

const STATUS_STYLE: Record<string, string> = {
  paid:      'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-500 line-through',
}

const STATUS_LABEL: Record<string, string> = {
  paid:      'Pago',
  pending:   'Pendente',
  cancelled: 'Cancelado',
}

export default function SalesHistoryTable({ sales, clinicId, onSalesUpdate }: SalesHistoryTableProps) {
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [error,        setError]        = useState('')
  const [isPending, startTransition]    = useTransition()

  const active    = sales.filter(s => s.payment_status !== 'cancelled')
  const totalDay  = active.reduce((s, v) => s + v.total_amount, 0)

  function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) { setError('Informe o motivo.'); return }
    setError('')
    startTransition(async () => {
      const result = await cancelSale(cancelTarget, cancelReason.trim())
      if ('error' in result) { setError(result.error); return }
      onSalesUpdate(sales.map(s => s.id === cancelTarget
        ? { ...s, payment_status: 'cancelled', cancelled_at: new Date().toISOString() }
        : s
      ))
      setCancelTarget(null)
      setCancelReason('')
    })
  }

  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 text-center">
        <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Nenhuma venda registrada hoje</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">R$ {totalDay.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Receita do dia</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{active.length}</p>
          <p className="text-xs text-slate-400 mt-1">Vendas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{sales.length - active.length}</p>
          <p className="text-xs text-slate-400 mt-1">Canceladas</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Horário</th>
                <th className="text-left px-4 py-3 font-semibold">Itens</th>
                <th className="text-left px-4 py-3 font-semibold">Pagamento</th>
                <th className="text-right px-4 py-3 font-semibold">Total</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map(sale => {
                const time = new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                const itemCount = (sale.items ?? []).length
                const cancelled = sale.payment_status === 'cancelled'

                return (
                  <tr key={sale.id} className={`hover:bg-slate-50/50 transition-colors ${cancelled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{time}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      {sale.tutor_name && <span className="block text-xs text-slate-400">{sale.tutor_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${cancelled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      R$ {sale.total_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[sale.payment_status] ?? ''}`}>
                        {STATUS_LABEL[sale.payment_status] ?? sale.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!cancelled && (
                        <button
                          type="button"
                          onClick={() => { setCancelTarget(sale.id); setCancelReason(''); setError('') }}
                          className="text-xs text-slate-300 hover:text-red-500 transition-colors"
                          title="Cancelar venda"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de cancelamento */}
      {cancelTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-100 rounded-full p-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">Cancelar venda</h2>
            </div>
            <p className="text-sm text-slate-600">
              Esta ação não reverte o estoque automaticamente. Informe o motivo:
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo obrigatório..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={isPending}
                className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending || !cancelReason.trim()}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
