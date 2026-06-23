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

// Desconto do PAGAMENTO ANUAL NO CARTÃO (D1 do plano): cobrança única
// 12×preço×0,90 = 10% off. É menor que o PIX anual (config.annual_discount_percent,
// 20%) porque o MDR do cartão consome a margem. Constante de negócio fixa.
export const CARD_ANNUAL_DISCOUNT_PERCENT = 10

export interface PricingCatalogItem {
  module_key: string
  monthly_price: number
  included_in_plan: 'premium' | 'enterprise' | null
}

export interface PlanPricingInput {
  plan: 'starter' | 'premium' | 'enterprise'
  starterBase: number
  premiumBase: number
  enterpriseBase: number
  annualDiscountPercent: number
  /** Desconto do anual no cartão (D1). Default CARD_ANNUAL_DISCOUNT_PERCENT (10%). */
  cardAnnualDiscountPercent?: number
  catalog: PricingCatalogItem[]
  addonKeys: string[]
  cycle: BillingCycle
}

export interface PriceTotals {
  /** Base + addons válidos, por mês, sem desconto. */
  monthlyTotal: number
  /** monthlyTotal × 12, sem desconto. */
  yearlyTotal: number
  /** yearlyTotal com o desconto anual aplicado (PIX anual, ~20%). */
  yearlyDiscounted: number
  /** yearlyTotal com o desconto anual do CARTÃO (D1, 10%) — cobrança única. */
  yearlyDiscountedCard: number
  /** Valor efetivo do ciclo escolhido (manchete PIX): monthlyTotal ou yearlyDiscounted. */
  effectiveTotal: number
}

/**
 * Valor a COBRAR no gateway conforme método + ciclo.
 *  - mensal: monthlyTotal (PIX e cartão pagam igual — sem desconto no mês).
 *  - anual PIX:    yearlyDiscounted (20%).
 *  - anual cartão: yearlyDiscountedCard (10%, cobrança única — D1).
 */
export function chargeValueFor(
  totals: PriceTotals,
  cycle: BillingCycle,
  method: 'pix' | 'card'
): number {
  if (cycle !== 'yearly') return totals.monthlyTotal
  return method === 'card' ? totals.yearlyDiscountedCard : totals.yearlyDiscounted
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function computePlanPrice(input: PlanPricingInput): PriceTotals {
  const base = input.plan === 'enterprise'
    ? Number(input.enterpriseBase)
    : input.plan === 'starter'
      ? Number(input.starterBase)
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
  const cardPct = input.cardAnnualDiscountPercent ?? CARD_ANNUAL_DISCOUNT_PERCENT
  const yearlyDiscountedCard = round2(yearlyTotal * (1 - Number(cardPct) / 100))
  const effectiveTotal = input.cycle === 'yearly' ? yearlyDiscounted : monthlyTotal

  return { monthlyTotal, yearlyTotal, yearlyDiscounted, yearlyDiscountedCard, effectiveTotal }
}
