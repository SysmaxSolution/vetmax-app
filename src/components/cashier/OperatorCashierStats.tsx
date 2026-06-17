'use client'

import { useEffect, useState } from 'react'
import { Users, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getOperatorCashierStats, type OperatorCashierStat } from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const RANGES = [
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: '12 meses', days: 365 },
] as const

export default function OperatorCashierStats() {
  const [days,  setDays]  = useState<number>(90)
  const [rows,  setRows]  = useState<OperatorCashierStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null); setRows(null)
    getOperatorCashierStats(days).then(res => {
      if (!active) return
      if ('error' in res) setError(res.error)
      else setRows(res)
    })
    return () => { active = false }
  }, [days])

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 flex-wrap">
        <Users className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Quebra de Caixa por Operador</h3>
        <span className="text-xs text-slate-400">· fechamentos com conferência</span>
        <div className="ml-auto flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                days === r.days ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-5 py-6 text-sm text-red-600 text-center">{error}</p>
      ) : !rows ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">
          Nenhum fechamento com conferência cega no período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Operador</th>
                <th className="px-4 py-2.5 text-center">Fech.</th>
                <th className="px-4 py-2.5 text-center">Bateu</th>
                <th className="px-4 py-2.5 text-center">Sobras</th>
                <th className="px-4 py-2.5 text-center">Faltas</th>
                <th className="px-4 py-2.5 text-right">Acumulado</th>
                <th className="px-4 py-2.5 text-right">Média |dif|</th>
                <th className="px-4 py-2.5 text-right">Pior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => {
                const clean = r.avg_abs_difference < 0.01
                return (
                  <tr key={r.operator_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.operator_name}</td>
                    <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">{r.closings}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 text-emerald-700 tabular-nums">
                        <CheckCircle2 className="h-3.5 w-3.5" />{r.exact}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-blue-600 tabular-nums">{r.over || '—'}</td>
                    <td className="px-4 py-2.5 text-center text-red-600 tabular-nums">{r.short || '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      Math.abs(r.total_difference) < 0.01 ? 'text-slate-500'
                        : r.total_difference > 0 ? 'text-blue-600' : 'text-red-600'
                    }`}>
                      {r.total_difference > 0 ? '+' : ''}{fmt(r.total_difference)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${clean ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {clean
                        ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{fmt(0)}</span>
                        : fmt(r.avg_abs_difference)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Math.abs(r.worst_difference) < 0.01 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 font-medium ${r.worst_difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          <AlertTriangle className="h-3.5 w-3.5" />{fmt(Math.abs(r.worst_difference))}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-slate-50">
            Sessões afetadas pelo antigo erro de cálculo do sistema são excluídas — a divergência delas não reflete a contagem do operador.
          </p>
        </div>
      )}
    </div>
  )
}
