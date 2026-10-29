/**
 * Unit — Faturamento por dimensão (agrupamento + participação %).
 */
import { groupSum } from '@/lib/reports/revenue-breakdown'

describe('groupSum', () => {
  const items = [
    { key: 'a', label: 'Consultas', amount: 100 },
    { key: 'a', label: 'Consultas', amount: 50 },
    { key: 'b', label: 'Vacinas', amount: 30 },
  ]

  it('soma por chave e conta ocorrências', () => {
    const { rows, total } = groupSum(items)
    expect(total).toBe(180)
    const a = rows.find(r => r.key === 'a')!
    expect(a.total).toBe(150)
    expect(a.count).toBe(2)
  })
  it('calcula participação (%) sobre o total', () => {
    const { rows } = groupSum(items)
    expect(rows.find(r => r.key === 'a')!.pct).toBe(83.33)
    expect(rows.find(r => r.key === 'b')!.pct).toBe(16.67)
  })
  it('ordena por total desc', () => {
    const { rows } = groupSum(items)
    expect(rows.map(r => r.key)).toEqual(['a', 'b'])
  })
  it('lista vazia → total 0 e sem linhas', () => {
    const { rows, total } = groupSum([])
    expect(total).toBe(0)
    expect(rows).toHaveLength(0)
  })
  it('ignora valores não-numéricos', () => {
    const { total } = groupSum([{ key: 'x', label: 'X', amount: NaN as any }, { key: 'y', label: 'Y', amount: 10 }])
    expect(total).toBe(10)
  })
  it('pct = 0 quando o total é 0', () => {
    const { rows } = groupSum([{ key: 'z', label: 'Z', amount: 0 }])
    expect(rows[0].pct).toBe(0)
  })
})
