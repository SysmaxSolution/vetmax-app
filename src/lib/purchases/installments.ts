// Geração de parcelas iguais a partir de um total (compras → contas a pagar).
// Divide em centavos; a última parcela absorve o resíduo para fechar o total.
// Vencimentos a cada 30 dias a partir da base. SEM I/O — testável.

export interface GeneratedInstallment { due_date: string; amount: number }

function addDays(baseISO: string, days: number): string {
  const d = new Date(baseISO + 'T12:00:00')
  const r = new Date(d.getTime() + days * 86400000)
  return r.toISOString().slice(0, 10)
}

export function generateEqualInstallments(total: number, n: number, baseDateISO: string): GeneratedInstallment[] {
  if (!(n >= 1) || !Number.isFinite(total) || total < 0) return []
  const cents = Math.round(total * 100)
  const each = Math.floor(cents / n)
  const out: GeneratedInstallment[] = []
  for (let i = 0; i < n; i++) {
    const valCents = i === n - 1 ? cents - each * (n - 1) : each
    out.push({ due_date: addDays(baseDateISO, 30 * (i + 1)), amount: Math.round(valCents) / 100 })
  }
  return out
}

/** Soma das parcelas (para conferência com o total da nota). */
export function sumInstallments(items: { amount: number }[]): number {
  return Math.round(items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100
}
