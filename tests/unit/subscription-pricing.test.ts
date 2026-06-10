// Testes da precificação dos planos pagos (SaaS Fase 1.5 — 4 tiers).
// computePlanPrice é a autoridade de preço no servidor — o client usa a
// mesma função apenas para display.
import { computePlanPrice } from '@/lib/subscription/pricing'

const CATALOG = [
  { module_key: 'sales_pdv',        monthly_price: 0,     included_in_plan: 'premium' as const },
  { module_key: 'stock_kits',       monthly_price: 0,     included_in_plan: 'premium' as const },
  { module_key: 'whatsapp_ai',      monthly_price: 79.9,  included_in_plan: 'enterprise' as const },
  { module_key: 'surgery_advanced', monthly_price: 79.9,  included_in_plan: 'enterprise' as const },
  { module_key: 'exams',            monthly_price: 35.5,  included_in_plan: 'enterprise' as const },
  { module_key: 'legacy_only',      monthly_price: 49,    included_in_plan: null },
]

const BASE = {
  premiumBase: 99,
  enterpriseBase: 299,
  annualDiscountPercent: 20,
  catalog: CATALOG,
}

describe('computePlanPrice', () => {
  it('premium sem addons = só a base', () => {
    const t = computePlanPrice({ ...BASE, plan: 'premium', addonKeys: [], cycle: 'monthly' })
    expect(t.monthlyTotal).toBe(99)
    expect(t.effectiveTotal).toBe(99)
  })

  it('premium + 2 addons enterprise soma 79,90 cada', () => {
    const t = computePlanPrice({
      ...BASE, plan: 'premium',
      addonKeys: ['whatsapp_ai', 'surgery_advanced'], cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(258.8)
  })

  it('premium ignora addons inválidos: key desconhecida, linha premium-bundle e linha NULL', () => {
    const t = computePlanPrice({
      ...BASE, plan: 'premium',
      addonKeys: ['nao_existe', 'sales_pdv', 'legacy_only', 'exams'], cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(134.5) // 99 + exams 35.5
  })

  it('enterprise = base fixa, ignorando completamente os addons', () => {
    const t = computePlanPrice({
      ...BASE, plan: 'enterprise',
      addonKeys: ['whatsapp_ai', 'surgery_advanced', 'exams'], cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(299)
    expect(t.effectiveTotal).toBe(299)
  })

  it('desconto anual aplica nos dois planos', () => {
    const p = computePlanPrice({ ...BASE, plan: 'premium', addonKeys: ['whatsapp_ai'], cycle: 'yearly' })
    expect(p.monthlyTotal).toBe(178.9)
    expect(p.yearlyTotal).toBe(2146.8)
    expect(p.yearlyDiscounted).toBe(1717.44)
    expect(p.effectiveTotal).toBe(1717.44)

    const e = computePlanPrice({ ...BASE, plan: 'enterprise', addonKeys: [], cycle: 'yearly' })
    expect(e.yearlyTotal).toBe(3588)
    expect(e.yearlyDiscounted).toBe(2870.4)
  })

  it('arredonda centavos corretamente (2 casas)', () => {
    const t = computePlanPrice({
      plan: 'premium', premiumBase: 0.1, enterpriseBase: 0,
      annualDiscountPercent: 33.33,
      catalog: [{ module_key: 'x', monthly_price: 0.2, included_in_plan: 'enterprise' }],
      addonKeys: ['x'], cycle: 'yearly',
    })
    expect(t.monthlyTotal).toBe(0.3)
    expect(t.yearlyTotal).toBe(3.6)
    expect(t.yearlyDiscounted).toBe(2.4)
  })
})
