'use client'

import { useState, useTransition } from 'react'
import { getOperationalReport, type OperationalSummary } from '@/lib/actions/reports-g13'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

type TabKey = 'agendamentos' | 'internacao' | 'grooming'

export default function OperationalReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [tab,     setTab]     = useState<TabKey>('agendamentos')
  const [result,  setResult]  = useState<OperationalSummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getOperationalReport({ from, to })
      if ('error' in res) { setError(res.error); return }
      setResult(res)
    })
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'internacao',   label: 'Internação' },
    { key: 'grooming',     label: 'Banho e Tosa' },
  ]

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <button onClick={run} disabled={pending}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">
          {pending ? 'Carregando…' : 'Gerar'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Selecione o período e clique em Gerar.
        </div>
      )}

      {result !== null && (
        <>
          {/* Internal tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
                  tab === t.key
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:text-teal-700 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Agendamentos tab */}
          {tab === 'agendamentos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total de consultas"  value={result.appointments.total} />
                <StatCard label="Taxa de comparecimento" value={`${result.appointments.attendance_rate}%`} />
                <StatCard label="Cancelamentos"        value={result.appointments.cancellations} />
              </div>
              {result.appointments.by_day.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consultas por Dia</p>
                  </div>
                  <div className="flex gap-1 items-end px-4 py-4 overflow-x-auto" style={{ minHeight: 120 }}>
                    {(() => {
                      const maxVal = Math.max(...result.appointments.by_day.map(d => d.count), 1)
                      return result.appointments.by_day.map(d => (
                        <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px]">
                          <div
                            className="w-5 rounded-sm bg-teal-400"
                            style={{ height: `${Math.max(4, (d.count / maxVal) * 80)}px` }}
                            title={`${d.date}: ${d.count} consultas`}
                          />
                          <span className="text-[9px] text-slate-400 rotate-90 origin-center translate-y-3 mt-3">
                            {d.date.slice(5)}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Internação tab */}
          {tab === 'internacao' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Admissões"          value={result.hospitalization.admissions} />
              <StatCard label="Tempo médio (dias)" value={result.hospitalization.avg_days} />
              <StatCard label="Altas"              value={result.hospitalization.discharges} />
            </div>
          )}

          {/* Grooming tab */}
          {tab === 'grooming' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Serviços realizados" value={result.grooming.services} />
              <StatCard label="Receita"             value={fmt(result.grooming.revenue)} />
              <StatCard label="Tutores recorrentes" value={result.grooming.recurring_tutors} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
