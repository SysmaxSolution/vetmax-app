'use client'

// Faturamento (receita reconhecida) por dimensão: categoria, forma de pagamento,
// empresa (CNPJ) ou mês. Sintético com participação (%).

import { useState, useTransition } from 'react'
import { getRevenueBreakdown, type RevenueBreakdownReport as Data, type RevenueDimension } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DIMS: { key: RevenueDimension; label: string }[] = [
  { key: 'category',       label: 'Categoria' },
  { key: 'payment_method', label: 'Forma de pagamento' },
  { key: 'company',        label: 'Empresa (CNPJ)' },
  { key: 'month',          label: 'Mês' },
]

export default function RevenueBreakdownReport() {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo]     = useState(today)
  const [dimension, setDimension] = useState<RevenueDimension>('category')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run(dim = dimension) {
    startT(async () => {
      setError(null)
      const res = await getRevenueBreakdown({ from, to, dimension: dim })
      if ('error' in res) { setError(res.error); return }
      setData(res)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Agrupar por</label>
          <select value={dimension} onChange={e => { setDimension(e.target.value as RevenueDimension); if (data) run(e.target.value as RevenueDimension) }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {DIMS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></div>
        <button onClick={() => run()} disabled={pending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{pending ? 'Carregando…' : 'Gerar'}</button>
        {data && <button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Imprimir / PDF</button>}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione o período e clique em Gerar.</div>}

      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-400">Faturamento reconhecido (recebido no período)</p>
            <p className="text-sm font-bold text-slate-700">Total: <span className="font-mono">{fmt(data.total)}</span></p>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left px-4 py-2.5">{DIMS.find(d => d.key === data.dimension)?.label}</th><th className="text-right px-2 py-2.5">Qtd</th><th className="text-right px-2 py-2.5">Total</th><th className="text-left px-4 py-2.5 w-40">Participação</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Sem faturamento no período.</td></tr>}
                {data.rows.map(r => (
                  <tr key={r.key} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.label}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.count}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{fmt(r.total)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
                        <span className="text-[11px] text-slate-500 w-10 text-right">{r.pct.toFixed(1)}%</span>
                      </div>
                    </td>
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
