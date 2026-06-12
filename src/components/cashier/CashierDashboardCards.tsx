'use client'

import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react'
import type { CashierDashboard } from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_LABELS: Record<string, string> = {
  pix:           'PIX',
  credit:        'Crédito',
  debit:         'Débito',
  cash:          'Dinheiro',
  convenio:      'Convênio',
  courtesy:      'Cortesia',
  other:         'Outro',
  nao_informado: 'Não informado',
}

interface Props {
  dashboard: CashierDashboard
}

export default function CashierDashboardCards({ dashboard }: Props) {
  const {
    total_inflows, total_outflows, net_balance,
    pending_amount, pending_count, by_payment_method,
  } = dashboard

  const cards = [
    {
      label:   'Recebimentos',
      value:   fmt(total_inflows),
      icon:    <TrendingUp className="h-4 w-4 text-emerald-600" />,
      bg:      'bg-emerald-50',
      val_cls: 'text-emerald-700',
      suffix:  'baixados',
    },
    {
      label:   'Saídas',
      value:   fmt(total_outflows),
      icon:    <TrendingDown className="h-4 w-4 text-red-500" />,
      bg:      'bg-red-50',
      val_cls: 'text-red-600',
      suffix:  'baixadas',
    },
    {
      label:   'Saldo Líquido',
      value:   fmt(net_balance),
      icon:    <DollarSign className="h-4 w-4 text-blue-600" />,
      bg:      'bg-blue-50',
      val_cls: net_balance >= 0 ? 'text-blue-700' : 'text-red-600',
      suffix:  'do dia',
    },
    {
      label:   'Pendentes',
      value:   fmt(pending_amount),
      icon:    <AlertCircle className="h-4 w-4 text-amber-500" />,
      bg:      'bg-amber-50',
      val_cls: pending_amount > 0 ? 'text-amber-700' : 'text-slate-500',
      suffix:  pending_count === 1 ? '1 lançamento a baixar' : `${pending_count} lançamentos a baixar`,
    },
  ]

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.bg}`}>
                {c.icon}
              </div>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${c.val_cls}`}>{c.value}</p>
            {c.suffix && <p className="text-xs text-slate-400 mt-0.5">{c.suffix}</p>}
          </div>
        ))}
      </div>

      {/* Payment method breakdown */}
      {Object.keys(by_payment_method).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Entradas por Forma de Pagamento
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {Object.entries(by_payment_method).map(([method, data]) => (
              <div key={method} className="text-center rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-1">{PAYMENT_LABELS[method] ?? method}</p>
                <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt(data.amount)}</p>
                <p className="text-[10px] text-slate-400">{data.count} lanç.</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
