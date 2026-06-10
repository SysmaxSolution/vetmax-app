// Testes da precificação do plano Premium (SaaS Fase 1).
// computePremiumPrice é a autoridade de preço no servidor — o client usa a
// mesma função apenas para display.
import { computePremiumPrice } from '@/lib/subscription/pricing'

const CATALOG = [
  { module_key: 'hospitalization_surgery', monthly_price: 49 },
  { module_key: 'billing_nfse',            monthly_price: 49 },
  { module_key: 'exams',                   monthly_price: 35.5 },
]

describe('computePremiumPrice', () => {
  it('soma base + módulos selecionados no ciclo mensal', () => {
    const t = computePremiumPrice({
      basePrice: 99,
      annualDiscountPercent: 20,
      catalog: CATALOG,
      selectedKeys: ['hospitalization_surgery', 'billing_nfse'],
      cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(197)
    expect(t.effectiveTotal).toBe(197)
  })

  it('aplica desconto anual sobre 12x o total mensal', () => {
    const t = computePremiumPrice({
      basePrice: 99,
      annualDiscountPercent: 20,
      catalog: CATALOG,
      selectedKeys: ['hospitalization_surgery'],
      cycle: 'yearly',
    })
    expect(t.monthlyTotal).toBe(148)
    expect(t.yearlyTotal).toBe(1776)
    expect(t.yearlyDiscounted).toBe(1420.8)
    expect(t.effectiveTotal).toBe(1420.8)
  })

  it('sem módulos: só a base', () => {
    const t = computePremiumPrice({
      basePrice: 99, annualDiscountPercent: 20, catalog: CATALOG,
      selectedKeys: [], cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(99)
  })

  it('ignora keys desconhecidas (defesa contra payload adulterado)', () => {
    const t = computePremiumPrice({
      basePrice: 99, annualDiscountPercent: 20, catalog: CATALOG,
      selectedKeys: ['nao_existe', 'exams'], cycle: 'monthly',
    })
    expect(t.monthlyTotal).toBe(134.5)
  })

  it('arredonda centavos corretamente (2 casas)', () => {
    const t = computePremiumPrice({
      basePrice: 0.1, annualDiscountPercent: 33.33,
      catalog: [{ module_key: 'x', monthly_price: 0.2 }],
      selectedKeys: ['x'], cycle: 'yearly',
    })
    expect(t.monthlyTotal).toBe(0.3)
    expect(t.yearlyTotal).toBe(3.6)
    expect(t.yearlyDiscounted).toBe(2.4)
  })
})
