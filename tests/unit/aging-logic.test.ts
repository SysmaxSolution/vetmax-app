/**
 * Unit — Aging (A Receber/Pagar). Faixas de atraso + agregação.
 */
import { agingBucket, daysOverdue, summarizeAging, AGING_DEFS } from '@/lib/reports/aging-logic'

describe('daysOverdue', () => {
  it('positivo quando vencido, negativo quando a vencer', () => {
    expect(daysOverdue('2026-09-01', '2026-09-11')).toBe(10)
    expect(daysOverdue('2026-10-01', '2026-09-11')).toBe(-20)
    expect(daysOverdue('2026-09-11', '2026-09-11')).toBe(0)
  })
})

describe('agingBucket', () => {
  it('classifica a vencer / 0-30 / 31-60 / 61-90 / 90+', () => {
    expect(agingBucket(-5)).toBe('a_vencer')
    expect(agingBucket(0)).toBe('a_vencer')
    expect(agingBucket(1)).toBe('d0_30')
    expect(agingBucket(30)).toBe('d0_30')
    expect(agingBucket(31)).toBe('d31_60')
    expect(agingBucket(60)).toBe('d31_60')
    expect(agingBucket(61)).toBe('d61_90')
    expect(agingBucket(90)).toBe('d61_90')
    expect(agingBucket(91)).toBe('d90p')
    expect(agingBucket(500)).toBe('d90p')
  })
})

describe('summarizeAging', () => {
  it('agrega totais e contagens por faixa, na ordem canônica', () => {
    const rows = [
      { bucket: 'd0_30', amount: 100 },
      { bucket: 'd0_30', amount: 50 },
      { bucket: 'd90p',  amount: 200 },
      { bucket: 'a_vencer', amount: 30 },
    ]
    const out = summarizeAging(rows)
    expect(out.map(b => b.key)).toEqual(AGING_DEFS.map(d => d.key))
    const d0 = out.find(b => b.key === 'd0_30')!
    expect(d0.total).toBe(150)
    expect(d0.count).toBe(2)
    expect(out.find(b => b.key === 'd90p')!.total).toBe(200)
    expect(out.find(b => b.key === 'd31_60')!.total).toBe(0)
  })
  it('lista vazia → todas as faixas zeradas', () => {
    const out = summarizeAging([])
    expect(out).toHaveLength(5)
    expect(out.every(b => b.total === 0 && b.count === 0)).toBe(true)
  })
  it('arredonda centavos', () => {
    const out = summarizeAging([{ bucket: 'd0_30', amount: 10.005 }, { bucket: 'd0_30', amount: 0.001 }])
    expect(out.find(b => b.key === 'd0_30')!.total).toBe(10.01)
  })
})
