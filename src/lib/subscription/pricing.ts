// Cálculo de preço dos planos pagos (Premium/Enterprise) — módulo PURO.
// Usado pelo client (total em tempo real na UI de planos) e pelo servidor
// (autoridade final em subscribeToPlan — nunca confiar no total do client).
//
// Regras da re-grade (Fase 1.5):
//  - premium:    base + addons (apenas linhas do catálogo included_in_plan='enterprise')
//  - enterprise: base fixa — bundle inclui tudo, addonKeys são ignorados
//  - linhas premium-bundle, keys desconhecidas e linhas NULL nunca somam
//    (defesa contra payload adulterado)

import type { BillingCycle } from '@/types'

export interface PricingCatalogItem {
  module_key: string
  monthly_price: number
  included_in_plan: 'premium' | 'enterprise' | null
}

export interface PlanPricingInput {
  plan: 'premium' | 'enterprise'
  premiumBase: number
  enterpriseBase: number
  annualDiscountPercent: number
  catalog: PricingCatalogItem[]
  addonKeys: string[]
  cycle: BillingCycle
}

export interface PriceTotals {
  /** Base + addons válidos, por mês, sem desconto. */
  monthlyTotal: number
  /** monthlyTotal × 12, sem desconto. */
  yearlyTotal: number
  /** yearlyTotal com o desconto anual aplicado (PIX anual). */
  yearlyDiscounted: number
  /** Valor efetivo do ciclo escolhido: monthlyTotal ou yearlyDiscounted. */
  effectiveTotal: number
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function computePlanPrice(input: PlanPricingInput): PriceTotals {
  const base = input.plan === 'enterprise'
    ? Number(input.enterpriseBase)
    : Number(input.premiumBase)

  let addonsSum = 0
  if (input.plan === 'premium') {
    const byKey = new Map(
      input.catalog
        .filter(m => m.included_in_plan === 'enterprise')
        .map(m => [m.module_key, Number(m.monthly_price)])
    )
    addonsSum = input.addonKeys.reduce((sum, key) => sum + (byKey.get(key) ?? 0), 0)
  }

  const monthlyTotal = round2(base + addonsSum)
  const yearlyTotal = round2(monthlyTotal * 12)
  const yearlyDiscounted = round2(yearlyTotal * (1 - Number(input.annualDiscountPercent) / 100))
  const effectiveTotal = input.cycle === 'yearly' ? yearlyDiscounted : monthlyTotal

  return { monthlyTotal, yearlyTotal, yearlyDiscounted, effectiveTotal }
}
