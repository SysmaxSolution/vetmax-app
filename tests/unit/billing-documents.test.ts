/**
 * Unit — Módulo Faturamento (Fase 1, 08/06/2026).
 * Cálculo de total do documento (computeBillingTotal) — base do orçamento.
 *
 * A numeração atômica (rpc_next_billing_number) é validada por integração no
 * banco; aqui cobrimos a aritmética pura, à prova de float.
 */

import { computeBillingTotal } from '@/lib/billing/compute'

describe('billing — computeBillingTotal', () => {
  test('TC-BIL-001 → soma simples qtd × preço', () => {
    expect(computeBillingTotal([
      { quantity: 2, unit_price: 50 },
      { quantity: 1, unit_price: 120 },
    ])).toBe(220)
  })

  test('TC-BIL-002 → arredondamento por linha (float-safe)', () => {
    // 3 × 10.10 = 30.30 ; 1 × 0.1+0.2 não escapa
    expect(computeBillingTotal([
      { quantity: 3, unit_price: 10.10 },
      { quantity: 1, unit_price: 0.30 },
    ])).toBe(30.6)
  })

  test('TC-BIL-003 → quantidade fracionária (ex.: 1,5 mL)', () => {
    expect(computeBillingTotal([{ quantity: 1.5, unit_price: 30 }])).toBe(45)
  })

  test('TC-BIL-004 → itens vazios → 0', () => {
    expect(computeBillingTotal([])).toBe(0)
  })

  test('TC-BIL-005 → valores inválidos não quebram (NaN → 0)', () => {
    expect(computeBillingTotal([
      { quantity: NaN as unknown as number, unit_price: 10 },
      { quantity: 2, unit_price: 25 },
    ])).toBe(50)
  })

  test('TC-BIL-006 → centavos preservados na soma de várias linhas', () => {
    expect(computeBillingTotal([
      { quantity: 1, unit_price: 33.33 },
      { quantity: 1, unit_price: 33.33 },
      { quantity: 1, unit_price: 33.34 },
    ])).toBe(100)
  })
})
