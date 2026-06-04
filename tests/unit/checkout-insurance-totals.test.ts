/**
 * Unit — Fix B2 (reunião 04/06/2026): "Aplicar cobertura" deve recalcular o
 * Total a Pagar do caixa para a coparticipação.
 *
 * Cenário da demo ao vivo: consulta de R$ 75,75 com copart R$ 30,21 e
 * repasse R$ 45,54 — o caixa exibia 75,75 quando deveria exibir 30,21.
 *
 * TC-B2-001..008 → computeCheckoutTotals (src/lib/checkout-totals.ts)
 */

import { computeCheckoutTotals } from '@/lib/checkout-totals'

const DEMO_SPLIT = {
  charge_now:        30.21,
  receivable:        45.54,
  deferred_provider: 0,
  clinic_discount:   0,
}

describe('checkout — computeCheckoutTotals (cobertura convênio)', () => {
  test('TC-B2-001 → cobertura aplicada cobra apenas a coparticipação (30,21)', () => {
    const { totalDue } = computeCheckoutTotals({
      subtotal:         75.75,
      existingDiscount: 0,
      existingPaid:     0,
      manualDiscount:   0,
      insuranceSplit:   DEMO_SPLIT,
    })
    expect(totalDue).toBe(30.21)
  })

  test('TC-B2-002 → sem cobertura (particular cheio) cobra o subtotal', () => {
    const { totalDue } = computeCheckoutTotals({
      subtotal:         75.75,
      existingDiscount: 0,
      existingPaid:     0,
      manualDiscount:   0,
      insuranceSplit:   null,
    })
    expect(totalDue).toBe(75.75)
  })

  test('TC-B2-003 → remover cobertura volta ao particular cheio (simetria)', () => {
    const applied = computeCheckoutTotals({
      subtotal: 75.75, existingDiscount: 0, existingPaid: 0, manualDiscount: 0,
      insuranceSplit: DEMO_SPLIT,
    })
    const removed = computeCheckoutTotals({
      subtotal: 75.75, existingDiscount: 0, existingPaid: 0, manualDiscount: 0,
      insuranceSplit: null,
    })
    expect(applied.totalDue).toBe(30.21)
    expect(removed.totalDue).toBe(75.75)
  })

  test('TC-B2-004 → clinic_discount também é abatido (modelo catálogo)', () => {
    // Particular 120, copart 30, repasse 73 → desconto da clínica 17
    const { totalDue } = computeCheckoutTotals({
      subtotal:         120,
      existingDiscount: 0,
      existingPaid:     0,
      manualDiscount:   0,
      insuranceSplit:   { charge_now: 30, receivable: 73, deferred_provider: 0, clinic_discount: 17 },
    })
    expect(totalDue).toBe(30)
  })

  test('TC-B2-005 → deferred_provider (Petlove cobra no cartão) sai do caixa', () => {
    // copay_charger='mixed': metade no caixa, metade no cartão da Petlove
    const { totalDue } = computeCheckoutTotals({
      subtotal:         100,
      existingDiscount: 0,
      existingPaid:     0,
      manualDiscount:   0,
      insuranceSplit:   { charge_now: 15, receivable: 70, deferred_provider: 15, clinic_discount: 0 },
    })
    expect(totalDue).toBe(15)
  })

  test('TC-B2-006 → desconto manual abate em cima da coparticipação', () => {
    const { totalDue } = computeCheckoutTotals({
      subtotal:         75.75,
      existingDiscount: 0,
      existingPaid:     0,
      manualDiscount:   5,
      insuranceSplit:   DEMO_SPLIT,
    })
    expect(totalDue).toBe(25.21)
  })

  test('TC-B2-007 → baixa parcial anterior reduz o saldo (existingPaid)', () => {
    const { totalDue } = computeCheckoutTotals({
      subtotal:         75.75,
      existingDiscount: 0,
      existingPaid:     10,
      manualDiscount:   0,
      insuranceSplit:   DEMO_SPLIT,
    })
    expect(totalDue).toBe(20.21)
  })

  test('TC-B2-008 → nunca retorna negativo (clamp em zero)', () => {
    const { totalDue, totalAmount } = computeCheckoutTotals({
      subtotal:         30,
      existingDiscount: 10,
      existingPaid:     50,
      manualDiscount:   10,
      insuranceSplit:   { charge_now: 0, receivable: 30, deferred_provider: 0, clinic_discount: 0 },
    })
    expect(totalAmount).toBe(0)
    expect(totalDue).toBe(0)
  })
})
