'use client'

import { useState } from 'react'
import { Search, X, Filter } from 'lucide-react'
import { DateInput } from '@/components/ui/DatePicker'
import type { Supplier } from '@/lib/actions/suppliers'
import SupplierAutocomplete from '@/components/registry/suppliers/SupplierAutocomplete'

export interface FiltersState {
  from:           string
  to:             string
  source_module:  string
  payment_method: string
  status:         string
  supplier:       Supplier | null
  q:              string
}

const MODULE_OPTIONS = [
  { value: '',              label: 'Todos os módulos' },
  { value: 'grooming',      label: 'Banho e Tosa'     },
  { value: 'pharmacy',      label: 'Farmácia'         },
  { value: 'consultation',  label: 'Consulta'         },
  { value: 'exam',          label: 'Exame'            },
  { value: 'manual',        label: 'Manual'           },
  { value: 'adjustment',    label: 'Ajuste'           },
  { value: 'outflow',       label: 'Saídas'           },
]

const PAYMENT_OPTIONS = [
  { value: '',         label: 'Todas as formas' },
  { value: 'pix',      label: 'PIX'             },
  { value: 'credit',   label: 'Crédito'         },
  { value: 'debit',    label: 'Débito'          },
  { value: 'cash',     label: 'Dinheiro'        },
  { value: 'convenio', label: 'Convênio'        },
  { value: 'courtesy', label: 'Cortesia'        },
  { value: 'other',    label: 'Outro'           },
]

const STATUS_OPTIONS = [
  { value: '',         label: 'Todos os status' },
  { value: 'recorded', label: 'Registrado'      },
  { value: 'verified', label: 'Verificado'      },
  { value: 'archived', label: 'Arquivado'       },
  { value: 'reversed', label: 'Estornado'       },
]

interface Props {
  filters:    FiltersState
  onChange:   (next: FiltersState) => void
  onSubmit:   () => void
  loading?:   boolean
}

export default function ReportFilters({ filters, onChange, onSubmit, loading }: Props) {
  const [expanded, setExpanded] = useState(false)

  function update<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    onChange({ ...filters, [key]: value })
  }

  function reset() {
    const today = new Date().toISOString().slice(0, 10)
    const firstOfMonth = today.slice(0, 7) + '-01'
    onChange({
      from: firstOfMonth, to: today,
      source_module: '', payment_method: '', status: '',
      supplier: null, q: '',
    })
  }

  const activeFilterCount =
    (filters.source_module ? 1 : 0) +
    (filters.payment_method ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.supplier ? 1 : 0) +
    (filters.q.trim() ? 1 : 0)

  return (
    <div data-mentor-step="cashier-reports-filters" className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      {/* Período + Busca + Submit */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">De</label>
          <DateInput value={filters.from} onChange={v => update('from', v)} className="w-full" />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">Até</label>
          <DateInput value={filters.to} onChange={v => update('to', v)} className="w-full" />
        </div>
        <div className="sm:col-span-4">
          <label className="block text-xs font-medium text-slate-700 mb-1">Busca textual</label>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={filters.q}
              onChange={e => update('q', e.target.value)}
              placeholder="Pet, tutor ou descrição do produto/serviço..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
        <div className="sm:col-span-2 flex items-end">
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* Toggle filtros avançados */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros avançados
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-teal-100 text-teal-700 text-xs font-bold px-1.5 py-0.5 leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filtros avançados */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Módulo</label>
            <select
              value={filters.source_module}
              onChange={e => update('source_module', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Forma de pagamento</label>
            <select
              value={filters.payment_method}
              onChange={e => update('payment_method', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={e => update('status', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fornecedor</label>
            <SupplierAutocomplete
              value={filters.supplier}
              onChange={s => update('supplier', s)}
              placeholder="Filtrar por fornecedor..."
            />
          </div>
        </div>
      )}
    </div>
  )
}
