/**
 * Idade no formato "9 A 3 M 30 D" (anos / meses / dias) — padrão usado em
 * laudos e resultados de laboratório (ex.: Clínica Animais). Módulo puro.
 *
 * Cálculo calendário: avança anos e meses inteiros a partir do nascimento
 * e conta os dias restantes até a data de referência (data do documento).
 */

export interface AgeParts { years: number; months: number; days: number }

function parseDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const s = String(raw)
  // 'YYYY-MM-DD' puro: cria em horário LOCAL (new Date('2020-01-01') seria UTC
  // e viraria 31/12 em fusos negativos como o Brasil).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function ageParts(birth: unknown, reference: Date = new Date()): AgeParts | null {
  const b = parseDate(birth)
  if (!b) return null
  const r = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  if (b0 > r) return { years: 0, months: 0, days: 0 }

  // Meses inteiros completos entre as datas; se o dia de referência ainda
  // não alcançou o dia do nascimento, o mês corrente não fechou.
  let totalMonths = (r.getFullYear() - b0.getFullYear()) * 12 + (r.getMonth() - b0.getMonth())
  if (r.getDate() < b0.getDate()) totalMonths -= 1
  if (totalMonths < 0) totalMonths = 0

  // Âncora = nascimento + totalMonths (dia clampado ao tamanho do mês, ex.
  // 31/01 + 1 mês = 28/02). Dias = distância real até a referência.
  const anchorYear = b0.getFullYear() + Math.floor((b0.getMonth() + totalMonths) / 12)
  const anchorMonth = (b0.getMonth() + totalMonths) % 12
  const daysInAnchorMonth = new Date(anchorYear, anchorMonth + 1, 0).getDate()
  const anchor = new Date(anchorYear, anchorMonth, Math.min(b0.getDate(), daysInAnchorMonth))
  const days = Math.max(0, Math.round((r.getTime() - anchor.getTime()) / 86_400_000))

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days }
}

/** "9 A 3 M 30 D". Retorna '' quando a data é inválida/ausente. */
export function formatAgeAMD(birth: unknown, reference: Date = new Date()): string {
  const p = ageParts(birth, reference)
  if (!p) return ''
  return `${p.years} A ${p.months} M ${p.days} D`
}
