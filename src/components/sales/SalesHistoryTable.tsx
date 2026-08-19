'use client'

import { useState, useTransition } from 'react'
import { XCircle, Clock, AlertTriangle, BellRing } from 'lucide-react'
import { cancelSale, requestSaleCorrection, type Sale } from '@/lib/actions/sales'
import { PAYMENT_LABELS } from './SalesCart'

interface SalesHistoryTableProps {
  sales:           Sale[]
  clinicId:        string
  onSalesUpdate:   (sales: Sale[]) => void
}

const STATUS_STYLE: Record<string, string> = {
  paid:      'bg-emerald-100 text-emerald-700',
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
  // B4 (reunião 04/06): operador sem permissão de cancelar não fica sem saída —
  // o modal vira "Solicitar correção" e o admin recebe alerta no chat interno.
  const [mode,    setMode]    = useState<'cancel' | 'request'>('cancel')
  const [success, setSuccess] = useState('')

  const active    = sales.filter(s => s.payment_status !== 'cancelled')
  const totalDay  = active.reduce((s, v) => s + v.total_amount, 0)

  function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) { setError('Informe o motivo.'); return }
    setError('')
    startTransition(async () => {
      const result = await cancelSale(cancelTarget, cancelReason.trim())
      if ('error' in result) {
        // Sem permissão (rpc_cancel_sale exige admin/owner/manager) →
        // oferece o caminho de solicitação de correção ao administrador.
        if (/[Aa]penas admin/.test(result.error)) {
          setMode('request')
          setError('')
          return
        }
        setError(result.error)
        return
      }
      onSalesUpdate(sales.map(s => s.id === cancelTarget
        ? { ...s, payment_status: 'cancelled', cancelled_at: new Date().toISOString() }
        : s
      ))
      setCancelTarget(null)
      setCancelReason('')
    })
  }

  function handleRequestCorrection() {
    if (!cancelTarget || !cancelReason.trim()) { setError('Informe o motivo.'); return }
    setError('')
    startTransition(async () => {
      const result = await requestSaleCorrection(cancelTarget, cancelReason.trim())
      if ('error' in result) { setError(result.error); return }
      setCancelTarget(null)
      setCancelReason('')
      setMode('cancel')
      setSuccess(`Solicitação enviada — ${result.notified_admins} administrador(es) notificado(s) no chat interno.`)
      setTimeout(() => setSuccess(''), 6000)
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
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <BellRing className="h-4 w-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 font-mono tabular-nums">R$ {totalDay.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Receita do dia</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{active.length}</p>
          <p className="text-xs text-slate-400 mt-1">Vendas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-400 font-mono tabular-nums">{sales.length - active.length}</p>
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
                    <td className="px-4 py-3 text-slate-600 font-mono tabular-nums text-xs">{time}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      {sale.tutor_name && <span className="block text-xs text-slate-400">{sale.tutor_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</td>
                    <td className={`px-4 py-3 text-right font-semibold font-mono tabular-nums ${cancelled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
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

      {/* Modal de cancelamento / solicitação de correção (B4) */}
      {cancelTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 ${mode === 'request' ? 'bg-amber-100' : 'bg-red-100'}`}>
                {mode === 'request'
                  ? <BellRing className="h-5 w-5 text-amber-600" />
                  : <AlertTriangle className="h-5 w-5 text-red-600" />}
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                {mode === 'request' ? 'Solicitar correção ao administrador' : 'Cancelar venda'}
              </h2>
            </div>
            {mode === 'request' ? (
              <p className="text-sm text-slate-600">
                Você não tem permissão para cancelar vendas fechadas. Envie uma
                solicitação — o administrador recebe o alerta no chat interno e
                faz a correção. O pedido fica registrado na auditoria.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Esta ação não reverte o estoque automaticamente. Informe o motivo:
              </p>
            )}
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo obrigatório..."
              className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                mode === 'request' ? 'focus:ring-amber-400' : 'focus:ring-red-400'
              }`}
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCancelTarget(null); setMode('cancel') }}
                disabled={isPending}
                className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              {mode === 'request' ? (
                <button
                  type="button"
                  onClick={handleRequestCorrection}
                  disabled={isPending || !cancelReason.trim()}
                  className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
                >
                  {isPending ? 'Enviando...' : 'Enviar solicitação'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isPending || !cancelReason.trim()}
                  className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
