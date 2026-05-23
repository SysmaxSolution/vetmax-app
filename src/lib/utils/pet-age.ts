/**
 * Formata a idade de um pet a partir do birth_date ISO ('YYYY-MM-DD').
 *
 * Regras:
 *   - < 1 mês       → "< 1 mês"
 *   - < 12 meses    → "N mês(es)"
 *   - >= 12 meses   → "X ano(s) e Y mês(es)" (Y omitido se 0)
 *   - data nula     → null
 *   - data futura   → null (não exibe idade negativa)
 *
 * O cálculo considera o dia do mês para não arredondar para cima:
 *   nasceu 15/03/2024 e hoje é 10/03/2026 → 23 meses (1 ano e 11 meses)
 */
export function formatPetAge(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null

  const today = new Date()
  let months = (today.getFullYear() - birth.getFullYear()) * 12
            + (today.getMonth() - birth.getMonth())
  if (today.getDate() < birth.getDate()) months--

  if (months < 0)  return null
  if (months < 1)  return '< 1 mês'
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`

  const years = Math.floor(months / 12)
  const rem   = months % 12
  const yLabel = `${years} ${years === 1 ? 'ano' : 'anos'}`
  if (rem === 0) return yLabel
  const mLabel = `${rem} ${rem === 1 ? 'mês' : 'meses'}`
  return `${yLabel} e ${mLabel}`
}
