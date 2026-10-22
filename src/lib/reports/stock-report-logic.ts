// Núcleo puro do relatório de Estoque: ruptura (abaixo do mínimo), validade
// próxima e valor imobilizado (qtd × custo). SEM I/O.

export interface StockItemLike {
  id?:           string
  name?:         string
  quantity?:     number | null
  min_quantity?: number | null
  unit_price?:   number | null
  cost_price?:   number | null
  purchase_price?: number | null
  expiry_date?:  string | null
  is_service?:   boolean | null
}

export type StockStatus = 'ruptura' | 'baixo' | 'ok'

export interface StockRow {
  id: string; name: string; quantity: number; min_quantity: number
  status: StockStatus; unit_cost: number; value: number
  days_to_expiry: number | null; expiring: boolean
}

export interface StockSummary {
  total_value:    number
  count_ruptura:  number
  count_baixo:    number
  count_expiring: number
  count_ok:       number
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function stockStatus(quantity: number, min: number): StockStatus {
  if (quantity <= 0 || quantity <= min) return 'ruptura'
  if (quantity <= min * 1.25) return 'baixo'   // até 25% acima do mínimo = atenção
  return 'ok'
}

export function daysToExpiry(expiry: string | null | undefined, asOf: string): number | null {
  if (!expiry) return null
  const e = new Date(expiry + 'T00:00:00').getTime()
  const ref = new Date(asOf + 'T00:00:00').getTime()
  return Math.floor((e - ref) / 86400000)
}

export function classifyStock(items: StockItemLike[], asOf: string, expiryWindowDays = 60): { rows: StockRow[]; summary: StockSummary } {
  const rows: StockRow[] = []
  const summary: StockSummary = { total_value: 0, count_ruptura: 0, count_baixo: 0, count_expiring: 0, count_ok: 0 }
  for (const it of items) {
    if (it.is_service) continue
    const quantity = Number(it.quantity ?? 0)
    const min = Number(it.min_quantity ?? 0)
    const unit_cost = Number(it.cost_price ?? it.purchase_price ?? it.unit_price ?? 0)
    const value = r2(quantity * unit_cost)
    const status = stockStatus(quantity, min)
    const dte = daysToExpiry(it.expiry_date ?? null, asOf)
    const expiring = dte !== null && dte <= expiryWindowDays
    rows.push({
      id: it.id ?? '', name: it.name ?? '', quantity, min_quantity: min,
      status, unit_cost: r2(unit_cost), value, days_to_expiry: dte, expiring,
    })
    summary.total_value += value
    if (status === 'ruptura') summary.count_ruptura++
    else if (status === 'baixo') summary.count_baixo++
    else summary.count_ok++
    if (expiring) summary.count_expiring++
  }
  summary.total_value = r2(summary.total_value)
  // Ordena: ruptura primeiro, depois vencendo, depois por valor desc
  rows.sort((a, b) => {
    const rank = (r: StockRow) => r.status === 'ruptura' ? 0 : r.expiring ? 1 : r.status === 'baixo' ? 2 : 3
    return rank(a) - rank(b) || b.value - a.value
  })
  return { rows, summary }
}
