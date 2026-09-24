'use client'

import { useState, useTransition } from 'react'
import { BarChart3, TrendingUp, ShoppingCart, XCircle } from 'lucide-react'
import { getSalesSummary, type SalesSummary } from '@/lib/actions/sales'

const PAYMENT_LABELS: Record<string, string> = {
  cash:     'Dinheiro',
  credit:   'Cartão Crédito',
  debit:    'Cartão Débito',
  pix:      'Pix',
  convenio: 'Convênio',
  other:    'Outro',
}

interface SalesReportsProps {
  initialSummary: SalesSummary | null
}

export default function SalesReports({ initialSummary }: SalesReportsProps) {
  const today = new Date().toISOString().split('T')[0]
  const [start,    setStart]    = useState(today)
  const [end,      setEnd]      = useState(today)
  const [summary,  setSummary]  = useState<SalesSummary | null>(initialSummary)
  const [error,    setError]    = useState('')
  const [isPending, startTransition] = useTransition()

  function fetchReport() {
    setError('')
    startTransition(async () => {
      const result = await getSalesSummary(start, end)
      if ('error' in result) { setError(result.error); return }
      setSummary(result)
    })
  }

  const maxAmount = summary
    ? Math.max(...(summary.by_method.map(m => m.amount)), 1)
    : 1

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-3 sm:px-6 py-6 sm:py-8 space-y-6 animate-enter">

        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Relatório de Vendas</h1>
          <p className="mt-0.5 text-sm text-slate-600">Resumo por período e forma de pagamento</p>
        </div>

        {/* Filtro de período */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">De</label>
              <input
                type="date"
                value={start}
                max={end}
                onChange={e => setStart(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Até</label>
              <input
                type="date"
                value={end}
                min={start}
                onChange={e => setEnd(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={isPending}
              className="bg-teal-600 text-white rounded-lg px-5 py-2 text-sm font-semibold shadow-sm hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Buscando...' : 'Gerar Relatório'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>

        {summary && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center">
                <div className="bg-emerald-50 rounded-full p-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">R$ {summary.total_revenue.toFixed(2)}</p>
                <p className="text-xs text-slate-400 mt-1">Receita Total</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center">
                <div className="bg-sky-50 rounded-full p-2 mb-2">
                  <ShoppingCart className="h-5 w-5 text-sky-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{summary.total_sales}</p>
                <p className="text-xs text-slate-400 mt-1">Vendas Concluídas</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center">
                <div className="bg-red-50 rounded-full p-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
                <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{summary.cancelled_count}</p>
                <p className="text-xs text-slate-400 mt-1">Canceladas</p>
              </div>
            </div>

            {/* Breakdown por forma de pagamento */}
            {summary.by_method.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-700">Por Forma de Pagamento</h2>
                </div>
                <div className="space-y-3">
                  {[...summary.by_method]
                    .sort((a, b) => b.amount - a.amount)
                    .map(m => {
                      const pct = Math.round((m.amount / maxAmount) * 100)
                      return (
                        <div key={m.method}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-slate-700">{PAYMENT_LABELS[m.method] ?? m.method}</span>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-slate-400">{m.count} venda{m.count !== 1 ? 's' : ''}</span>
                              <span className="font-semibold text-slate-900 min-w-[5rem] text-right font-mono tabular-nums">R$ {m.amount.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {summary.total_sales === 0 && summary.cancelled_count === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-12 text-center">
                <ShoppingCart className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Nenhuma venda no período selecionado</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
