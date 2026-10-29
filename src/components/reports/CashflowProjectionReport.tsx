'use client'

// Fluxo de Caixa (realizado × projetado), por mês, com saldo acumulado.

import { useState, useTransition } from 'react'
import { getCashflowProjection, type CashflowReport } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtMonth = (p: string) => { const [y, m] = p.split('-'); return `${m}/${y}` }

export default function CashflowProjectionReport() {
  const today = new Date().toISOString().split('T')[0]
  const start = today.slice(0, 4) + '-01-01'
  const end   = today.slice(0, 4) + '-12-31'
  const [from, setFrom] = useState(start)
  const [to, setTo]     = useState(end)
  const [data, setData] = useState<CashflowReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getCashflowProjection({ from, to })
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
        <button onClick={run} disabled={pending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{pending ? 'Carregando…' : 'Gerar'}</button>
        {data && <button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Imprimir / PDF</button>}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione o período e clique em Gerar.</div>}

      {data && (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Mês</th>
                <th className="text-right px-2 py-2.5">Recebido</th>
                <th className="text-right px-2 py-2.5">Pago</th>
                <th className="text-right px-2 py-2.5">A receber</th>
                <th className="text-right px-2 py-2.5">A pagar</th>
                <th className="text-right px-2 py-2.5">Saldo do mês</th>
                <th className="text-right px-4 py-2.5">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.periods.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sem movimentos no período.</td></tr>}
              {data.periods.map(p => (
                <tr key={p.period} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-medium text-slate-800">{fmtMonth(p.period)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmt(p.realizado_in)}</td>
                  <td className="px-2 py-2 text-right font-mono text-rose-600">{fmt(p.realizado_out)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-600/70">{fmt(p.previsto_in)}</td>
                  <td className="px-2 py-2 text-right font-mono text-rose-500/70">{fmt(p.previsto_out)}</td>
                  <td className={`px-2 py-2 text-right font-mono font-semibold ${p.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(p.net)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${p.accumulated >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{fmt(p.accumulated)}</td>
                </tr>
              ))}
            </tbody>
            {data.periods.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200 text-sm font-bold">
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">Total</td>
                  <td className="px-2 py-2.5 text-right font-mono text-emerald-700">{fmt(data.totals.realizado_in)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-rose-600">{fmt(data.totals.realizado_out)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-emerald-600/70">{fmt(data.totals.previsto_in)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-rose-500/70">{fmt(data.totals.previsto_out)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          <p className="px-4 py-2 text-[11px] text-slate-400">Realizado = títulos baixados (pela data de pagamento). A receber/A pagar = títulos em aberto (pela data de vencimento). Movimentos internos inter-CNPJ e utilização de crédito não entram no caixa.</p>
        </div>
      )}
    </div>
  )
}
