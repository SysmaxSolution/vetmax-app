/**
 * Calendário oficial Petlove (rdsaude.zendesk.com): o repasse é mensal e o
 * pagamento dos procedimentos autorizados ocorre até o dia 30 do mês seguinte
 * ao envio do documento fiscal. Assumimos que o NF é emitida no mês do
 * atendimento — portanto a due_date é o dia 30 do mês seguinte ao service_date.
 *
 * Quando o mês seguinte é fevereiro, ajusta para o último dia do mês (28/29).
 *
 * Exemplos:
 *   '2026-05-15' → '2026-06-30'
 *   '2026-05-31' → '2026-06-30'
 *   '2026-01-10' → '2026-02-28'
 *   '2026-12-20' → '2027-01-30'
 */
export function computePetloveDueDate(serviceDateIso: string): string {
  const [y, m] = serviceDateIso.split('-').map(Number)
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear  = m === 12 ? y + 1 : y
  // Date(year, month, 0) retorna o último dia do mês anterior — ou seja, o
  // último dia do "nextMonth" quando passamos nextMonth diretamente.
  const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate()
  const day = Math.min(30, lastDayOfNextMonth)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
