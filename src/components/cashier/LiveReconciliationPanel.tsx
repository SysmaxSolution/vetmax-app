'use client'

import { useState } from 'react'
import {
  Activity, RefreshCw, Banknote, Smartphone, CreditCard,
  Wallet, Users, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { getSessionReconciliation, type SessionReconciliation } from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const METHOD_META: Record<string, { label: string; icon: React.ElementType }> = {
  cash:   { label: 'Dinheiro', icon: Banknote   },
  pix:    { label: 'PIX',      icon: Smartphone },
  credit: { label: 'Crédito',  icon: CreditCard },
  debit:  { label: 'Débito',   icon: CreditCard },
}
// Ordem fixa de exibição das principais formas
const METHOD_ORDER = ['cash', 'pix', 'credit', 'debit'] as const

interface Props {
  sessionId: string
  onToast: (msg: string, type: 'success' | 'error') => void
}

export default function LiveReconciliationPanel({ sessionId, onToast }: Props) {
  const [data,    setData]    = useState<SessionReconciliation | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await getSessionReconciliation(sessionId)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setData(res)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
        <Activity className="h-4 w-4 text-teal-500" />
        <h3 className="text-sm font-semibold text-slate-700">Reconciliação ao Vivo</h3>
        <span className="text-xs text-slate-400">· posição do caixa agora, sem fechar</span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {data ? 'Atualizar' : 'Ver posição agora'}
        </button>
      </div>

      {!data ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">
          Calcule a posição atual do caixa a qualquer momento para conferir antes do fechamento.
        </p>
      ) : (
        <div className="p-5 space-y-5">
          {/* Consistência */}
          {data.orphan_count > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {data.orphan_count} lançamento(s) não vinculado(s) à sessão — avise o suporte.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Lançamentos consistentes — tudo vinculado à sessão.
            </div>
          )}

          {/* Esperado por forma */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Esperado por forma</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {METHOD_ORDER.map(m => {
                const meta = METHOD_META[m]
                const Icon = meta.icon
                const val = m === 'cash' ? data.expected_cash : (data.by_method[m] ?? 0)
                return (
                  <div key={m} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <Icon className="h-3.5 w-3.5" />{meta.label}
                      {m === 'cash' && <span className="text-[10px] text-slate-400">(gaveta)</span>}
                    </div>
                    <p className="text-base font-bold text-slate-900 font-mono tabular-nums">{fmt(val)}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">Entradas</p>
              <p className="text-sm font-bold text-emerald-700 font-mono tabular-nums">{fmt(data.total_inflows)}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">Saídas</p>
              <p className="text-sm font-bold text-red-600 font-mono tabular-nums">{fmt(data.total_outflows)}</p>
            </div>
            <div className="rounded-lg bg-sky-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">Esperado total</p>
              <p className="text-sm font-bold text-sky-700 font-mono tabular-nums">{fmt(data.expected_total)}</p>
            </div>
          </div>

          {data.pending_amount > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-slate-500"><Clock className="h-3.5 w-3.5" /> Ainda a receber (pendente)</span>
              <span className="font-semibold text-slate-700 font-mono tabular-nums">{fmt(data.pending_amount)}</span>
            </div>
          )}

          {/* Por operador */}
          {data.by_operator.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                <Users className="h-3.5 w-3.5" /> Movimentação por operador
              </p>
              <div className="space-y-1.5">
                {data.by_operator.map(op => (
                  <div key={op.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-1.5 last:border-0">
                    <span className="text-slate-700">{op.name}</span>
                    <span className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="text-emerald-600">+{fmt(op.inflows)}</span>
                      {op.outflows > 0 && <span className="text-red-500">−{fmt(op.outflows)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
