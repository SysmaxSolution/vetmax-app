'use client'

// Aging de Recebíveis / Pagáveis (P0). Sintético: totais por faixa de atraso.
// Analítico: títulos, com dias de atraso e cliente/fornecedor. Filtro por faixa.

import { useState, useTransition } from 'react'
import { getAgingReport, type AgingReport as AgingData } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

const BUCKET_COLOR: Record<string, string> = {
  a_vencer: 'text-slate-600', d0_30: 'text-amber-600', d31_60: 'text-orange-600', d61_90: 'text-rose-600', d90p: 'text-red-700',
}

export default function AgingReport() {
  const today = new Date().toISOString().split('T')[0]
  const [type, setType] = useState<'receivable' | 'payable'>('receivable')
  const [asOf, setAsOf] = useState(today)
  const [data, setData] = useState<AgingData | null>(null)
  const [sel, setSel]   = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run(t = type) {
    startT(async () => {
      setError(null); setSel(null)
      const res = await getAgingReport({ type: t, as_of: asOf })
      if ('error' in res) { setError(res.error); return }
      setData(res)
    })
  }

  const rows = data ? (sel ? data.rows.filter(r => r.bucket === sel) : data.rows) : []
  const partyLabel = type === 'receivable' ? 'Cliente' : 'Fornecedor'

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
          {(['receivable', 'payable'] as const).map(t => (
            <button key={t} onClick={() => { setType(t); run(t) }}
              className={`px-4 py-2 font-semibold transition-colors ${type === t ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {t === 'receivable' ? 'A Receber' : 'A Pagar'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Posição em</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <button onClick={() => run()} disabled={pending}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60">
          {pending ? 'Carregando…' : 'Gerar'}
        </button>
        {data && <button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Imprimir / PDF</button>}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione e clique em Gerar.</div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Sintético — faixas (clicável p/ filtrar o analítico) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {data.buckets.map(b => (
              <button key={b.key} onClick={() => setSel(sel === b.key ? null : b.key)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${sel === b.key ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide">{b.label}</p>
                <p className={`text-base font-bold font-mono tabular-nums ${BUCKET_COLOR[b.key]}`}>{fmt(b.total)}</p>
                <p className="text-[10px] text-slate-400">{b.count} título{b.count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-400">{sel ? 'Filtrado por faixa — clique de novo para limpar' : 'Clique numa faixa para filtrar'}</p>
            <p className="text-sm font-bold text-slate-700">Total pendente: <span className="font-mono tabular-nums">{fmt(data.total)}</span></p>
          </div>

          {/* Analítico — títulos */}
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5">{partyLabel}</th>
                  <th className="text-left px-2 py-2.5">Documento</th>
                  <th className="text-left px-2 py-2.5">Descrição</th>
                  <th className="text-left px-2 py-2.5 whitespace-nowrap">Vencimento</th>
                  <th className="text-right px-2 py-2.5">Atraso</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum título pendente.</td></tr>}
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-slate-800 font-medium truncate max-w-[200px]">{r.party}</td>
                    <td className="px-2 py-2 text-xs font-mono text-slate-500">{r.document ?? '—'}</td>
                    <td className="px-2 py-2 text-slate-600 truncate max-w-[240px]">{r.description}</td>
                    <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{fmtD(r.due_date)}</td>
                    <td className={`px-2 py-2 text-right font-mono ${r.days_overdue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {r.days_overdue > 0 ? `${r.days_overdue}d` : 'a vencer'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{fmt(r.amount)}</td>
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
