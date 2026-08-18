'use client'

import { useState, useCallback } from 'react'
import { ArrowDownCircle, RefreshCw, PlusCircle, BadgeCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { listOutflows, verifyOutflow, type CashierOutflow } from '@/lib/actions/cashier-sessions'
import CashierOutflowModal from './CashierOutflowModal'

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const CATEGORY_LABELS: Record<string, string> = {
  sangria:              'Sangria (retirada)',
  despesa_operacional:  'Despesa Operacional',
  fornecedor:           'Fornecedor',
  estorno:              'Estorno',
  troco:                'Troco',
  other:                'Outro',
}

const CATEGORY_COLOR: Record<string, string> = {
  sangria:             'bg-red-100 text-red-700',
  despesa_operacional: 'bg-orange-100 text-orange-700',
  fornecedor:          'bg-amber-100 text-amber-700',
  estorno:             'bg-slate-100 text-slate-600',
  troco:               'bg-sky-100 text-sky-700',
  other:               'bg-slate-100 text-slate-600',
}

interface Props {
  initialOutflows: CashierOutflow[]
  sessionId:       string | undefined
  userRole:        string
  onToast:         (msg: string, type: 'success' | 'error') => void
}

export default function CashierTabOutflows({ initialOutflows, sessionId, userRole, onToast }: Props) {
  const [outflows,    setOutflows]    = useState<CashierOutflow[]>(initialOutflows)
  const [refreshing,  setRefreshing]  = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const canManage = ['admin', 'owner', 'manager'].includes(userRole)
  const canVerify = ['admin', 'owner', 'accountant'].includes(userRole)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    // Período corrente do caixa: saídas da sessão aberta; sem sessão, todas as recentes
    const res = await listOutflows(sessionId ? { session_id: sessionId } : undefined)
    setRefreshing(false)
    if (!('error' in res)) setOutflows(res)
  }, [sessionId])

  const handleVerify = async (id: string) => {
    setVerifyingId(id)
    const res = await verifyOutflow(id)
    setVerifyingId(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setOutflows(prev => prev.map(o => o.id === id ? { ...o, verified_at: new Date().toISOString() } : o))
    onToast('Saída verificada.', 'success')
  }

  const totalOutflows = outflows.reduce((sum, o) => sum + Number(o.amount), 0)

  // Totais por categoria para o rodapé do período corrente do caixa
  const byCategory = outflows.reduce<Record<string, { amount: number; count: number }>>((acc, o) => {
    acc[o.category] ??= { amount: 0, count: 0 }
    acc[o.category].amount += Number(o.amount)
    acc[o.category].count  += 1
    return acc
  }, {})

  return (
    <>
      {showModal && (
        <CashierOutflowModal
          sessionId={sessionId}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            refresh()
          }}
          onToast={onToast}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Saídas do Caixa</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {sessionId ? 'Saídas do caixa atual (desde a abertura)' : 'Saídas recentes — nenhum caixa aberto'}
            {outflows.length > 0 && ` · ${outflows.length} saída${outflows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          {canManage && (
            <button
              data-testid="btn-registrar-saida"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              Registrar Saída
            </button>
          )}
        </div>
      </div>

      {outflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ArrowDownCircle className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhuma saída registrada neste caixa</p>
          <p className="mt-1 text-xs text-slate-400">
            Sangria é quando você tira dinheiro da gaveta para guardar no cofre ou pagar algo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {outflows.map(outflow => (
            <div
              key={outflow.id}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                <ArrowDownCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[outflow.category] ?? 'bg-slate-100 text-slate-600'}`}>
                    {CATEGORY_LABELS[outflow.category] ?? outflow.category}
                  </span>
                  {outflow.verified_at && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      <BadgeCheck className="h-3 w-3" /> Verificada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-700 truncate">{outflow.description}</p>
                <p className="text-xs text-slate-400 font-mono tabular-nums">{fmtDate(outflow.created_at)}</p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                <p className="text-lg font-bold text-red-600 font-mono tabular-nums">- {fmt(Number(outflow.amount))}</p>
                {canVerify && !outflow.verified_at && (
                  <button
                    onClick={() => handleVerify(outflow.id)}
                    disabled={verifyingId === outflow.id}
                    title="Marcar como conferida pelo admin — entra no Total Verificado"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {verifyingId === outflow.id
                      ? <Spinner size="sm" />
                      : <BadgeCheck className="h-3.5 w-3.5" />}
                    Verificar
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Totalizadores do período corrente do caixa */}
          <div
            data-testid="outflows-totals"
            data-mentor-step="cashier-outflows-total"
            className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 space-y-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Totais do caixa atual
            </p>
            {Object.entries(byCategory).map(([cat, v]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="text-xs text-slate-400 ml-1 font-mono tabular-nums">({v.count})</span>
                </span>
                <span className="font-semibold text-red-600 font-mono tabular-nums">- {fmt(v.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-700">Total de Saídas</span>
              <span data-testid="outflows-grand-total" className="text-base font-bold text-red-600 font-mono tabular-nums">- {fmt(totalOutflows)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
