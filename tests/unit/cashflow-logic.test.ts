/**
 * Unit — Fluxo de Caixa (realizado × projetado).
 */
import { projectCashflow } from '@/lib/reports/cashflow-logic'

const ITEMS = [
  { type: 'receivable', amount: 100, date: '2026-01-15', realized: true },
  { type: 'payable',    amount: 40,  date: '2026-01-20', realized: true },
  { type: 'receivable', amount: 200, date: '2026-02-10', realized: false },
  { type: 'payable',    amount: 50,  date: '2026-02-15', realized: false },
]

describe('projectCashflow', () => {
  it('agrupa por mês e separa realizado × previsto', () => {
    const p = projectCashflow(ITEMS)
    expect(p.map(x => x.period)).toEqual(['2026-01', '2026-02'])
    expect(p[0].realizado_in).toBe(100)
    expect(p[0].realizado_out).toBe(40)
    expect(p[1].previsto_in).toBe(200)
    expect(p[1].previsto_out).toBe(50)
  })
  it('net por período = entradas − saídas', () => {
    const p = projectCashflow(ITEMS)
    expect(p[0].net).toBe(60)    // 100 - 40
    expect(p[1].net).toBe(150)   // 200 - 50
  })
  it('saldo acumulado soma os períodos', () => {
    const p = projectCashflow(ITEMS)
    expect(p[0].accumulated).toBe(60)
    expect(p[1].accumulated).toBe(210)
  })
  it('respeita o saldo inicial', () => {
    const p = projectCashflow(ITEMS, 1000)
    expect(p[0].accumulated).toBe(1060)
    expect(p[1].accumulated).toBe(1210)
  })
  it('ignora itens sem data e lista vazia', () => {
    expect(projectCashflow([])).toEqual([])
    expect(projectCashflow([{ type: 'receivable', amount: 10, date: '', realized: true }])).toEqual([])
  })
  it('ordena os períodos cronologicamente', () => {
    const p = projectCashflow([
      { type: 'receivable', amount: 1, date: '2026-03-01', realized: true },
      { type: 'receivable', amount: 1, date: '2026-01-01', realized: true },
    ])
    expect(p.map(x => x.period)).toEqual(['2026-01', '2026-03'])
  })
})
