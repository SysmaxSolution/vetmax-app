// Geometria pura para gráficos SVG inline (BI). Sem dependências, testável.

/** Arredonda um máximo para um "número bonito" de eixo (1/2/5 × 10^n). */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const f = value / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}

/** Escala linear domínio [0,max] → faixa [0,rangePx]. */
export function scaleLinear(max: number, rangePx: number): (v: number) => number {
  const m = max > 0 ? max : 1
  return (v: number) => (Math.max(0, Number(v) || 0) / m) * rangePx
}

export interface Bar { x: number; y: number; w: number; h: number }

/** Layout de barras verticais dentro de (width×height), com padding e gap. */
export function barLayout(values: number[], width: number, height: number, gapRatio = 0.3): { bars: Bar[]; max: number } {
  const n = values.length
  if (n === 0) return { bars: [], max: 0 }
  const max = niceCeil(Math.max(...values, 0))
  const slot = width / n
  const w = slot * (1 - gapRatio)
  const scale = scaleLinear(max, height)
  const bars = values.map((v, i) => {
    const h = scale(v)
    return { x: i * slot + (slot - w) / 2, y: height - h, w, h }
  })
  return { bars, max }
}

export interface Pt { x: number; y: number }

/** Pontos de uma série de linha em (width×height). */
export function linePoints(values: number[], width: number, height: number): { points: Pt[]; max: number } {
  const n = values.length
  if (n === 0) return { points: [], max: 0 }
  const max = niceCeil(Math.max(...values, 0))
  const scale = scaleLinear(max, height)
  const stepX = n === 1 ? 0 : width / (n - 1)
  const points = values.map((v, i) => ({ x: n === 1 ? width / 2 : i * stepX, y: height - scale(v) }))
  return { points, max }
}

/** String de path SVG para uma polilinha. */
export function polylinePath(points: Pt[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

export interface DonutSeg { pct: number; dash: number; offset: number }

/** Segmentos de rosca (donut) via stroke-dasharray sobre uma circunferência. */
export function donutSegments(values: number[], circumference: number): DonutSeg[] {
  const total = values.reduce((s, v) => s + (Math.max(0, Number(v) || 0)), 0)
  let acc = 0
  return values.map(v => {
    const val = Math.max(0, Number(v) || 0)
    const pct = total > 0 ? val / total : 0
    const dash = pct * circumference
    const offset = -acc * circumference
    acc += pct
    return { pct: Math.round(pct * 10000) / 100, dash, offset }
  })
}
