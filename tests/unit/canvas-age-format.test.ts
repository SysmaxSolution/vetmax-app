/**
 * Fase 1 — formatador de idade "9 A 3 M 30 D" (age_amd) e integração com a
 * tag pet.age (formatOverride) / pet.age_amd.
 */

import { ageParts, formatAgeAMD } from '@/lib/canva/age-format'
import { resolveTagValue } from '@/lib/canva/dynamic-tags'

const ref = new Date(2026, 8, 22) // 22/09/2026 (local)

describe('age-format', () => {
  it('calcula anos, meses e dias calendário', () => {
    expect(ageParts('2017-06-22', ref)).toEqual({ years: 9, months: 3, days: 0 })
    expect(formatAgeAMD('2017-05-23', ref)).toBe('9 A 3 M 30 D')
    expect(formatAgeAMD('2026-09-22', ref)).toBe('0 A 0 M 0 D')
  })

  it('empresta dias do mês anterior e meses do ano anterior', () => {
    // 31/01/2026 → 01/03/2026 = 1 M 1 D (fevereiro tem 28 dias)
    expect(formatAgeAMD('2026-01-31', new Date(2026, 2, 1))).toBe('0 A 1 M 1 D')
    // 15/11/2025 → 10/01/2026 = 1 M 26 D
    expect(formatAgeAMD('2025-11-15', new Date(2026, 0, 10))).toBe('0 A 1 M 26 D')
  })

  it('aceita Date, ISO com hora e YYYY-MM-DD (em horário local, sem drift de fuso)', () => {
    expect(formatAgeAMD(new Date(2020, 0, 1), ref)).toBe('6 A 8 M 21 D')
    expect(formatAgeAMD('2020-01-01T12:00:00Z', ref)).toBe('6 A 8 M 21 D')
    expect(formatAgeAMD('2020-01-01', ref)).toBe('6 A 8 M 21 D')
  })

  it('nascimento futuro → zero; inválido/ausente → vazio', () => {
    expect(formatAgeAMD('2030-01-01', ref)).toBe('0 A 0 M 0 D')
    expect(formatAgeAMD('não-é-data', ref)).toBe('')
    expect(formatAgeAMD(null, ref)).toBe('')
    expect(ageParts(undefined, ref)).toBeNull()
  })
})

describe('tag pet.age com formatOverride age_amd', () => {
  const ctx = {
    patient: { age: '9 anos', birth_date: '2017-05-23' },
    consultation: { date: '2026-09-22T12:00:00' },
  }

  it('padrão continua "9 anos"', () => {
    expect(resolveTagValue('pet.age', ctx)).toBe('9 anos')
  })

  it('override age_amd usa birth_date + data do documento como referência', () => {
    expect(resolveTagValue('pet.age', ctx, 'age_amd')).toBe('9 A 3 M 30 D')
    expect(resolveTagValue('pet.age_amd', ctx)).toBe('9 A 3 M 30 D')
  })

  it('sem birth_date → vazio (não cai no texto pré-formatado)', () => {
    expect(resolveTagValue('pet.age', { patient: { age: '9 anos' } }, 'age_amd')).toBe('')
  })
})
