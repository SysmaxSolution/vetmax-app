'use client'

// Clientes: novos × recorrentes, ticket médio e faturamento por cliente.

import { useState, useTransition } from 'react'
import { getClientsReport, type ClientsReport as Data } from '@/lib/actions/reports-g13'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ClientsReport() {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo]     = useState(today)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getClientsReport({ from, to })
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Clientes" value={String(data.summary.total_clients)} />
            <Stat label="Novos" value={String(data.summary.new_clients)} color="text-emerald-700" />
            <Stat label="Recorrentes" value={String(data.summary.recurring_clients)} color="text-blue-700" />
            <Stat label="Atendimentos" value={String(data.summary.total_appointments)} />
            <Stat label="Ticket médio" value={fmt(data.summary.ticket_medio)} color="text-violet-700" />
          </div>

          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left px-4 py-2.5">Cliente</th><th className="text-left px-2 py-2.5">Tipo</th><th className="text-right px-2 py-2.5">Atend.</th><th className="text-right px-4 py-2.5">Faturamento</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum atendimento no período.</td></tr>}
                {data.rows.map(r => (
                  <tr key={r.tutor_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800 truncate max-w-[240px]">{r.name}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.is_new ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.is_new ? 'Novo' : 'Recorrente'}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.appointments}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{fmt(r.faturamento)}</td>
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

function Stat({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold font-mono tabular-nums ${color}`}>{value}</p>
    </div>
  )
}
