// Lógica PURA do agendamento do recall de vacina. Sem 'use server', sem banco.
//
// Tarefa 0: o recall deixou de ser uma campanha fixa às 09:00 disparada de
// carona no Portal do Tutor. Agora cada clínica liga a rotina e escolhe o
// horário; o cron roda de hora em hora e só atende as clínicas cuja hora local
// configurada bate com a hora corrente.

export const DEFAULT_RECALL_HOUR = 9
export const DEFAULT_RECALL_DAYS = 7
export const DEFAULT_RECALL_TZ = 'America/Sao_Paulo'

export interface RecallConfig {
  enabled: boolean
  /** Hora local (0-23) em que o recall roda. */
  hour: number
  /** Antecedência do aviso, em dias. */
  days: number
  /** Fuso IANA usado para interpretar `hour`. */
  timeZone: string
}

/** Lê e SANEIA a configuração de recall vinda de clinics.flow_config. */
export function parseRecallConfig(flow: Record<string, unknown> | null | undefined): RecallConfig {
  const f = flow ?? {}
  const rawHour = Number(f.vaccine_recall_hour)
  const rawDays = Number(f.vaccine_recall_days)
  const tz = typeof f.vaccine_recall_tz === 'string' && f.vaccine_recall_tz.trim()
    ? (f.vaccine_recall_tz as string).trim()
    : DEFAULT_RECALL_TZ
  return {
    enabled: f.vaccine_recall_enabled === true,
    hour: Number.isInteger(rawHour) && rawHour >= 0 && rawHour <= 23 ? rawHour : DEFAULT_RECALL_HOUR,
    days: Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : DEFAULT_RECALL_DAYS,
    timeZone: tz,
  }
}

/** Hora local (0-23) do instante `now` no fuso informado. Cai no UTC se o fuso for inválido. */
export function localHourInTimeZone(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).formatToParts(now)
    const h = parts.find((p) => p.type === 'hour')?.value
    const n = Number(h)
    return Number.isInteger(n) ? n % 24 : now.getUTCHours()
  } catch {
    return now.getUTCHours()
  }
}

/** Data local (YYYY-MM-DD) do instante `now` no fuso informado. */
export function localDateInTimeZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** A clínica deve receber o recall NESTA execução horária? */
export function shouldRunNow(cfg: RecallConfig, now: Date): boolean {
  if (!cfg.enabled) return false
  return localHourInTimeZone(now, cfg.timeZone) === cfg.hour
}

/** Janela [hoje, hoje+dias] em datas locais da clínica. */
export function recallWindow(cfg: RecallConfig, now: Date): { from: string; to: string } {
  const from = localDateInTimeZone(now, cfg.timeZone)
  const to = localDateInTimeZone(new Date(now.getTime() + cfg.days * 864e5), cfg.timeZone)
  return { from, to }
}
