import { describe, it, expect } from '@jest/globals'
import {
  parseRecallConfig, shouldRunNow, recallWindow, localHourInTimeZone, localDateInTimeZone,
  DEFAULT_RECALL_HOUR, DEFAULT_RECALL_DAYS, DEFAULT_RECALL_TZ,
} from '@/lib/vaccines/recall-schedule'

describe('parseRecallConfig', () => {
  it('padrão é DESLIGADO com 09:00 / 7 dias / America/Sao_Paulo', () => {
    expect(parseRecallConfig(null)).toEqual({
      enabled: false, hour: DEFAULT_RECALL_HOUR, days: DEFAULT_RECALL_DAYS, timeZone: DEFAULT_RECALL_TZ,
    })
  })
  it('só liga com booleano true estrito', () => {
    expect(parseRecallConfig({ vaccine_recall_enabled: 'true' }).enabled).toBe(false)
    expect(parseRecallConfig({ vaccine_recall_enabled: 1 }).enabled).toBe(false)
    expect(parseRecallConfig({ vaccine_recall_enabled: true }).enabled).toBe(true)
  })
  it('portal_enabled sozinho NÃO liga o recall', () => {
    expect(parseRecallConfig({ portal_enabled: true }).enabled).toBe(false)
  })
  it('saneia hora e antecedência fora de faixa', () => {
    expect(parseRecallConfig({ vaccine_recall_hour: 31 }).hour).toBe(DEFAULT_RECALL_HOUR)
    expect(parseRecallConfig({ vaccine_recall_hour: -2 }).hour).toBe(DEFAULT_RECALL_HOUR)
    expect(parseRecallConfig({ vaccine_recall_hour: 6.5 }).hour).toBe(DEFAULT_RECALL_HOUR)
    expect(parseRecallConfig({ vaccine_recall_hour: 0 }).hour).toBe(0)
    expect(parseRecallConfig({ vaccine_recall_days: 0 }).days).toBe(DEFAULT_RECALL_DAYS)
    expect(parseRecallConfig({ vaccine_recall_days: 120 }).days).toBe(DEFAULT_RECALL_DAYS)
    expect(parseRecallConfig({ vaccine_recall_days: 15 }).days).toBe(15)
  })
})

describe('localHourInTimeZone', () => {
  it('converte UTC para a hora local de São Paulo (GMT-3)', () => {
    expect(localHourInTimeZone(new Date('2026-09-24T12:00:00Z'), 'America/Sao_Paulo')).toBe(9)
    expect(localHourInTimeZone(new Date('2026-09-24T02:00:00Z'), 'America/Sao_Paulo')).toBe(23)
  })
  it('respeita outro fuso (Manaus, GMT-4)', () => {
    expect(localHourInTimeZone(new Date('2026-09-24T13:00:00Z'), 'America/Manaus')).toBe(9)
  })
  it('cai no UTC se o fuso for inválido, sem lançar', () => {
    expect(localHourInTimeZone(new Date('2026-09-24T12:00:00Z'), 'Nao/Existe')).toBe(12)
  })
})

describe('shouldRunNow', () => {
  const cfg = (o: Partial<ReturnType<typeof parseRecallConfig>> = {}) =>
    ({ enabled: true, hour: 9, days: 7, timeZone: 'America/Sao_Paulo', ...o })

  it('desligado nunca roda, mesmo na hora certa', () => {
    expect(shouldRunNow(cfg({ enabled: false }), new Date('2026-09-24T12:00:00Z'))).toBe(false)
  })
  it('roda na hora local configurada', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-24T12:00:00Z'))).toBe(true)   // 09h em SP
    expect(shouldRunNow(cfg(), new Date('2026-09-24T12:59:00Z'))).toBe(true)
  })
  it('NÃO roda antes da hora configurada', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-24T11:00:00Z'))).toBe(false)  // 08h em SP
    expect(shouldRunNow(cfg({ hour: 18 }), new Date('2026-09-24T12:00:00Z'))).toBe(false)
  })
  it('não redispara no mesmo dia depois de já ter rodado', () => {
    // 13:00Z = 10h em SP; já rodou hoje (2026-09-24 local)
    expect(shouldRunNow(cfg(), new Date('2026-09-24T13:00:00Z'), '2026-09-24')).toBe(false)
  })
  it('volta a rodar no dia seguinte', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-25T13:00:00Z'), '2026-09-24')).toBe(true)
  })
  it('num cron DIÁRIO tardio ainda atende a clínica no mesmo dia', () => {
    // clínica pediu 08:00; o cron só rodou às 09h locais — atende, não perde o dia
    expect(shouldRunNow(cfg({ hour: 8 }), new Date('2026-09-24T12:00:00Z'), null)).toBe(true)
  })
  it('fuso diferente muda quem já alcançou a hora', () => {
    const t = new Date('2026-09-24T12:00:00Z') // 09h em SP, 08h em Manaus
    expect(shouldRunNow(cfg({ hour: 9, timeZone: 'America/Sao_Paulo' }), t)).toBe(true)
    expect(shouldRunNow(cfg({ hour: 9, timeZone: 'America/Manaus' }), t)).toBe(false)
  })
})

describe('recallWindow', () => {
  it('abre a janela na data local e fecha em +dias', () => {
    const w = recallWindow(
      { enabled: true, hour: 9, days: 7, timeZone: 'America/Sao_Paulo' },
      new Date('2026-09-24T12:00:00Z'),
    )
    expect(w).toEqual({ from: '2026-09-24', to: '2026-10-01' })
  })
  it('a antecedência configurada é respeitada', () => {
    const w = recallWindow(
      { enabled: true, hour: 9, days: 30, timeZone: 'America/Sao_Paulo' },
      new Date('2026-09-24T12:00:00Z'),
    )
    expect(w.to).toBe('2026-10-24')
  })
  it('a data local vira antes da UTC no fim do dia em SP', () => {
    expect(localDateInTimeZone(new Date('2026-09-25T02:00:00Z'), 'America/Sao_Paulo')).toBe('2026-09-24')
  })
})
