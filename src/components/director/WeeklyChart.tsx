'use client'

import type { WeeklyDataPoint } from '@/lib/actions/dashboard'

interface Props {
  data: WeeklyDataPoint[]
}

export default function WeeklyChart({ data }: Props) {
  const max = Math.max(...data.map(d => d.count), 1)
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Atendimentos — 7 dias</h3>
          <p className="text-xs text-slate-500 mt-0.5">Consultas abertas por dia</p>
        </div>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
          Total: {data.reduce((s, d) => s + d.count, 0)}
        </span>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-2 h-40">
        {data.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 0
          const isToday   = d.date === today
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
              {/* Count label */}
              <span className={`text-xs font-semibold transition-opacity ${d.count > 0 ? 'opacity-100' : 'opacity-0'} ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                {d.count || ''}
              </span>

              {/* Bar */}
              <div className="w-full flex items-end h-28">
                <div
                  className={`w-full rounded-t-lg transition-all duration-300 ${
                    isToday
                      ? 'bg-blue-600 group-hover:bg-blue-500'
                      : d.count > 0
                        ? 'bg-slate-200 group-hover:bg-slate-300'
                        : 'bg-slate-100'
                  }`}
                  style={{
                    height: d.count === 0 ? '4px' : `${Math.max(heightPct, 8)}%`,
                  }}
                />
              </div>

              {/* Day label */}
              <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                {d.label}
              </span>
              {isToday && (
                <span className="text-[9px] font-semibold text-blue-500 -mt-1">HOJE</span>
              )}
            </div>
          )
        })}
      </div>

      {max === 1 && data.every(d => d.count === 0) && (
        <p className="text-center text-xs text-slate-400 mt-4">Nenhum atendimento registrado esta semana</p>
      )}
    </div>
  )
}
