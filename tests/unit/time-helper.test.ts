/**
 * Unit — helper de fuso horário da clínica (lib/time).
 *
 * Garante que TODA renderização de data/hora respeita um timezone explícito,
 * evitando o bug clássico: Node em UTC no Vercel renderizando "às 20:36" para
 * o mesmo instante que o browser em America/Sao_Paulo mostra como "17:36".
 */

import { formatClinicTime, formatClinicDate, formatClinicDateTime, formatClinicShort, DEFAULT_CLINIC_TZ } from '@/lib/time'

// Instante de referência: 2026-05-29T20:36:00.000Z (UTC).
// Em America/Sao_Paulo (UTC-3), equivale a 17:36 do MESMO dia.
const ISO_UTC = '2026-05-29T20:36:00.000Z'

describe('time helpers — timezone consistente da clínica', () => {
  test('TC-TIME-001 → formatClinicTime renderiza no horário local da clínica (não UTC)', () => {
    expect(formatClinicTime(ISO_UTC)).toBe('17:36')
  })

  test('TC-TIME-002 → formatClinicDate respeita o dia local mesmo perto da virada UTC', () => {
    // 2026-05-30T01:30Z = 22:30 do dia 29 em São Paulo.
    expect(formatClinicDate('2026-05-30T01:30:00.000Z')).toBe('29/05/2026')
  })

  test('TC-TIME-003 → formatClinicDateTime combina data+hora locais', () => {
    expect(formatClinicDateTime(ISO_UTC)).toContain('29/05/2026')
    expect(formatClinicDateTime(ISO_UTC)).toContain('17:36')
  })

  test('TC-TIME-004 → formatClinicShort compacto (DD/MM HH:MM)', () => {
    expect(formatClinicShort(ISO_UTC)).toContain('29/05')
    expect(formatClinicShort(ISO_UTC)).toContain('17:36')
  })

  test('TC-TIME-005 → default tz é America/Sao_Paulo', () => {
    expect(DEFAULT_CLINIC_TZ).toBe('America/Sao_Paulo')
  })

  test('TC-TIME-006 → tz custom (UTC) gera horário em UTC', () => {
    expect(formatClinicTime(ISO_UTC, 'UTC')).toBe('20:36')
  })

  test('TC-TIME-007 → aceita Date object e string', () => {
    expect(formatClinicTime(new Date(ISO_UTC))).toBe('17:36')
    expect(formatClinicTime(ISO_UTC)).toBe('17:36')
  })
})
