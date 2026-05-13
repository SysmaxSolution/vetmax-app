'use client'

import { useState, useTransition } from 'react'
import { getCurvaABCReport, type CurvaABCRow } from '@/lib/actions/reports-g13'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CLASS_STYLE: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  C: 'bg-orange-100 text-orange-800 border-orange-200',
}

export default function CurvaABCReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [type,    setType]    = useState<'services' | 'products' | 'all'>('all')
  const [rows,    setRows]    = useState<CurvaABCRow[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getCurvaABCReport({ from, to, type })
      if ('error' in res) { setError(res.error); return }
      setRows(res)
    })
  }

  const totalRevenue = rows?.reduce((s, r) => s + r.revenue, 0) ?? 0
  const countA = rows?.filter(r => r.class === 'A').length ?? 0
  const countB = rows?.filter(r => r.class === 'B').length ?? 0
  const countC = rows?.filter(r => r.class === 'C').length ?? 0

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
          <select value={type} onChange={e => setType(e.target.value as 'services' | 'products' | 'all')}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="all">Todos</option>
            <option value="services">Serviços</option>
            <option value="products">Produtos</option>
          </select>
        </div>
        <button onClick={run} disabled={pending}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {pending ? 'Carregando…' : 'Gerar'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {rows === null && !pending && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-8 text-center text-sm text-violet-500">
          Selecione o período e clique em Gerar para calcular a Curva ABC.
        </div>
      )}

      {rows !== null && (
        <>
          {/* Summary legend */}
          <div className="flex flex-wrap gap-4">
            {[
              { cls: 'A', count: countA, label: 'Classe A — top 80% da receita', color: 'text-emerald-700' },
              { cls: 'B', count: countB, label: 'Classe B — próximos 15%',        color: 'text-yellow-700' },
              { cls: 'C', count: countC, label: 'Classe C — últimos 5%',           color: 'text-orange-700' },
            ].map(({ cls, count, label, color }) => (
              <div key={cls} className="flex items-center gap-2 text-sm">
                <span className={`inline-block px-2 py-0.5 rounded-full font-bold border text-xs ${CLASS_STYLE[cls as 'A' | 'B' | 'C']}`}>{cls}</span>
                <span className={`font-semibold ${color}`}>{count}</span>
                <span className="text-slate-500">{label}</span>
              </div>
            ))}
            <div className="ml-auto text-sm font-semibold text-slate-700">
              Total: {fmt(totalRevenue)}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-violet-50">
                <tr>
                  {['#', 'Descrição', 'Categoria', 'Receita', '% Parcial', '% Acumulada', 'Classe'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-violet-800 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum dado encontrado.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.rank} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{r.rank}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[200px] truncate">{r.description}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.category ?? '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-700">{fmt(r.revenue)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                          <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, r.pct)}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 font-mono w-10 text-right">{r.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{r.pct_accum.toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${CLASS_STYLE[r.class]}`}>
                        {r.class}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
