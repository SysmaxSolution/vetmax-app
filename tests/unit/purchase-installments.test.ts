/**
 * Unit — Parcelas de compra (Compras → Contas a Pagar, item 1.8).
 */
import { generateEqualInstallments, sumInstallments } from '@/lib/purchases/installments'

describe('generateEqualInstallments', () => {
  it('1x = total à vista (+30 dias)', () => {
    const r = generateEqualInstallments(100, 1, '2026-09-01')
    expect(r).toHaveLength(1)
    expect(r[0].amount).toBe(100)
    expect(r[0].due_date).toBe('2026-10-01')
  })

  it('3x divide e a última fecha o total (sem perder centavo)', () => {
    const r = generateEqualInstallments(100, 3, '2026-09-01')
    expect(r.map(x => x.amount)).toEqual([33.33, 33.33, 33.34])
    expect(sumInstallments(r)).toBe(100)
  })

  it('12x soma exatamente o total', () => {
    const r = generateEqualInstallments(1000, 12, '2026-09-01')
    expect(r).toHaveLength(12)
    expect(sumInstallments(r)).toBe(1000)
  })

  it('vencimentos a cada 30 dias a partir da base', () => {
    const r = generateEqualInstallments(300, 3, '2026-09-01')
    expect(r.map(x => x.due_date)).toEqual(['2026-10-01', '2026-10-31', '2026-11-30'])
  })

  it('entradas inválidas retornam vazio', () => {
    expect(generateEqualInstallments(100, 0, '2026-09-01')).toEqual([])
    expect(generateEqualInstallments(-5, 2, '2026-09-01')).toEqual([])
  })

  it('valor com centavos quebrados fecha certo (10 / 3)', () => {
    const r = generateEqualInstallments(10, 3, '2026-09-01')
    expect(r.map(x => x.amount)).toEqual([3.33, 3.33, 3.34])
    expect(sumInstallments(r)).toBe(10)
  })
})
