// Núcleo puro do Faturamento por dimensão. Agrupa itens {key,label,amount} e
// devolve linhas ordenadas por total desc + participação (%). SEM I/O.

export interface GroupItem { key: string; label: string; amount: number }
export interface GroupRow  { key: string; label: string; total: number; count: number; pct: number }

const r2 = (v: number) => Math.round(v * 100) / 100

export function groupSum(items: GroupItem[]): { rows: GroupRow[]; total: number } {
  const m = new Map<string, { label: string; total: number; count: number }>()
  let total = 0
  for (const it of items) {
    const amt = Number(it.amount ?? 0)
    if (!Number.isFinite(amt)) continue
    const acc = m.get(it.key) ?? { label: it.label, total: 0, count: 0 }
    acc.total += amt; acc.count += 1; m.set(it.key, acc)
    total += amt
  }
  total = r2(total)
  const rows: GroupRow[] = [...m.entries()]
    .map(([key, v]) => ({ key, label: v.label, total: r2(v.total), count: v.count, pct: total > 0 ? r2((v.total / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
  return { rows, total }
}
