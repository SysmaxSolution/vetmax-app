// Cálculo puro do custo a pagar ao laboratório parceiro por um exame (F1/F2).
// Regra por item (percent do valor OU valor fixo × qtd); fallback 'all'. SEM I/O.

export interface LabService {
  stock_item_id?: string | null
  price_snapshot?: number | null
  quantity?:      number | null
}
export interface LabRule {
  item_id?:        string | null
  item_type?:      string | null   // 'all' | 'product' | 'service' | 'package'
  commission_type: string          // 'percent' | 'fixed'
  value:           number
}

export function computeLabCost(services: LabService[], rules: LabRule[]): number {
  const byItem = new Map<string, LabRule>()
  for (const r of rules) if (r.item_id) byItem.set(r.item_id, r)
  const allRule = rules.find(r => r.item_type === 'all')

  let cost = 0
  for (const s of services) {
    const rule = (s.stock_item_id ? byItem.get(s.stock_item_id) : undefined) ?? allRule
    if (!rule) continue
    const qty  = Number(s.quantity ?? 1)
    const base = Number(s.price_snapshot ?? 0) * qty
    cost += rule.commission_type === 'percent'
      ? base * Number(rule.value) / 100
      : Number(rule.value) * qty
  }
  return Math.round(cost * 100) / 100
}
