'use client'

import { useState, useTransition, useEffect } from 'react'
import { getCrossCompanyOverview, type CompanyOverview } from '@/lib/actions/financial'
import { Building2, RefreshCcw, Calendar } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayStr = () => new Date().toISOString().slice(0, 10)
const firstDayOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

export default function CrossCompanyTab() {
  const [startDate, setStartDate] = useState(firstDayOfMonth())
  const [endDate, setEndDate]     = useState(todayStr())
  const [rows, setRows]           = useState<CompanyOverview[] | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function load() {
    setErrorMsg(null)
    startTransition(async () => {
      const res = await getCrossCompanyOverview({ start_date: startDate, end_date: endDate })
      if ('error' in res) setErrorMsg(res.error); else setRows(res.companies)
    })
  }
  useEffect(() => { load() }, [])

  const totals = (rows ?? []).reduce((t, r) => ({
    recebido: t.recebido + r.recebido, pago: t.pago + r.pago, saldo: t.saldo + r.saldo,
    disp: t.disp + r.credito_disponivel,
  }), { recebido: 0, pago: 0, saldo: 0, disp: 0 })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5"><Calendar className="inline h-3 w-3 mr-1" /> Início</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fim</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
        </div>
        <button onClick={load} disabled={isPending} className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} /> {isPending ? 'Carregando...' : 'Atualizar'}
        </button>
        <p className="text-[11px] text-slate-400 w-full">Recebido/Pago atribuídos pela conta bancária de cada empresa (CNPJ). Crédito por empresa inclui transferências inter-CNPJ.</p>
      </div>

      {errorMsg && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{errorMsg}</p>}

      {rows && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                  <th className="py-3 px-4 text-left">Empresa (CNPJ)</th>
                  <th className="py-3 px-4 text-right">Recebido</th>
                  <th className="py-3 px-4 text-right">Pago</th>
                  <th className="py-3 px-4 text-right">Saldo</th>
                  <th className="py-3 px-4 text-right">Créd. inserido</th>
                  <th className="py-3 px-4 text-right">Créd. utilizado</th>
                  <th className="py-3 px-4 text-right">Créd. disponível</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">Nenhuma empresa cadastrada.</td></tr>}
                {rows.map(r => (
                  <tr key={r.company_id ?? 'none'} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-medium text-slate-700 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> {r.company_name}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-700 font-semibold">{fmt(r.recebido)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-red-700">{fmt(r.pago)}</td>
                    <td className={`py-3 px-4 text-right tabular-nums font-bold ${r.saldo >= 0 ? 'text-slate-800' : 'text-orange-700'}`}>{fmt(r.saldo)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-600">{fmt(r.credito_inserido)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-600">{fmt(r.credito_utilizado)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-teal-700">{fmt(r.credito_disponivel)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                    <td className="py-3 px-4 text-slate-700">Total</td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-700">{fmt(totals.recebido)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-red-700">{fmt(totals.pago)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.saldo)}</td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4 text-right tabular-nums text-teal-700">{fmt(totals.disp)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
