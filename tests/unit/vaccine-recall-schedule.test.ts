import { describe, it, expect } from '@jest/globals'
import {
  parseRecallConfig, shouldRunNow, recallWindow, localHourInTimeZone, localDateInTimeZone, cronModeFromEnv,
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

describe('shouldRunNow — modo horário (produção)', () => {
  const cfg = (o: Partial<ReturnType<typeof parseRecallConfig>> = {}) =>
    ({ enabled: true, hour: 9, days: 7, timeZone: 'America/Sao_Paulo', ...o })

  it('desligado nunca roda, mesmo na hora certa', () => {
    expect(shouldRunNow(cfg({ enabled: false }), new Date('2026-09-24T12:00:00Z'), null, 'hourly')).toBe(false)
  })
  it('roda na hora local configurada', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-24T12:00:00Z'), null, 'hourly')).toBe(true)   // 09h em SP
    expect(shouldRunNow(cfg(), new Date('2026-09-24T12:59:00Z'), null, 'hourly')).toBe(true)
  })
  it('NÃO roda antes da hora configurada', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-24T11:00:00Z'), null, 'hourly')).toBe(false)  // 08h em SP
    expect(shouldRunNow(cfg({ hour: 18 }), new Date('2026-09-24T12:00:00Z'), null, 'hourly')).toBe(false)
  })
  it('não redispara no mesmo dia depois de já ter rodado', () => {
    // 13:00Z = 10h em SP; já rodou hoje (2026-09-24 local)
    expect(shouldRunNow(cfg(), new Date('2026-09-24T13:00:00Z'), '2026-09-24', 'hourly')).toBe(false)
  })
  it('volta a rodar no dia seguinte', () => {
    expect(shouldRunNow(cfg(), new Date('2026-09-25T13:00:00Z'), '2026-09-24', 'hourly')).toBe(true)
  })
  it('num cron DIÁRIO tardio ainda atende a clínica no mesmo dia', () => {
    // clínica pediu 08:00; o cron só rodou às 09h locais — atende, não perde o dia
    expect(shouldRunNow(cfg({ hour: 8 }), new Date('2026-09-24T12:00:00Z'), null, 'hourly')).toBe(true)
  })
  it('fuso diferente muda quem já alcançou a hora', () => {
    const t = new Date('2026-09-24T12:00:00Z') // 09h em SP, 08h em Manaus
    expect(shouldRunNow(cfg({ hour: 9, timeZone: 'America/Sao_Paulo' }), t, null, 'hourly')).toBe(true)
    expect(shouldRunNow(cfg({ hour: 9, timeZone: 'America/Manaus' }), t, null, 'hourly')).toBe(false)
  })
})

describe('cronModeFromEnv', () => {
  it('padrão é diário (conta Hobby do ambiente de testes)', () => {
    expect(cronModeFromEnv({})).toBe('daily')
    expect(cronModeFromEnv({ VACCINE_RECALL_CRON_HOURLY: '0' })).toBe('daily')
  })
  it('só o valor "1" liga o modo horário', () => {
    expect(cronModeFromEnv({ VACCINE_RECALL_CRON_HOURLY: '1' })).toBe('hourly')
    expect(cronModeFromEnv({ VACCINE_RECALL_CRON_HOURLY: 'true' })).toBe('daily')
  })
})

describe('shouldRunNow — modo diário (cron uma vez por dia)', () => {
  const cfg = { enabled: true, hour: 18, days: 7, timeZone: 'America/Sao_Paulo' }
  it('atende a clínica mesmo com hora configurada depois do cron', () => {
    // cron diário as 09h locais; clínica pediu 18h — no modo horário ficaria sem recall
    expect(shouldRunNow(cfg, new Date('2026-09-24T12:00:00Z'), null, 'daily')).toBe(true)
    expect(shouldRunNow(cfg, new Date('2026-09-24T12:00:00Z'), null, 'hourly')).toBe(false)
  })
  it('continua respeitando a trava de uma vez por dia', () => {
    expect(shouldRunNow(cfg, new Date('2026-09-24T12:00:00Z'), '2026-09-24', 'daily')).toBe(false)
  })
  it('desligado continua sem rodar', () => {
    expect(shouldRunNow({ ...cfg, enabled: false }, new Date('2026-09-24T12:00:00Z'), null, 'daily')).toBe(false)
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
