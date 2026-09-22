/** Unit — cálculo de horários livres do agendamento online (Fase 3). */
import {
  weekdayKey, toMin, fmtMin, businessDayWindow, buildGrid, rangeOverlaps, freeSlots,
  type BusinessHoursMap,
} from '@/lib/scheduling/slots'

const BH: BusinessHoursMap = {
  monday:    { open: '08:00', close: '12:00' },
  tuesday:   { open: '08:00', close: '18:00' },
  sunday:    null,
}

describe('helpers', () => {
  it('weekdayKey mapeia 0..6', () => {
    expect(weekdayKey(0)).toBe('sunday')
    expect(weekdayKey(1)).toBe('monday')
    expect(weekdayKey(6)).toBe('saturday')
  })
  it('toMin/fmtMin', () => {
    expect(toMin('08:30')).toBe(510)
    expect(fmtMin(510)).toBe('08:30')
  })
})

describe('businessDayWindow', () => {
  it('dia aberto', () => expect(businessDayWindow(BH, 1)).toEqual({ openMin: 480, closeMin: 720 }))
  it('dia fechado (null)', () => expect(businessDayWindow(BH, 0)).toBeNull())
  it('dia ausente no mapa → fechado', () => expect(businessDayWindow(BH, 3)).toBeNull())
  it('close <= open → inválido', () => expect(businessDayWindow({ monday: { open: '18:00', close: '08:00' } }, 1)).toBeNull())
})

describe('buildGrid', () => {
  it('slots de 60min em 08:00-12:00 → 4', () => {
    expect(buildGrid(480, 720, 60).map(fmtMin)).toEqual(['08:00', '09:00', '10:00', '11:00'])
  })
  it('slots de 30min', () => {
    expect(buildGrid(480, 600, 30).map(fmtMin)).toEqual(['08:00', '08:30', '09:00', '09:30'])
  })
  it('não gera slot que ultrapassa o fechamento', () => {
    expect(buildGrid(480, 510, 60)).toEqual([]) // 30min de janela, slot de 60 não cabe
  })
})

describe('rangeOverlaps', () => {
  const ranges = [{ start: '09:00', end: '10:00' }]
  it('sobreposição detectada', () => expect(rangeOverlaps(540, 600, ranges)).toBe(true))
  it('encostado (fim = início) não sobrepõe', () => expect(rangeOverlaps(600, 660, ranges)).toBe(false))
  it('antes não sobrepõe', () => expect(rangeOverlaps(480, 540, ranges)).toBe(false))
})

describe('freeSlots', () => {
  it('remove horário ocupado', () => {
    const booked = [{ start: '09:00', end: '10:00' }]
    expect(freeSlots(BH, 1, 60, booked)).toEqual(['08:00', '10:00', '11:00'])
  })
  it('dia fechado → nenhum slot', () => {
    expect(freeSlots(BH, 0, 60, [])).toEqual([])
  })
  it('minStartMin descarta horários passados (hoje)', () => {
    expect(freeSlots(BH, 1, 60, [], 600)).toEqual(['10:00', '11:00'])
  })
  it('sem ocupação → grade cheia', () => {
    expect(freeSlots(BH, 1, 60, [])).toEqual(['08:00', '09:00', '10:00', '11:00'])
  })
})
