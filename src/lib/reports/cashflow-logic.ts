// Núcleo puro do Fluxo de Caixa (realizado × projetado). Agrupa títulos por mês,
// separando o que já foi baixado (realizado) do que está em aberto (previsto,
// pela data de vencimento), e acumula o saldo. SEM I/O.

export interface CashItem {
  type:     string        // 'receivable' | 'payable'
  amount:   number
  date:     string        // AAAA-MM-DD (payment_date se realizado; due_date se previsto)
  realized: boolean
}

export interface CashPeriod {
  period:          string   // 'AAAA-MM'
  realizado_in:    number
  realizado_out:   number
  previsto_in:     number
  previsto_out:    number
  net:             number   // (in − out) do período, realizado + previsto
  accumulated:     number   // saldo acumulado projetado
}

const r2 = (v: number) => Math.round(v * 100) / 100
const monthOf = (iso: string) => iso.slice(0, 7)

export function projectCashflow(items: CashItem[], openingBalance = 0): CashPeriod[] {
  const m = new Map<string, { ri: number; ro: number; pi: number; po: number }>()
  for (const it of items) {
    if (!it.date) continue
    const amt = Number(it.amount ?? 0)
    if (!Number.isFinite(amt)) continue
    const p = monthOf(it.date)
    const acc = m.get(p) ?? { ri: 0, ro: 0, pi: 0, po: 0 }
    const isIn = it.type === 'receivable'
    if (it.realized) { if (isIn) acc.ri += amt; else acc.ro += amt }
    else            { if (isIn) acc.pi += amt; else acc.po += amt }
    m.set(p, acc)
  }
  let accumulated = openingBalance
  return [...m.keys()].sort().map(p => {
    const v = m.get(p)!
    const net = r2(v.ri + v.pi - v.ro - v.po)
    accumulated = r2(accumulated + net)
    return {
      period: p,
      realizado_in: r2(v.ri), realizado_out: r2(v.ro),
      previsto_in: r2(v.pi), previsto_out: r2(v.po),
      net, accumulated,
    }
  })
}
