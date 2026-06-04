/**
 * Unit — Épico A (reunião 04/06/2026): taxa administrativa sobre a
 * coparticipação Petlove paga no cartão.
 *
 * Regras: % do cadastro do serviço; só sobre copart; só cartão; Q5 round
 * por item; Q1 proporcional ao valor no cartão. Exemplo da Laís: "R$ 2,50 a
 * cada R$ 25" = 10% → copart 30,21 exibe "(+ R$ 3,02 Taxa Adm Cartão (10%))".
 *
 * TC-A-001..010 → src/lib/copay-interest.ts
 */

import {
  computeFullCopayInterest,
  proportionalCardInterest,
  effectiveInterestPercent,
} from '@/lib/copay-interest'

describe('copay-interest — computeFullCopayInterest (Q5: round por item)', () => {
  test('TC-A-001 → exemplo da reunião: copart 30,21 @ 10% = 3,02', () => {
    expect(computeFullCopayInterest([{ copay: 30.21, percent: 10 }])).toBe(3.02)
  })

  test('TC-A-002 → conta de cabeça do Levi: 25,00 @ 10% = 2,50', () => {
    expect(computeFullCopayInterest([{ copay: 25, percent: 10 }])).toBe(2.5)
  })

  test('TC-A-003 → arredonda POR ITEM e soma (difere do cálculo no total)', () => {
    // 3 itens de 33,335% geram arredondamento item a item
    const items = [
      { copay: 10.05, percent: 7.5 },  // 0.75375 → 0.75
      { copay: 10.05, percent: 7.5 },  // 0.75
      { copay: 10.05, percent: 7.5 },  // 0.75
    ]
    expect(computeFullCopayInterest(items)).toBe(2.25)
    // No total seria ROUND(30.15 × 7.5%) = ROUND(2.26125) = 2.26 — diferente
  })

  test('TC-A-004 → % diferente por serviço soma corretamente', () => {
    expect(computeFullCopayInterest([
      { copay: 30, percent: 10 },  // 3.00
      { copay: 50, percent: 12 },  // 6.00
    ])).toBe(9)
  })

  test('TC-A-005 → itens sem % ou sem copart não geram taxa', () => {
    expect(computeFullCopayInterest([
      { copay: 30, percent: 0 },
      { copay: 0,  percent: 10 },
    ])).toBe(0)
  })
})

describe('copay-interest — proportionalCardInterest (Q1: proporcional ao cartão)', () => {
  test('TC-A-006 → cartão cobre tudo → taxa cheia', () => {
    expect(proportionalCardInterest(3.02, 30.21, 30.21)).toBe(3.02)
  })

  test('TC-A-007 → split misto 50/50 (metade cartão, metade dinheiro) → metade da taxa', () => {
    // Decisão Q1 do PO: copart 30,21 metade no cartão → taxa só sobre os 15,10
    expect(proportionalCardInterest(3.02, 30.21, 15.105)).toBe(1.51)
  })

  test('TC-A-008 → sem cartão → taxa zero', () => {
    expect(proportionalCardInterest(3.02, 30.21, 0)).toBe(0)
  })

  test('TC-A-009 → cartão acima do total não extrapola a taxa cheia (clamp)', () => {
    expect(proportionalCardInterest(3.02, 30.21, 99)).toBe(3.02)
  })
})

describe('copay-interest — effectiveInterestPercent (rótulo da UI)', () => {
  test('TC-A-010 → % uniforme retorna o % exato (verificável de cabeça)', () => {
    expect(effectiveInterestPercent([
      { copay: 30.21, percent: 10 },
      { copay: 50,    percent: 10 },
    ])).toBe(10)
  })

  test('TC-A-011 → % misto retorna o efetivo agregado', () => {
    // 3.00 + 6.00 = 9.00 sobre 80 → 11.25%
    expect(effectiveInterestPercent([
      { copay: 30, percent: 10 },
      { copay: 50, percent: 12 },
    ])).toBe(11.25)
  })
})
