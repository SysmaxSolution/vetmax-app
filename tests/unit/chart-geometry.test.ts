/**
 * Unit — Geometria dos gráficos SVG (BI).
 */
import { niceCeil, scaleLinear, barLayout, linePoints, polylinePath, donutSegments } from '@/lib/reports/chart-geometry'

describe('niceCeil', () => {
  it('arredonda para 1/2/5 × 10^n', () => {
    expect(niceCeil(7)).toBe(10)
    expect(niceCeil(12)).toBe(20)
    expect(niceCeil(30)).toBe(50)
    expect(niceCeil(120)).toBe(200)
    expect(niceCeil(1)).toBe(1)
  })
  it('protege valores inválidos', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(-5)).toBe(1)
    expect(niceCeil(NaN)).toBe(1)
  })
})

describe('scaleLinear', () => {
  it('mapeia domínio → faixa', () => {
    const s = scaleLinear(100, 200)
    expect(s(100)).toBe(200)
    expect(s(50)).toBe(100)
    expect(s(0)).toBe(0)
  })
  it('evita divisão por zero e negativos', () => {
    expect(scaleLinear(0, 100)(10)).toBe(1000)   // max→1
    expect(scaleLinear(100, 200)(-5)).toBe(0)
  })
})

describe('barLayout', () => {
  it('gera uma barra por valor com altura proporcional', () => {
    const { bars, max } = barLayout([50, 100], 200, 100)
    expect(bars).toHaveLength(2)
    expect(max).toBe(100)
    expect(bars[1].h).toBe(100)   // 100/100 × altura
    expect(bars[0].h).toBe(50)
    expect(bars[1].y).toBe(0)     // topo
  })
  it('lista vazia → sem barras', () => {
    expect(barLayout([], 200, 100).bars).toHaveLength(0)
  })
})

describe('linePoints / polylinePath', () => {
  it('distribui pontos no eixo X e inverte Y', () => {
    const { points } = linePoints([0, 100], 100, 100)
    expect(points[0]).toEqual({ x: 0, y: 100 })     // valor 0 → base
    expect(points[1]).toEqual({ x: 100, y: 0 })     // valor máx → topo
  })
  it('ponto único é centralizado', () => {
    const { points } = linePoints([10], 100, 100)
    expect(points[0].x).toBe(50)
  })
  it('polylinePath monta M/L', () => {
    expect(polylinePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0.00,0.00 L10.00,5.00')
    expect(polylinePath([])).toBe('')
  })
})

describe('donutSegments', () => {
  it('percentuais somam 100 e dash é proporcional', () => {
    const segs = donutSegments([25, 75], 400)
    expect(segs[0].pct).toBe(25)
    expect(segs[1].pct).toBe(75)
    expect(segs[0].dash).toBe(100)   // 25% de 400
    expect(segs[1].dash).toBe(300)
  })
  it('offset acumula os segmentos', () => {
    const segs = donutSegments([25, 75], 400)
    expect(segs[0].offset).toBe(-0)
    expect(segs[1].offset).toBe(-100)   // após 25% de 400
  })
  it('total zero → tudo 0%', () => {
    const segs = donutSegments([0, 0], 400)
    expect(segs.every(s => s.pct === 0)).toBe(true)
  })
})
