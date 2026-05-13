'use client'

import { useState, useTransition } from 'react'
import { getFinancialReport, type FinancialReportSummary } from '@/lib/actions/reports-g13'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-70">{label}</p>
      <p className="text-xl font-bold">{fmt(value)}</p>
    </div>
  )
}

function BarChart({ data }: { data: FinancialReportSummary['by_day'] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.map(d => Math.max(d.inflow, d.outflow)), 1)

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Fluxo Diário</p>
      <div className="flex gap-1 items-end overflow-x-auto pb-2" style={{ minHeight: 100 }}>
        {data.map(d => (
          <div key={d.date} className="flex flex-col items-center gap-0.5 min-w-[32px]">
            {/* Inflow bar */}
            <div
              className="w-3 rounded-sm bg-emerald-400"
              style={{ height: `${Math.max(2, (d.inflow / maxVal) * 90)}px` }}
              title={`Entrada: ${fmt(d.inflow)}`}
            />
            {/* Outflow bar */}
            <div
              className="w-3 rounded-sm bg-red-400"
              style={{ height: `${Math.max(2, (d.outflow / maxVal) * 90)}px` }}
              title={`Saída: ${fmt(d.outflow)}`}
            />
            <span className="text-[9px] text-slate-400 rotate-90 origin-center translate-y-4 mt-5">
              {d.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-6">
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" /> Entradas
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-400" /> Saídas
        </span>
      </div>
    </div>
  )
}

export default function FinancialReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [cat,     setCat]     = useState('')
  const [method,  setMethod]  = useState('')
  const [result,  setResult]  = useState<FinancialReportSummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getFinancialReport({ from, to, category: cat || undefined, payment_method: method || undefined })
      if ('error' in res) { setError(res.error); return }
      setResult(res)
    })
  }

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
          <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
          <input type="text" placeholder="Todas" value={cat} onChange={e => setCat(e.target.value)}
            className="w-full sm:w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Forma de Pagamento</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">Todas</option>
            <option value="cash">Dinheiro</option>
            <option value="card">Cartão</option>
            <option value="pix">Pix</option>
            <option value="insurance">Convênio</option>
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

      {result === null && !pending && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-8 text-center text-sm text-violet-500">
          Selecione o período e clique em Gerar.
        </div>
      )}

      {result !== null && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard label="A Receber"      value={result.total_receivable} color="bg-blue-50 border-blue-200 text-blue-900" />
            <SummaryCard label="A Pagar"        value={result.total_payable}    color="bg-amber-50 border-amber-200 text-amber-900" />
            <SummaryCard label="Recebido"        value={result.total_received}   color="bg-emerald-50 border-emerald-200 text-emerald-900" />
            <SummaryCard label="Pago"            value={result.total_paid}       color="bg-red-50 border-red-200 text-red-900" />
            <SummaryCard label="Resultado"       value={result.result}
              color={result.result >= 0
                ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                : 'bg-red-100 border-red-300 text-red-900'} />
          </div>

          {/* Bar Chart */}
          {result.by_day.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <BarChart data={result.by_day} />
            </div>
          )}

          {/* Entries table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-violet-50">
                <tr>
                  {['Tipo', 'Valor', 'Descrição', 'Categoria', 'Pagamento', 'Status', 'Vencimento'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-violet-800 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum lançamento encontrado.</td></tr>
                ) : result.rows.slice(0, 200).map(r => (
                  <tr key={r.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        r.type === 'inflow' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {r.type === 'inflow' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{fmt(r.amount)}</td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate">{r.description ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.category ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 capitalize">{r.payment_method ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.status === 'paid' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > 200 && (
            <p className="text-xs text-slate-400 text-right">Exibindo 200 de {result.rows.length} registros.</p>
          )}
        </>
      )}
    </div>
  )
}
