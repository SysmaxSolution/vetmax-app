'use client'

// DRE por CNPJ (comparativo por empresa faturante). Atribuição pela conta
// bancária de liquidação. CMV consolidado fica no DRE principal.

import { useState, useTransition } from 'react'
import { getDREByCompany, type DREByCompanyReport as Data } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function DREByCompanyReport() {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo]     = useState(today)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getDREByCompany({ from, to })
      if ('error' in res) { setError(res.error); return }
      setData(res)
    })
  }

  const totals = data?.rows.reduce((a, r) => ({
    receita: a.receita + r.receita, deducoes: a.deducoes + r.deducoes, despesas: a.despesas + r.despesas, resultado: a.resultado + r.resultado,
  }), { receita: 0, deducoes: 0, despesas: 0, resultado: 0 })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <button onClick={run} disabled={pending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{pending ? 'Carregando…' : 'Gerar'}</button>
        {data && <button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Imprimir / PDF</button>}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione o período e clique em Gerar.</div>}

      {data && (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr><th className="text-left px-4 py-2.5">Empresa (CNPJ)</th><th className="text-right px-2 py-2.5">Receita</th><th className="text-right px-2 py-2.5">Deduções</th><th className="text-right px-2 py-2.5">Despesas</th><th className="text-right px-4 py-2.5">Resultado</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sem lançamentos no período.</td></tr>}
              {data.rows.map(r => (
                <tr key={r.company_id ?? 'none'} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.company_name}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmt(r.receita)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-500">{fmt(r.deducoes)}</td>
                  <td className="px-2 py-2 text-right font-mono text-rose-600">{fmt(r.despesas)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${r.resultado >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{fmt(r.resultado)}</td>
                </tr>
              ))}
            </tbody>
            {totals && data.rows.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">Grupo (consolidado)</td>
                  <td className="px-2 py-2.5 text-right font-mono text-emerald-700">{fmt(totals.receita)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-slate-500">{fmt(totals.deducoes)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-rose-600">{fmt(totals.despesas)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${totals.resultado >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{fmt(totals.resultado)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="px-4 py-2 text-[11px] text-slate-400">Atribuição por conta bancária de liquidação. Transferências inter-CNPJ eliminadas. O CMV consolidado é apurado no DRE principal.</p>
        </div>
      )}
    </div>
  )
}
