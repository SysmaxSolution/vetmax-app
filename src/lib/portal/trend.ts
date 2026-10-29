// Lógica PURA da evolução de exames (um analito ao longo do tempo). Sem I/O.

/** Converte "6.8", "1,1", "18500", "12.3 " em número; retorna null se não numérico. */
export function parseAnalyteNumber(s: string | null | undefined): number | null {
  if (s == null) return null
  let t = String(s).trim().replace(/\s+/g, '')
  if (!t || !/^[+-]?[\d.,]+$/.test(t)) return null   // rejeita "Negativo", "Reagente", etc.
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')  // BR: 1.234,56
  else if (t.includes(',')) t = t.replace(',', '.')                                    // 1,1
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export interface TrendRow { analyte: string; unit: string | null; value: string; date: string; flag: string | null }
export interface TrendPoint { date: string; value: number; flag: string | null }
export interface Trend { analyte: string; unit: string | null; points: TrendPoint[] }

/** Agrupa por analito, mantém só os com ≥2 pontos numéricos, ordenados por data asc. */
export function buildTrends(rows: TrendRow[]): Trend[] {
  const map = new Map<string, { unit: string | null; pts: TrendPoint[] }>()
  for (const r of rows) {
    const v = parseAnalyteNumber(r.value)
    if (v == null || !r.date) continue
    const key = r.analyte
    if (!map.has(key)) map.set(key, { unit: r.unit ?? null, pts: [] })
    map.get(key)!.pts.push({ date: r.date, value: v, flag: r.flag ?? null })
  }
  const out: Trend[] = []
  for (const [analyte, { unit, pts }] of map) {
    // dedup por data (mesma data → mantém o último) e ordena
    const byDate = new Map<string, TrendPoint>()
    for (const p of pts) byDate.set(p.date.slice(0, 10), p)
    const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length >= 2) out.push({ analyte, unit, points: sorted })
  }
  return out.sort((a, b) => a.analyte.localeCompare(b.analyte))
}

export interface XY { x: number; y: number }

/** Escala os valores dentro do próprio intervalo (com folga), preenchendo a altura. */
export function trendGeometry(values: number[], width: number, height: number, pad = 6): { pts: XY[]; min: number; max: number } {
  const n = values.length
  if (n === 0) return { pts: [], min: 0, max: 1 }
  let min = Math.min(...values), max = Math.max(...values)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  const stepX = n === 1 ? 0 : (width - pad * 2) / (n - 1)
  const pts = values.map((v, i) => ({
    x: pad + (n === 1 ? (width - pad * 2) / 2 : i * stepX),
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  }))
  return { pts, min, max }
}
