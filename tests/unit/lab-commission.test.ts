/**
 * Unit — Custo do laboratório parceiro por exame (F1/F2, comissão por item).
 */
import { computeLabCost } from '@/lib/labs/commission'

describe('computeLabCost', () => {
  it('regra percentual sobre o valor do serviço', () => {
    const cost = computeLabCost(
      [{ stock_item_id: 'a', price_snapshot: 100, quantity: 1 }],
      [{ item_id: 'a', commission_type: 'percent', value: 10 }],
    )
    expect(cost).toBe(10)
  })

  it('regra de valor fixo × quantidade', () => {
    const cost = computeLabCost(
      [{ stock_item_id: 'a', price_snapshot: 100, quantity: 3 }],
      [{ item_id: 'a', commission_type: 'fixed', value: 5 }],
    )
    expect(cost).toBe(15)
  })

  it('fallback para regra "all" quando não há regra do item', () => {
    const cost = computeLabCost(
      [{ stock_item_id: 'x', price_snapshot: 200, quantity: 1 }],
      [{ item_type: 'all', commission_type: 'percent', value: 50 }],
    )
    expect(cost).toBe(100)
  })

  it('sem regra aplicável → custo zero', () => {
    const cost = computeLabCost(
      [{ stock_item_id: 'x', price_snapshot: 200, quantity: 1 }],
      [{ item_id: 'y', commission_type: 'percent', value: 10 }],
    )
    expect(cost).toBe(0)
  })

  it('soma múltiplos serviços (regra do item vence a "all")', () => {
    const cost = computeLabCost(
      [
        { stock_item_id: 'a', price_snapshot: 100, quantity: 1 },  // regra própria 10%
        { stock_item_id: 'b', price_snapshot: 100, quantity: 2 },  // usa "all" 20%
      ],
      [
        { item_id: 'a', commission_type: 'percent', value: 10 },
        { item_type: 'all', commission_type: 'percent', value: 20 },
      ],
    )
    expect(cost).toBe(10 + 40)  // 10%*100 + 20%*200
  })

  it('quantidade padrão = 1 quando ausente', () => {
    const cost = computeLabCost(
      [{ stock_item_id: 'a', price_snapshot: 80 }],
      [{ item_id: 'a', commission_type: 'percent', value: 25 }],
    )
    expect(cost).toBe(20)
  })
})
