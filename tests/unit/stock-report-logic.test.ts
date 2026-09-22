/**
 * Unit — Posição de Estoque (ruptura, validade, valor).
 */
import { stockStatus, daysToExpiry, classifyStock } from '@/lib/reports/stock-report-logic'

describe('stockStatus', () => {
  it('ruptura quando qtd <= mínimo (ou zero)', () => {
    expect(stockStatus(0, 5)).toBe('ruptura')
    expect(stockStatus(5, 5)).toBe('ruptura')
    expect(stockStatus(3, 5)).toBe('ruptura')
  })
  it('baixo até 25% acima do mínimo', () => {
    expect(stockStatus(6, 5)).toBe('baixo')     // 6 <= 6.25
    expect(stockStatus(10, 8)).toBe('baixo')    // 10 <= 10
  })
  it('ok acima disso', () => {
    expect(stockStatus(100, 5)).toBe('ok')
  })
})

describe('daysToExpiry', () => {
  it('positivo no futuro, negativo se vencido, null sem validade', () => {
    expect(daysToExpiry('2026-09-20', '2026-09-10')).toBe(10)
    expect(daysToExpiry('2026-09-01', '2026-09-10')).toBe(-9)
    expect(daysToExpiry(null, '2026-09-10')).toBeNull()
  })
})

describe('classifyStock', () => {
  const items = [
    { id: '1', name: 'Med A', quantity: 2, min_quantity: 5, cost_price: 10, expiry_date: '2026-10-01' },
    { id: '2', name: 'Med B', quantity: 100, min_quantity: 5, cost_price: 3, expiry_date: '2026-09-15' },
    { id: '3', name: 'Serviço', quantity: 0, min_quantity: 0, is_service: true },
  ]
  const { rows, summary } = classifyStock(items, '2026-09-01', 60)

  it('exclui serviços', () => {
    expect(rows.find(r => r.id === '3')).toBeUndefined()
    expect(rows).toHaveLength(2)
  })
  it('valor = quantidade × custo', () => {
    expect(rows.find(r => r.id === '1')!.value).toBe(20)     // 2 × 10
    expect(rows.find(r => r.id === '2')!.value).toBe(300)    // 100 × 3
  })
  it('marca ruptura e vencendo dentro da janela', () => {
    const a = rows.find(r => r.id === '1')!
    expect(a.status).toBe('ruptura')
    expect(a.expiring).toBe(true)      // vence 2026-10-01, dte=30 <= 60
  })
  it('sumário agrega ruptura / valor / vencendo', () => {
    expect(summary.count_ruptura).toBe(1)
    expect(summary.total_value).toBe(320)
    expect(summary.count_expiring).toBe(2)
  })
  it('ordena ruptura antes de OK', () => {
    expect(rows[0].status).toBe('ruptura')
  })
  it('usa fallback de custo (purchase_price / unit_price)', () => {
    const { rows: r } = classifyStock([{ id: 'x', name: 'X', quantity: 2, min_quantity: 0, purchase_price: 7 }], '2026-09-01')
    expect(r[0].value).toBe(14)
  })
})
