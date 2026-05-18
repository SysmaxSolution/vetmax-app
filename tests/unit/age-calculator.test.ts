/**
 * Unit — calculateAge (módulo Pet) — casos novos complementando patients.test.ts
 *
 * NOTA TIMEZONE: usamos strings ISO com "T12:00:00" para evitar problemas de fuso
 * (datas-só "YYYY-MM-DD" são parseadas em UTC e podem retroceder 1 dia em fusos < UTC).
 *
 * TC-AGE-001..025 → recém-nascido, anos bissextos, futuros, idades altas, DST.
 */

// ─── Função copiada de patients.test.ts (mesma fonte: PatientFullModal.tsx) ──

function calculateAge(birthDate: string | Date, referenceDate?: Date): string {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate
  const ref = referenceDate ?? new Date()

  let years = ref.getFullYear() - birth.getFullYear()
  let months = ref.getMonth() - birth.getMonth()
  let days = ref.getDate() - birth.getDate()

  if (days < 0) {
    months -= 1
    const prevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years >= 1) {
    return months > 0
      ? `${years} ano${years > 1 ? 's' : ''} e ${months} ${months > 1 ? 'meses' : 'mês'}`
      : `${years} ano${years > 1 ? 's' : ''}`
  }
  if (months >= 1) {
    return days > 0
      ? `${months} ${months > 1 ? 'meses' : 'mês'} e ${days} dia${days > 1 ? 's' : ''}`
      : `${months} ${months > 1 ? 'meses' : 'mês'}`
  }
  return `${days} dia${days !== 1 ? 's' : ''}`
}

const REF = new Date('2026-05-16T12:00:00')

// ─── TC-AGE-001..006: recém-nascido ─────────────────────────────────────────

describe('calculateAge — recém-nascido', () => {
  test('TC-AGE-001 → nascido hoje → "0 dias"', () => {
    expect(calculateAge('2026-05-16T12:00:00', REF)).toBe('0 dias')
  })

  test('TC-AGE-002 → 1 dia atrás → "1 dia" (singular)', () => {
    expect(calculateAge('2026-05-15T12:00:00', REF)).toBe('1 dia')
  })

  test('TC-AGE-003 → 1 semana atrás → "7 dias"', () => {
    expect(calculateAge('2026-05-09T12:00:00', REF)).toBe('7 dias')
  })

  test('TC-AGE-004 → 1 mês atrás exato → "1 mês"', () => {
    expect(calculateAge('2026-04-16T12:00:00', REF)).toBe('1 mês')
  })

  test('TC-AGE-005 → 15 dias atrás → "15 dias"', () => {
    expect(calculateAge('2026-05-01T12:00:00', REF)).toBe('15 dias')
  })

  test('TC-AGE-006 → 2 meses e 5 dias atrás → "2 meses e 5 dias"', () => {
    expect(calculateAge('2026-03-11T12:00:00', REF)).toBe('2 meses e 5 dias')
  })
})

// ─── TC-AGE-007..012: anos completos ────────────────────────────────────────

describe('calculateAge — anos completos', () => {
  test('TC-AGE-007 → 1 ano exato (aniversário hoje) → "1 ano" singular', () => {
    expect(calculateAge('2025-05-16T12:00:00', REF)).toBe('1 ano')
  })

  test('TC-AGE-008 → 1 ano e 11 meses → "1 ano e 11 meses"', () => {
    expect(calculateAge('2024-06-16T12:00:00', REF)).toBe('1 ano e 11 meses')
  })

  test('TC-AGE-009 → 2 anos exatos → "2 anos"', () => {
    expect(calculateAge('2024-05-16T12:00:00', REF)).toBe('2 anos')
  })

  test('TC-AGE-010 → 5 anos e 1 mês → "5 anos e 1 mês" singular do mês', () => {
    expect(calculateAge('2021-04-16T12:00:00', REF)).toBe('5 anos e 1 mês')
  })

  test('TC-AGE-011 → 20 anos (idade alta) → "20 anos"', () => {
    expect(calculateAge('2006-05-16T12:00:00', REF)).toBe('20 anos')
  })

  test('TC-AGE-012 → 25 anos e 3 meses (geriátrico) → "25 anos e 3 meses"', () => {
    expect(calculateAge('2001-02-16T12:00:00', REF)).toBe('25 anos e 3 meses')
  })
})

// ─── TC-AGE-013..018: ano bissexto ──────────────────────────────────────────

describe('calculateAge — ano bissexto', () => {
  test('TC-AGE-013 → nascido 29/02/2024 (bissexto), ref 01/03/2024 → "1 dia"', () => {
    const ref = new Date('2024-03-01T12:00:00')
    expect(calculateAge('2024-02-29T12:00:00', ref)).toBe('1 dia')
  })

  test('TC-AGE-014 → nascido 29/02/2024, ref 28/02/2025 → "11 meses e 30 dias" (algoritmo soma dia do mês anterior)', () => {
    const ref = new Date('2025-02-28T12:00:00')
    expect(calculateAge('2024-02-29T12:00:00', ref)).toBe('11 meses e 30 dias')
  })

  test('TC-AGE-015 → nascido 29/02/2024, ref 01/03/2025 → "1 ano"', () => {
    const ref = new Date('2025-03-01T12:00:00')
    expect(calculateAge('2024-02-29T12:00:00', ref)).toBe('1 ano')
  })

  test('TC-AGE-016 → fevereiro normal não bissexto (28 dias) — 28/02 → 01/03 = 1 dia', () => {
    const ref = new Date('2026-03-01T12:00:00')
    expect(calculateAge('2026-02-28T12:00:00', ref)).toBe('1 dia')
  })

  test('TC-AGE-017 → ano bissexto vs comum não quebra cálculo', () => {
    const ref = new Date('2028-02-29T12:00:00') // 2028 bissexto
    const result = calculateAge('2027-02-28T12:00:00', ref)
    expect(result).toMatch(/1 ano/)
  })

  test('TC-AGE-018 → atravessando bissexto múltiplo (2024-2028) → "4 anos"', () => {
    const ref = new Date('2028-05-16T12:00:00')
    expect(calculateAge('2024-05-16T12:00:00', ref)).toBe('4 anos')
  })
})

// ─── TC-AGE-019..025: edge cases ────────────────────────────────────────────

describe('calculateAge — edge cases', () => {
  test('TC-AGE-019 → birth date como Date object (não string)', () => {
    const birth = new Date('2024-05-16T12:00:00')
    expect(calculateAge(birth, REF)).toBe('2 anos')
  })

  test('TC-AGE-020 → sem referenceDate (usa Date.now)', () => {
    const result = calculateAge('2020-01-01T12:00:00')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('TC-AGE-021 → birth no futuro (3 dias) — algoritmo não valida, retorna string sem crash', () => {
    const result = calculateAge('2026-05-19T12:00:00', REF)
    expect(typeof result).toBe('string')
  })

  test('TC-AGE-022 → midnight UTC vs midnight local — usar T12:00:00 evita diff', () => {
    const ref = new Date('2026-05-16T12:00:00')
    expect(calculateAge('2025-05-16T12:00:00', ref)).toBe('1 ano')
  })

  test('TC-AGE-023 → virada de mês com days negativo é corrigida → 2 dias', () => {
    const ref = new Date('2026-05-02T12:00:00')
    expect(calculateAge('2026-04-30T12:00:00', ref)).toBe('2 dias')
  })

  test('TC-AGE-024 → nascido 31/jan, ref 01/mar — retorna string sem crashar', () => {
    const ref = new Date('2026-03-01T12:00:00')
    const result = calculateAge('2026-01-31T12:00:00', ref)
    expect(typeof result).toBe('string')
    expect(result).toMatch(/mês|meses|dias/)
  })

  test('TC-AGE-025 → singulars vs plurais dos dias (1 dia vs 2 dias)', () => {
    expect(calculateAge('2026-05-15T12:00:00', REF)).toBe('1 dia')
    expect(calculateAge('2026-05-14T12:00:00', REF)).toBe('2 dias')
  })
})
