'use client'

// Seletor a la carte dos módulos do plano Premium — checkboxes com preço,
// total recalculado em tempo real pelo parent (computePremiumPrice).

import { Check } from 'lucide-react'
import type { BusinessType, SubscriptionModuleCatalogRow } from '@/types'
import { FREE_MODULES } from '@/config/access-matrix'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  catalog:      SubscriptionModuleCatalogRow[]
  selectedKeys: string[]
  businessType: BusinessType
  disabled?:    boolean
  onToggle:     (moduleKey: string) => void
}

export default function ModulePicker({ catalog, selectedKeys, businessType, disabled = false, onToggle }: Props) {
  const freeKeys = new Set(FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)

  return (
    <div className="space-y-1.5">
      {catalog.map(mod => {
        // Módulo cujo conteúdo técnico já está 100% no Free do segmento
        // (ex.: grooming para pet_aesthetics) — marcado "Incluso", sem custo.
        const included = mod.included_module_keys.length > 0 &&
          mod.included_module_keys.every(k => freeKeys.has(k))
        const checked = included || selectedKeys.includes(mod.module_key)

        return (
          <label
            key={mod.module_key}
            className={`flex items-start gap-3 rounded-lg border p-2.5 transition-colors ${
              included
                ? 'border-slate-100 bg-slate-50 cursor-default'
                : disabled
                  ? 'border-slate-100 bg-white cursor-default opacity-60'
                  : checked
                    ? 'border-indigo-300 bg-indigo-50/60 cursor-pointer'
                    : 'border-slate-200 bg-white cursor-pointer hover:border-indigo-200'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
              }`}
            >
              {checked && <Check className="h-3 w-3 text-white" />}
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              disabled={included || disabled}
              onChange={() => onToggle(mod.module_key)}
            />
            <span className="flex-1 min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{mod.label}</span>
                {included ? (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Incluso
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                    + {fmt(mod.monthly_price)}/mês
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">{mod.description}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
