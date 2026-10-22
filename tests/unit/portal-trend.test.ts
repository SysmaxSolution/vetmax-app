/** Unit — evolução de exames no portal (Fase 3). */
import { parseAnalyteNumber, buildTrends, trendGeometry } from '@/lib/portal/trend'

describe('parseAnalyteNumber', () => {
  it('decimal ponto/vírgula', () => {
    expect(parseAnalyteNumber('6.8')).toBe(6.8)
    expect(parseAnalyteNumber('1,1')).toBe(1.1)
    expect(parseAnalyteNumber('18500')).toBe(18500)
  })
  it('milhar BR', () => expect(parseAnalyteNumber('1.234,56')).toBe(1234.56))
  it('rejeita texto', () => {
    expect(parseAnalyteNumber('Negativo')).toBeNull()
    expect(parseAnalyteNumber('')).toBeNull()
    expect(parseAnalyteNumber(null)).toBeNull()
  })
})

describe('buildTrends', () => {
  const rows = [
    { analyte: 'Creatinina', unit: 'mg/dL', value: '1.1', date: '2026-03-01', flag: 'N' },
    { analyte: 'Creatinina', unit: 'mg/dL', value: '1.4', date: '2026-06-01', flag: 'N' },
    { analyte: 'Creatinina', unit: 'mg/dL', value: '1.8', date: '2026-09-01', flag: 'H' },
    { analyte: 'ALT',        unit: 'U/L',   value: '95',  date: '2026-09-01', flag: 'H' }, // só 1 ponto
    { analyte: 'Obs',        unit: null,    value: 'Reagente', date: '2026-09-01', flag: null },
  ]
  it('mantém só analitos com ≥2 pontos numéricos, ordenados', () => {
    const t = buildTrends(rows)
    expect(t.map(x => x.analyte)).toEqual(['Creatinina'])
    expect(t[0].points.map(p => p.value)).toEqual([1.1, 1.4, 1.8])
    expect(t[0].unit).toBe('mg/dL')
  })
  it('dedup por data (último vence)', () => {
    const r = [
      { analyte: 'X', unit: null, value: '1', date: '2026-01-01', flag: null },
      { analyte: 'X', unit: null, value: '2', date: '2026-01-01', flag: null },
      { analyte: 'X', unit: null, value: '3', date: '2026-02-01', flag: null },
    ]
    expect(buildTrends(r)[0].points.map(p => p.value)).toEqual([2, 3])
  })
})

describe('trendGeometry', () => {
  it('escala dentro do intervalo e preenche a altura', () => {
    const g = trendGeometry([1, 2, 3], 100, 40, 0)
    expect(g.min).toBe(1); expect(g.max).toBe(3)
    expect(g.pts[0].y).toBeCloseTo(40)  // menor valor → base
    expect(g.pts[2].y).toBeCloseTo(0)   // maior valor → topo
    expect(g.pts[0].x).toBe(0); expect(g.pts[2].x).toBe(100)
  })
  it('valores iguais não quebram', () => {
    const g = trendGeometry([5, 5], 100, 40, 0)
    expect(g.pts).toHaveLength(2)
    expect(Number.isFinite(g.pts[0].y)).toBe(true)
  })
})
