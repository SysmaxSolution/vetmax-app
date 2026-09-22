'use client'

// Posição de Estoque: ruptura (abaixo do mínimo), validade próxima e valor
// imobilizado. Sintético (cards) + analítico (itens), filtrável por situação.

import { useState, useTransition } from 'react'
import { getStockReport, type StockReport } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtQty = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

type Filter = 'all' | 'ruptura' | 'baixo' | 'expiring'

const STATUS_BADGE: Record<string, string> = {
  ruptura: 'bg-red-100 text-red-700', baixo: 'bg-amber-100 text-amber-700', ok: 'bg-emerald-100 text-emerald-700',
}
const STATUS_LABEL: Record<string, string> = { ruptura: 'Ruptura', baixo: 'Baixo', ok: 'OK' }

export default function StockPositionReport() {
  const today = new Date().toISOString().split('T')[0]
  const [asOf, setAsOf] = useState(today)
  const [expiryDays, setExpiryDays] = useState('60')
  const [data, setData] = useState<StockReport | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getStockReport({ as_of: asOf, expiry_days: parseInt(expiryDays || '60', 10) })
      if ('error' in res) { setError(res.error); return }
      setData(res)
    })
  }

  const rows = data ? data.rows.filter(r =>
    filter === 'all' ? true : filter === 'expiring' ? r.expiring : r.status === filter,
  ) : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Posição em</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Alertar validade em (dias)</label>
          <input type="number" value={expiryDays} onChange={e => setExpiryDays(e.target.value)} className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <button onClick={run} disabled={pending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{pending ? 'Carregando…' : 'Gerar'}</button>
        {data && <button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Imprimir / PDF</button>}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione e clique em Gerar.</div>}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: 'ruptura' as Filter, label: 'Em ruptura', value: data.summary.count_ruptura, color: 'text-red-700' },
              { k: 'baixo' as Filter,   label: 'Estoque baixo', value: data.summary.count_baixo, color: 'text-amber-600' },
              { k: 'expiring' as Filter, label: `Vencendo (${data.expiry_days}d)`, value: data.summary.count_expiring, color: 'text-orange-600' },
              { k: 'all' as Filter,     label: 'Valor imobilizado', value: fmt(data.summary.total_value), color: 'text-slate-800' },
            ].map(c => (
              <button key={c.k} onClick={() => setFilter(filter === c.k ? 'all' : c.k)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${filter === c.k ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide">{c.label}</p>
                <p className={`text-base font-bold font-mono tabular-nums ${c.color}`}>{c.value}</p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left px-4 py-2.5">Item</th><th className="text-left px-2 py-2.5">Situação</th><th className="text-right px-2 py-2.5">Qtd</th><th className="text-right px-2 py-2.5">Mínimo</th><th className="text-left px-2 py-2.5">Validade</th><th className="text-right px-4 py-2.5">Valor</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum item nesta seleção.</td></tr>}
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800 truncate max-w-[260px]">{r.name}</td>
                    <td className="px-2 py-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="px-2 py-2 text-right font-mono">{fmtQty(r.quantity)}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-400">{fmtQty(r.min_quantity)}</td>
                    <td className={`px-2 py-2 text-xs ${r.expiring ? 'text-orange-600 font-medium' : 'text-slate-400'}`}>
                      {r.days_to_expiry === null ? '—' : r.days_to_expiry < 0 ? `vencido há ${-r.days_to_expiry}d` : `${r.days_to_expiry}d`}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
