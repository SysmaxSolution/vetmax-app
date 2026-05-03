'use client'

import { useState, useCallback } from 'react'
import { ArrowDownCircle, RefreshCw, PlusCircle } from 'lucide-react'
import { listOutflows, type CashierOutflow } from '@/lib/actions/cashier-sessions'
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
  sangria:              'Sangria',
  despesa_operacional:  'Despesa Operacional',
  fornecedor:           'Fornecedor',
  estorno:              'Estorno',
  other:                'Outro',
}

const CATEGORY_COLOR: Record<string, string> = {
  sangria:             'bg-red-100 text-red-700',
  despesa_operacional: 'bg-orange-100 text-orange-700',
  fornecedor:          'bg-amber-100 text-amber-700',
  estorno:             'bg-slate-100 text-slate-600',
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

  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const res = await listOutflows()
    setRefreshing(false)
    if (!('error' in res)) setOutflows(res)
  }, [])

  const totalOutflows = outflows.reduce((sum, o) => sum + o.amount, 0)

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
            {outflows.length === 0
              ? 'Nenhuma saída registrada'
              : `${outflows.length} saída${outflows.length !== 1 ? 's' : ''} — Total: ${fmt(totalOutflows)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          {canManage && (
            <button
              data-testid="btn-registrar-saida"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition-colors"
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
          <p className="text-sm font-medium text-slate-500">Nenhuma saída registrada hoje</p>
          <p className="mt-1 text-xs text-slate-400">
            Sangrias, despesas e estornos aparecem aqui
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {outflows.map(outflow => (
            <div
              key={outflow.id}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                <ArrowDownCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[outflow.category] ?? 'bg-slate-100 text-slate-600'}`}>
                    {CATEGORY_LABELS[outflow.category] ?? outflow.category}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700 truncate">{outflow.description}</p>
                <p className="text-xs text-slate-400">{fmtDate(outflow.created_at)}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-lg font-bold text-red-600">- {fmt(outflow.amount)}</p>
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">Total de Saídas</span>
            <span className="text-base font-bold text-red-600">- {fmt(totalOutflows)}</span>
          </div>
        </div>
      )}
    </>
  )
}
