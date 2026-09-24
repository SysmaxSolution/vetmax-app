// Núcleo puro do Livro de Controlados: dado o conjunto de eventos sinalizados de
// um item, calcula saldo inicial (eventos antes de `from`), a razão do período
// com saldo corrente, e os totais de entrada/saída/perda. SEM I/O.

export type ControlledKind = 'entrada' | 'saida' | 'perda' | 'ajuste'

export interface LedgerEvent {
  date:      string
  delta:     number            // sinalizado: +entrada / −saída
  kind:      ControlledKind
  origin?:   string
  reference?: string | null
}

export interface LedgerLine {
  date:     string
  kind:     ControlledKind
  quantity: number
  balance:  number
  origin:   string
  reference: string | null
}

export interface LedgerResult {
  opening:   number
  entries:   LedgerLine[]
  total_in:  number
  total_out: number
  total_loss: number
  closing:   number
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Classifica um movimento de estoque em delta sinalizado + tipo. */
export function movementDelta(movement_type: string, quantity_change: number, quantity_before?: number | null, quantity_after?: number | null): { delta: number; kind: ControlledKind } {
  const delta = (quantity_after != null && quantity_before != null)
    ? Number(quantity_after) - Number(quantity_before)
    : (movement_type === 'DEBIT' ? -Math.abs(Number(quantity_change ?? 0)) : Math.abs(Number(quantity_change ?? 0)))
  let kind: ControlledKind
  if (movement_type === 'CREDIT') kind = 'entrada'
  else if (movement_type === 'DEBIT') kind = 'saida'
  else kind = delta < 0 ? 'perda' : 'ajuste'
  return { delta: r3(delta), kind }
}

export function buildItemLedger(events: LedgerEvent[], from: string): LedgerResult {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  let opening = 0
  for (const e of sorted) if (e.date < from) opening += e.delta
  opening = r3(opening)

  let balance = opening
  let total_in = 0, total_out = 0, total_loss = 0
  const entries: LedgerLine[] = []
  for (const e of sorted) {
    if (e.date < from) continue
    balance = r3(balance + e.delta)
    if (e.kind === 'entrada' || (e.kind === 'ajuste' && e.delta > 0)) total_in += e.delta
    else if (e.kind === 'perda') total_loss += -e.delta
    else total_out += -e.delta
    entries.push({ date: e.date, kind: e.kind, quantity: e.delta, balance, origin: e.origin ?? '', reference: e.reference ?? null })
  }
  return { opening, entries, total_in: r3(total_in), total_out: r3(total_out), total_loss: r3(total_loss), closing: balance }
}
