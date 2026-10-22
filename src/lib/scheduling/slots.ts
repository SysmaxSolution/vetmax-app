// Cálculo PURO de horários livres para agendamento online (sem I/O).
// Gera a grade a partir do horário de funcionamento da clínica e remove os
// intervalos já ocupados (appointments + bloqueios). Testável isoladamente.

export type HHMM = string // 'HH:MM'
export interface Range { start: HHMM; end: HHMM }

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export type WeekdayKey = typeof WEEKDAY_KEYS[number]

export type BusinessHoursMap = Partial<Record<WeekdayKey, { open: string; close: string } | null>>

export function weekdayKey(dow: number): WeekdayKey {
  return WEEKDAY_KEYS[((dow % 7) + 7) % 7]
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fmtMin(total: number): HHMM {
  const h = Math.floor(total / 60), m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Janela de funcionamento (em minutos) para um dia da semana; null se fechado. */
export function businessDayWindow(
  bh: BusinessHoursMap | null | undefined,
  dow: number,
): { openMin: number; closeMin: number } | null {
  if (!bh) return null
  const entry = bh[weekdayKey(dow)]
  if (!entry || !entry.open || !entry.close) return null
  const openMin = toMin(entry.open), closeMin = toMin(entry.close)
  if (closeMin <= openMin) return null
  return { openMin, closeMin }
}

/** Gera os inícios de slot (em minutos) dentro da janela, cada um cabendo por inteiro. */
export function buildGrid(openMin: number, closeMin: number, intervalMinutes: number): number[] {
  const step = intervalMinutes > 0 ? intervalMinutes : 60
  const out: number[] = []
  for (let t = openMin; t + step <= closeMin; t += step) out.push(t)
  return out
}

/** [startMin, endMin) intersecta algum intervalo ocupado? */
export function rangeOverlaps(startMin: number, endMin: number, ranges: Range[]): boolean {
  for (const r of ranges) {
    const rs = toMin(r.start), re = toMin(r.end)
    if (startMin < re && rs < endMin) return true
  }
  return false
}

/**
 * Horários livres (HH:MM) para o dia: grade do funcionamento menos os ocupados.
 * `minStartMin` (opcional) descarta horários já passados (ex.: hoje).
 */
export function freeSlots(
  bh: BusinessHoursMap | null | undefined,
  dow: number,
  intervalMinutes: number,
  bookedRanges: Range[],
  minStartMin = 0,
): HHMM[] {
  const win = businessDayWindow(bh, dow)
  if (!win) return []
  const step = intervalMinutes > 0 ? intervalMinutes : 60
  return buildGrid(win.openMin, win.closeMin, step)
    .filter(t => t >= minStartMin)
    .filter(t => !rangeOverlaps(t, t + step, bookedRanges))
    .map(fmtMin)
}
