// Totais puros de títulos por situação (rodapé de A Receber/Pagar).
// Cancelados nunca entram; usa valor líquido (amount − discount).

import { netAmount, type EntryLike } from './reconciliation'

/** Soma o valor líquido dos títulos com o status informado. */
export function sumByStatus(entries: EntryLike[], status: 'pending' | 'paid'): number {
  const total = entries
    .filter(e => e.status === status)
    .reduce((s, e) => s + netAmount(e), 0)
  return Math.round(total * 100) / 100
}
