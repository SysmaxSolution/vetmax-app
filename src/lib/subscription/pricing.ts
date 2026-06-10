// Cálculo de preço do plano Premium — módulo PURO (sem 'use server').
// Usado pelo client (total em tempo real na UI de planos) e pelo servidor
// (autoridade final em subscribeToPremium — nunca confiar no total do client).

import type { BillingCycle } from '@/types'

export interface PricingCatalogItem {
  module_key: string
  monthly_price: number
}

export interface PricingInput {
  basePrice: number
  annualDiscountPercent: number
  catalog: PricingCatalogItem[]
  selectedKeys: string[]
  cycle: BillingCycle
}

export interface PriceTotals {
  /** Base + módulos selecionados, por mês, sem desconto. */
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

export function computePremiumPrice(input: PricingInput): PriceTotals {
  const byKey = new Map(input.catalog.map(m => [m.module_key, Number(m.monthly_price)]))
  const modulesSum = input.selectedKeys.reduce((sum, key) => sum + (byKey.get(key) ?? 0), 0)

  const monthlyTotal = round2(Number(input.basePrice) + modulesSum)
  const yearlyTotal = round2(monthlyTotal * 12)
  const yearlyDiscounted = round2(yearlyTotal * (1 - Number(input.annualDiscountPercent) / 100))
  const effectiveTotal = input.cycle === 'yearly' ? yearlyDiscounted : monthlyTotal

  return { monthlyTotal, yearlyTotal, yearlyDiscounted, effectiveTotal }
}
