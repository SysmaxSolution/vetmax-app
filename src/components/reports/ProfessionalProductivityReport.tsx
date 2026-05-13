'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  getProfessionalProductivityReport,
  listProfessionals,
  type ProfessionalProductivitySummary,
} from '@/lib/actions/reports-g13'

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 text-center">
      <p className="text-xs font-medium text-violet-600 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-violet-900">{value}</p>
    </div>
  )
}

export default function ProfessionalProductivityReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,      setFrom]      = useState(firstOfMonth)
  const [to,        setTo]        = useState(today)
  const [userId,    setUserId]    = useState('')
  const [profs,     setProfs]     = useState<{ id: string; name: string }[]>([])
  const [result,    setResult]    = useState<ProfessionalProductivitySummary | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [pending,   startT]       = useTransition()

  useEffect(() => {
    listProfessionals().then(setProfs)
  }, [])

  function run() {
    startT(async () => {
      setError(null)
      const res = await getProfessionalProductivityReport({ from, to, user_id: userId || undefined })
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Profissional</label>
          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">Todos</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          {result.user_name !== '—' && (
            <p className="text-sm font-semibold text-slate-700">Profissional: {result.user_name}</p>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card label="Consultas realizadas"  value={result.consult_total} />
            <Card label="Exames solicitados"     value={result.exam_total} />
            <Card label="Receitas emitidas"      value={result.prescription_total} />
          </div>

          {/* Day detail */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-violet-50">
                <tr>
                  {['Data', 'Consultas', 'Exames', 'Receitas'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-violet-800 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum dado encontrado.</td>
                  </tr>
                ) : result.rows.map(r => (
                  <tr key={r.day} className="hover:bg-violet-50/40 transition-colors">
                    <td className="px-4 py-2.5 text-slate-700">
                      {new Date(r.day + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-violet-700">{r.consult_count}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.exam_count}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.prescription_count}</td>
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
