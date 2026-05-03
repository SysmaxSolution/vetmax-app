'use client'

import { useState } from 'react'
import { Filter, X } from 'lucide-react'

export interface FilterBarKPI {
  label: string
  value: string | number
  color?: string
}

export interface FilterBarConfig {
  kpis?: FilterBarKPI[]
  filters?: {
    key: string
    label: string
    type: 'date' | 'select' | 'text'
    options?: { value: string; label: string }[]
  }[]
  onFilterChange?: (filters: Record<string, string>) => void
  sortOptions?: { value: string; label: string }[]
  onSortChange?: (sort: string) => void
}

export function FilterBar({
  kpis = [],
  filters = [],
  onFilterChange,
  sortOptions,
  onSortChange,
}: FilterBarConfig) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState(false)

  const hasActiveFilters = Object.values(values).some(v => v !== '')

  function updateFilter(key: string, value: string) {
    const next = { ...values, [key]: value }
    setValues(next)
    onFilterChange?.(next)
  }

  function clearFilters() {
    const cleared: Record<string, string> = {}
    filters.forEach(f => { cleared[f.key] = '' })
    setValues(cleared)
    onFilterChange?.(cleared)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 space-y-3">
      {/* KPIs row */}
      {kpis.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {kpis.map(kpi => (
            <div key={kpi.label} className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
              <span className={`text-sm font-bold ${kpi.color ?? 'text-slate-900'}`}>{kpi.value}</span>
            </div>
          ))}
          <div className="flex-1" />
          {sortOptions && (
            <select
              onChange={e => onSortChange?.(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {sortOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {filters.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                hasActiveFilters ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Filter className="h-3 w-3" />
              Filtros
              {hasActiveFilters && (
                <button onClick={e => { e.stopPropagation(); clearFilters() }} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              )}
            </button>
          )}
        </div>
      )}

      {/* Filters row */}
      {expanded && filters.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-100">
          {filters.map(f => (
            <div key={f.key} className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">{f.label}</label>
              {f.type === 'select' && f.options ? (
                <select
                  value={values[f.key] ?? ''}
                  onChange={e => updateFilter(f.key, e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Todos</option>
                  {f.options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  value={values[f.key] ?? ''}
                  onChange={e => updateFilter(f.key, e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] ?? ''}
                  onChange={e => updateFilter(f.key, e.target.value)}
                  placeholder={f.label}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
