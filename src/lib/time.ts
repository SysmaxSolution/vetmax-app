// Helper de formatação de tempo no timezone da clínica.
//
// Problema corrigido: chamadas a `toLocaleTimeString('pt-BR', { hour, minute })`
// **server-side** (Node em UTC no Vercel) renderizam o horário UTC, e o cliente
// usa o timezone do browser — gerando inconsistência (ex.: 17:36 no card,
// 20:36 na string persistida em hospitalization_records.notes).
//
// Solução: TODA renderização de data/hora — server e cliente — passa por estes
// helpers, que SEMPRE recebem um `timeZone` explícito (default America/Sao_Paulo).
//
// Quando `clinics.timezone` for adicionado ao schema, basta passar o valor da
// clínica via parâmetro `tz`.

export const DEFAULT_CLINIC_TZ = 'America/Sao_Paulo'

type Input = Date | string | number

function toDate(input: Input): Date {
  return input instanceof Date ? input : new Date(input)
}

/** "17:36" — hora local da clínica. */
export function formatClinicTime(input: Input, tz: string = DEFAULT_CLINIC_TZ): string {
  return toDate(input).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}

/** "29/05/2026" — data local da clínica. */
export function formatClinicDate(input: Input, tz: string = DEFAULT_CLINIC_TZ): string {
  return toDate(input).toLocaleDateString('pt-BR', { timeZone: tz })
}

/** "29/05/2026 17:36" — data + hora local da clínica. */
export function formatClinicDateTime(input: Input, tz: string = DEFAULT_CLINIC_TZ): string {
  return toDate(input).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}

/** "29/05 17:36" — formato compacto p/ feeds e listas. */
export function formatClinicShort(input: Input, tz: string = DEFAULT_CLINIC_TZ): string {
  return toDate(input).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}

/** Minutos desde a meia-noite (0–1439) no fuso da clínica. */
export function clinicMinutesOfDay(input: Input = new Date(), tz: string = DEFAULT_CLINIC_TZ): number {
  const s = toDate(input).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  })
  const [h, m] = s.split(':').map(Number)
  return (h % 24) * 60 + (m || 0)
}

/**
 * true se `now` está dentro da janela [start, end] (strings "HH:MM" ou "HH:MM:SS"),
 * avaliada no fuso da clínica. Trata janelas que cruzam a meia-noite (start > end),
 * ex.: bot noturno "18:00"→"07:59".
 */
export function isWithinWindow(
  startHHMM: string,
  endHHMM: string,
  now: Input = new Date(),
  tz: string = DEFAULT_CLINIC_TZ,
): boolean {
  const toMins = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const start = toMins(startHHMM)
  const end = toMins(endHHMM)
  const cur = clinicMinutesOfDay(now, tz)
  return start <= end ? cur >= start && cur <= end : cur >= start || cur <= end
}

/**
 * "2026-06-10T14:35" — agora no formato aceito por <input type="datetime-local">.
 * Client-only: usa o timezone do navegador (o mesmo que o input exibe).
 */
export function nowLocalInputValue(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/**
 * "12:00 de 10/06" a partir do valor cru de um <input type="datetime-local">.
 * Eco do horário escolhido na UI — evita confirmar minutos herdados do default
 * sem perceber (picker mobile preserva os minutos de "agora").
 */
export function echoLocalInput(v: string): string | null {
  if (!v || v.length < 16) return null
  return `${v.slice(11, 16)} de ${v.slice(8, 10)}/${v.slice(5, 7)}`
}
