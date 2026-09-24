// Núcleo puro do Aging (A Receber/Pagar). Faixas de atraso + agregação. SEM I/O.

export interface AgingBucketDef { key: string; label: string; min: number; max: number | null }

export const AGING_DEFS: AgingBucketDef[] = [
  { key: 'a_vencer', label: 'A vencer',   min: -Infinity, max: 0 },
  { key: 'd0_30',    label: '0–30 dias',  min: 1,  max: 30 },
  { key: 'd31_60',   label: '31–60 dias', min: 31, max: 60 },
  { key: 'd61_90',   label: '61–90 dias', min: 61, max: 90 },
  { key: 'd90p',     label: '90+ dias',   min: 91, max: null },
]

/** Dias de atraso: >0 vencido, <=0 a vencer. Usa datas AAAA-MM-DD. */
export function daysOverdue(dueDate: string, asOf: string): number {
  const due = new Date(dueDate + 'T00:00:00').getTime()
  const ref = new Date(asOf + 'T00:00:00').getTime()
  return Math.floor((ref - due) / 86400000)
}

export function agingBucket(days: number): string {
  for (const b of AGING_DEFS) {
    if (days >= b.min && (b.max === null || days <= b.max)) return b.key
  }
  return 'd90p'
}

export interface AgingBucketTotal { key: string; label: string; total: number; count: number }

/** Agrega linhas {bucket, amount} nos 5 baldes, na ordem canônica. */
export function summarizeAging(rows: { bucket: string; amount: number }[]): AgingBucketTotal[] {
  const m = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const acc = m.get(r.bucket) ?? { total: 0, count: 0 }
    acc.total += Number(r.amount ?? 0); acc.count += 1
    m.set(r.bucket, acc)
  }
  return AGING_DEFS.map(d => ({
    key: d.key, label: d.label,
    total: Math.round((m.get(d.key)?.total ?? 0) * 100) / 100,
    count: m.get(d.key)?.count ?? 0,
  }))
}
