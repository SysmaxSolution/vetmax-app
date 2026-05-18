/**
 * Unit — generateBatchScheduleDates
 * Gera N datas a partir de uma data inicial com intervalo fixo em dias.
 */

import { generateBatchScheduleDates } from '@/lib/packages-utils'

describe('TC-PKG-001 → count 1 retorna apenas a startDate', () => {
  test('1 ocorrência → 1 data igual ao start', () => {
    const start = new Date('2026-01-01T10:00:00Z')
    const result = generateBatchScheduleDates(start, 7, 1)
    expect(result).toHaveLength(1)
    expect(result[0].getTime()).toBe(start.getTime())
  })
})

describe('TC-PKG-002 → count 0 retorna array vazio', () => {
  test('0 ocorrências → []', () => {
    const start = new Date('2026-01-01')
    expect(generateBatchScheduleDates(start, 7, 0)).toEqual([])
  })
})

describe('TC-PKG-003 → intervalo de 1 dia (count 5)', () => {
  test('Datas consecutivas dia a dia', () => {
    const start = new Date('2026-03-10T00:00:00')
    const result = generateBatchScheduleDates(start, 1, 5)
    expect(result).toHaveLength(5)
    expect(result[1].getDate()).toBe(11)
    expect(result[4].getDate()).toBe(14)
  })
})

describe('TC-PKG-004 → intervalo de 7 dias (count 4)', () => {
  test('Datas semanais', () => {
    const start = new Date('2026-01-01T12:00:00')
    const result = generateBatchScheduleDates(start, 7, 4)
    expect(result).toHaveLength(4)
    expect(result[1].getDate()).toBe(8)
    expect(result[2].getDate()).toBe(15)
    expect(result[3].getDate()).toBe(22)
  })
})

describe('TC-PKG-005 → intervalo de 30 dias (count 3)', () => {
  test('Datas mensais aproximadas', () => {
    const start = new Date('2026-01-15T08:00:00')
    const result = generateBatchScheduleDates(start, 30, 3)
    expect(result).toHaveLength(3)
    // 2026-01-15 + 30d = 2026-02-14
    expect(result[1].getMonth()).toBe(1)
    expect(result[1].getDate()).toBe(14)
  })
})

describe('TC-PKG-006 → count 10 retorna 10 datas', () => {
  test('10 ocorrências geradas corretamente', () => {
    const start = new Date('2026-06-01T00:00:00')
    const result = generateBatchScheduleDates(start, 2, 10)
    expect(result).toHaveLength(10)
  })
})

describe('TC-PKG-007 → virada de mês (Jan 30 + 5 dias → Fev)', () => {
  test('30 de janeiro + intervalo 5d cruza para fevereiro', () => {
    const start = new Date('2026-01-30T00:00:00')
    const result = generateBatchScheduleDates(start, 5, 2)
    expect(result[1].getMonth()).toBe(1) // fevereiro
    expect(result[1].getDate()).toBe(4)
  })
})

describe('TC-PKG-008 → virada de ano (Dez 30 + 5 dias → Jan)', () => {
  test('30 de dezembro + 5d entra no próximo ano', () => {
    const start = new Date('2026-12-30T00:00:00')
    const result = generateBatchScheduleDates(start, 5, 2)
    expect(result[1].getFullYear()).toBe(2027)
    expect(result[1].getMonth()).toBe(0) // janeiro
    expect(result[1].getDate()).toBe(4)
  })
})

describe('TC-PKG-009 → ano bissexto (29 fev existe em 2024)', () => {
  test('27 fev 2024 + 2d = 29 fev 2024 (bissexto)', () => {
    const start = new Date('2024-02-27T00:00:00')
    const result = generateBatchScheduleDates(start, 2, 2)
    expect(result[1].getMonth()).toBe(1)
    expect(result[1].getDate()).toBe(29)
  })
})

describe('TC-PKG-010 → ano não-bissexto (29 fev não existe em 2026)', () => {
  test('27 fev 2026 + 2d = 1 mar 2026 (não-bissexto)', () => {
    const start = new Date('2026-02-27T00:00:00')
    const result = generateBatchScheduleDates(start, 2, 2)
    expect(result[1].getMonth()).toBe(2)
    expect(result[1].getDate()).toBe(1)
  })
})

describe('TC-PKG-011 → mantém startDate intacta (não muta)', () => {
  test('startDate original não é modificada', () => {
    const start = new Date('2026-05-01T00:00:00')
    const originalTime = start.getTime()
    generateBatchScheduleDates(start, 7, 5)
    expect(start.getTime()).toBe(originalTime)
  })
})

describe('TC-PKG-012 → DST safe (intervalo em dias, não horas)', () => {
  test('Datas em torno do horário de verão mantêm o dia correto', () => {
    // No Brasil DST foi extinto em 2019, mas mantemos teste de fronteira.
    const start = new Date('2024-10-19T22:00:00Z')
    const result = generateBatchScheduleDates(start, 1, 3)
    expect(result).toHaveLength(3)
    // Diferença de cada item para o anterior deve ser ~24h
    expect(result[1].getTime() - result[0].getTime()).toBeGreaterThanOrEqual(23 * 3600 * 1000)
    expect(result[1].getTime() - result[0].getTime()).toBeLessThanOrEqual(25 * 3600 * 1000)
  })
})

describe('TC-PKG-013 → intervalo grande (60 dias)', () => {
  test('60 dias entre cada data', () => {
    const start = new Date('2026-01-01T00:00:00')
    const result = generateBatchScheduleDates(start, 60, 3)
    expect(result[1].getMonth()).toBe(2) // março
    expect(result[2].getMonth()).toBe(4) // maio
  })
})

describe('TC-PKG-014 → datas retornadas são instâncias Date', () => {
  test('Cada item é Date', () => {
    const result = generateBatchScheduleDates(new Date(), 7, 3)
    for (const d of result) {
      expect(d).toBeInstanceOf(Date)
    }
  })
})

describe('TC-PKG-015 → primeiro item sempre igual a startDate', () => {
  test('result[0] === startDate (mesmo timestamp)', () => {
    const start = new Date('2026-07-15T15:30:00')
    const result = generateBatchScheduleDates(start, 14, 5)
    expect(result[0].getTime()).toBe(start.getTime())
  })
})
