/**
 * Unit — Scheduling Business Hours
 * Lógica de cálculo de weekday/minutes/conflict copiada de
 * src/lib/actions/scheduling-validation.ts (módulo server-only).
 *
 * TC-SCH-001..030 → cobrem weekday calculation, minutes math, conflitos, edge cases.
 */

// ─── Helpers puros (espelham a lógica do server action) ──────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

interface WeekdayInfo {
  isoWeekday: number       // 0=Sun..6=Sat (JS Date.getDay)
  normalizedWeekday: number // 1=Mon..7=Sun (ISO 8601)
  dayName: string
  valid: boolean
}

function computeWeekday(date: string, time: string): WeekdayInfo {
  const dt = new Date(`${date}T${time}:00`)
  if (isNaN(dt.getTime())) {
    return { isoWeekday: NaN, normalizedWeekday: NaN, dayName: '', valid: false }
  }
  const isoWeekday = dt.getDay()
  const normalizedWeekday = isoWeekday === 0 ? 7 : isoWeekday
  return {
    isoWeekday,
    normalizedWeekday,
    dayName: DAY_NAMES[isoWeekday],
    valid: true,
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return NaN
  return h * 60 + m
}

function hasConflict(
  reqTime: string,
  durationMin: number,
  openTime: string,
  closeTime: string,
): boolean {
  const reqMin   = timeToMinutes(reqTime)
  const endMin   = reqMin + durationMin
  const openMin  = timeToMinutes(openTime)
  const closeMin = timeToMinutes(closeTime)
  return reqMin < openMin || endMin > closeMin
}

// ─── TC-SCH-001..010: Weekday calculation ────────────────────────────────────

describe('scheduling — weekday calculation', () => {
  test('TC-SCH-001 → 2026-05-16 é sábado (getDay=6)', () => {
    const w = computeWeekday('2026-05-16', '10:00')
    expect(w.isoWeekday).toBe(6)
    expect(w.dayName).toBe('saturday')
  })

  test('TC-SCH-002 → 2026-05-17 é domingo (getDay=0, normalizedWeekday=7)', () => {
    const w = computeWeekday('2026-05-17', '10:00')
    expect(w.isoWeekday).toBe(0)
    expect(w.normalizedWeekday).toBe(7)
    expect(w.dayName).toBe('sunday')
  })

  test('TC-SCH-003 → 2026-05-18 é segunda (normalizedWeekday=1)', () => {
    const w = computeWeekday('2026-05-18', '10:00')
    expect(w.normalizedWeekday).toBe(1)
    expect(w.dayName).toBe('monday')
  })

  test('TC-SCH-004 → 2026-05-19 é terça', () => {
    const w = computeWeekday('2026-05-19', '10:00')
    expect(w.dayName).toBe('tuesday')
  })

  test('TC-SCH-005 → 2026-05-20 é quarta', () => {
    expect(computeWeekday('2026-05-20', '10:00').dayName).toBe('wednesday')
  })

  test('TC-SCH-006 → 2026-05-21 é quinta', () => {
    expect(computeWeekday('2026-05-21', '10:00').dayName).toBe('thursday')
  })

  test('TC-SCH-007 → 2026-05-22 é sexta', () => {
    expect(computeWeekday('2026-05-22', '10:00').dayName).toBe('friday')
  })

  test('TC-SCH-008 → data inválida "2026-13-99T25:99:00" → valid false', () => {
    const w = computeWeekday('2026-13-99', '25:99')
    expect(w.valid).toBe(false)
  })

  test('TC-SCH-009 → "abc-def" data malformada → invalid', () => {
    const w = computeWeekday('abc-def-gh', '10:00')
    expect(w.valid).toBe(false)
  })

  test('TC-SCH-010 → DAY_NAMES tem 7 elementos na ordem JS getDay', () => {
    expect(DAY_NAMES).toHaveLength(7)
    expect(DAY_NAMES[0]).toBe('sunday')
    expect(DAY_NAMES[6]).toBe('saturday')
  })
})

// ─── TC-SCH-011..020: Minutes math ───────────────────────────────────────────

describe('scheduling — timeToMinutes & math', () => {
  test('TC-SCH-011 → 08:30 → 510 minutos', () => {
    expect(timeToMinutes('08:30')).toBe(510)
  })

  test('TC-SCH-012 → 00:00 → 0', () => {
    expect(timeToMinutes('00:00')).toBe(0)
  })

  test('TC-SCH-013 → 23:59 → 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  test('TC-SCH-014 → 09:00 + 90min de duration → 10:30 (630 min)', () => {
    expect(timeToMinutes('09:00') + 90).toBe(timeToMinutes('10:30'))
  })

  test('TC-SCH-015 → 14:15 + 45min → 15:00', () => {
    expect(timeToMinutes('14:15') + 45).toBe(timeToMinutes('15:00'))
  })

  test('TC-SCH-016 → 12:00 - 12:00 = 0 (mesma hora)', () => {
    expect(timeToMinutes('12:00') - timeToMinutes('12:00')).toBe(0)
  })

  test('TC-SCH-017 → "abc" → NaN (input inválido)', () => {
    expect(Number.isNaN(timeToMinutes('abc'))).toBe(true)
  })

  test('TC-SCH-018 → "24:00" virada de dia → 1440 min (matematicamente válido)', () => {
    expect(timeToMinutes('24:00')).toBe(1440)
  })

  test('TC-SCH-019 → "10" sem minutos → NaN', () => {
    expect(Number.isNaN(timeToMinutes('10'))).toBe(true)
  })

  test('TC-SCH-020 → "10:" → 600 (parse aceita "" como 0)', () => {
    // '10:'.split(':') → ['10',''] → Number('') = 0 → 10*60+0 = 600
    expect(timeToMinutes('10:')).toBe(600)
  })
})

// ─── TC-SCH-021..030: hasConflict (faixa de business hours) ─────────────────

describe('scheduling — hasConflict', () => {
  test('TC-SCH-021 → 09:00 com 60min dentro de 08:00-18:00 → sem conflito', () => {
    expect(hasConflict('09:00', 60, '08:00', '18:00')).toBe(false)
  })

  test('TC-SCH-022 → 07:30 (antes de abrir 08:00) → conflito', () => {
    expect(hasConflict('07:30', 30, '08:00', '18:00')).toBe(true)
  })

  test('TC-SCH-023 → 17:30 com 60min termina 18:30 (depois fechar 18:00) → conflito', () => {
    expect(hasConflict('17:30', 60, '08:00', '18:00')).toBe(true)
  })

  test('TC-SCH-024 → start exato 08:00 OK', () => {
    expect(hasConflict('08:00', 30, '08:00', '18:00')).toBe(false)
  })

  test('TC-SCH-025 → end exato 18:00 OK (não exceder)', () => {
    expect(hasConflict('17:30', 30, '08:00', '18:00')).toBe(false)
  })

  test('TC-SCH-026 → reqMin < openMin → conflito', () => {
    expect(hasConflict('06:00', 60, '08:00', '18:00')).toBe(true)
  })

  test('TC-SCH-027 → endMin > closeMin → conflito', () => {
    expect(hasConflict('17:00', 120, '08:00', '18:00')).toBe(true)
  })

  test('TC-SCH-028 → consulta noturna 19:00-22:00 (horário fora) → conflito', () => {
    expect(hasConflict('19:00', 60, '08:00', '18:00')).toBe(true)
  })

  test('TC-SCH-029 → working_days array contém o weekday computado', () => {
    const w = computeWeekday('2026-05-18', '10:00') // segunda
    const workingDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    expect(workingDays).toContain(w.dayName)
  })

  test('TC-SCH-030 → sábado/domingo não está em working_days dias úteis', () => {
    const sat = computeWeekday('2026-05-16', '10:00')
    const sun = computeWeekday('2026-05-17', '10:00')
    const workingDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    expect(workingDays).not.toContain(sat.dayName)
    expect(workingDays).not.toContain(sun.dayName)
  })
})
