'use client'

// Painel de pricing — EXCLUSIVO do usuário SysMax (guard duro também no
// servidor em updateSubscriptionPricing). Edita preço/disponibilidade de cada
// módulo do catálogo e os valores-base dos planos, sem deploy.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Settings2 } from 'lucide-react'
import { updateSubscriptionPricing } from '@/lib/actions/subscription'
import type { SubscriptionModuleCatalogRow, SubscriptionPlanConfig } from '@/types'

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  premium:    { label: 'Premium',    cls: 'bg-indigo-100 text-indigo-700' },
  enterprise: { label: 'Enterprise', cls: 'bg-amber-100 text-amber-700' },
  none:       { label: 'Avulso',     cls: 'bg-slate-100 text-slate-600' },
}

interface Props {
  catalog: SubscriptionModuleCatalogRow[]
  config: SubscriptionPlanConfig
  onToast: (type: 'success' | 'error', message: string) => void
}

export default function PricingAdminPanel({ catalog, config, onToast }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState(
    catalog.map(c => ({
      module_key: c.module_key,
      label: c.label,
      tier: c.included_in_plan ?? 'none',
      price: String(c.monthly_price.toFixed(2)).replace('.', ','),
      available: c.is_available,
    }))
  )
  const [premiumBase, setPremiumBase] = useState(String(config.premium_base_price.toFixed(2)).replace('.', ','))
  const [enterpriseBase, setEnterpriseBase] = useState(String(config.enterprise_base_price.toFixed(2)).replace('.', ','))
  const [discount, setDiscount] = useState(String(config.annual_discount_percent))
  const [saving, setSaving] = useState(false)

  function parseMoney(v: string): number {
    return parseFloat(v.replace(/\./g, '').replace(',', '.'))
  }

  function setRow(key: string, patch: Partial<{ price: string; available: boolean }>) {
    setRows(prev => prev.map(r => r.module_key === key ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    const modules = rows.map(r => ({
      module_key: r.module_key,
      monthly_price: parseMoney(r.price),
      is_available: r.available,
    }))
    const cfg = {
      premium_base_price: parseMoney(premiumBase),
      enterprise_base_price: parseMoney(enterpriseBase),
      annual_discount_percent: parseFloat(discount.replace(',', '.')),
    }
    if (modules.some(m => !Number.isFinite(m.monthly_price) || m.monthly_price < 0) ||
        !Number.isFinite(cfg.premium_base_price) || cfg.premium_base_price < 0 ||
        !Number.isFinite(cfg.enterprise_base_price) || cfg.enterprise_base_price < 0 ||
        !Number.isFinite(cfg.annual_discount_percent) || cfg.annual_discount_percent < 0 || cfg.annual_discount_percent > 100) {
      onToast('error', 'Há valores inválidos no pricing — revise antes de salvar.')
      return
    }

    setSaving(true)
    const result = await updateSubscriptionPricing({ modules, config: cfg })
    setSaving(false)
    if ('error' in result) {
      onToast('error', result.error)
      return
    }
    onToast('success', 'Pricing atualizado! Os cards já refletem os novos valores.')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-purple-600" />
        <h3 className="text-sm font-bold text-slate-900">Pricing (operação SysMax)</h3>
        <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
          Invisível para clientes
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Base Premium (R$/mês)
          <input
            value={premiumBase}
            onChange={e => setPremiumBase(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-purple-400"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Base Enterprise (R$/mês)
          <input
            value={enterpriseBase}
            onChange={e => setEnterpriseBase(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-purple-400"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Desconto anual PIX (%)
          <input
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-purple-400"
          />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3">Módulo</th>
              <th className="py-1.5 pr-3">Bundle</th>
              <th className="py-1.5 pr-3 w-32">Preço avulso (R$)</th>
              <th className="py-1.5 w-24">Disponível</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const badge = TIER_BADGE[r.tier] ?? TIER_BADGE.none
              return (
                <tr key={r.module_key} className="border-t border-purple-100">
                  <td className="py-2 pr-3 text-slate-700">{r.label}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={r.price}
                      onChange={e => setRow(r.module_key, { price: e.target.value })}
                      inputMode="decimal"
                      className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-purple-400"
                    />
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => setRow(r.module_key, { available: !r.available })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        r.available ? 'bg-purple-600' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={r.available}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        r.available ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`} style={{ transform: r.available ? 'translateX(18px)' : 'translateX(2px)' }} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar pricing
      </button>
    </div>
  )
}
