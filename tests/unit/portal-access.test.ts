/**
 * Unit — Isolamento do Portal do Tutor (Fase 3). O teste crítico do council:
 * um CPF que é tutor em DUAS clínicas não pode ver pets da outra clínica nem de
 * outro tutor. Se isto falhar, o portal inteiro é inseguro.
 */
import {
  normalizeCpf, normalizePhone, allowedTutorIds, allowedClinicIds,
  canAccessPatient, filterAccessiblePatients, checkLoginToken, isSessionValid,
  computeExpiryISO, type LinkRow,
} from '@/lib/portal/access'

describe('normalização', () => {
  it('cpf só dígitos', () => expect(normalizeCpf('123.456.789-09')).toBe('12345678909'))
  it('cpf nulo → vazio', () => expect(normalizeCpf(null)).toBe(''))
  it('phone só dígitos', () => expect(normalizePhone('+55 (16) 99999-0000')).toBe('5516999990000'))
})

describe('isolamento por (tutor_id, clinic_id)', () => {
  // A mesma pessoa é tutora em 2 clínicas: tutor TA na clínica C1, tutor TB na clínica C2.
  const links: LinkRow[] = [
    { tutor_id: 'TA', clinic_id: 'C1' },
    { tutor_id: 'TB', clinic_id: 'C2' },
  ]

  it('vê pet do seu tutor na clínica certa', () => {
    expect(canAccessPatient('TA', 'C1', links)).toBe(true)
    expect(canAccessPatient('TB', 'C2', links)).toBe(true)
  })
  it('NÃO vê pet do seu tutor com clínica trocada (cross-tenant)', () => {
    expect(canAccessPatient('TA', 'C2', links)).toBe(false)
    expect(canAccessPatient('TB', 'C1', links)).toBe(false)
  })
  it('NÃO vê pet de OUTRO tutor na mesma clínica', () => {
    expect(canAccessPatient('TX', 'C1', links)).toBe(false)
  })
  it('NÃO vê pet de tutor/clínica totalmente alheios', () => {
    expect(canAccessPatient('TZ', 'C9', links)).toBe(false)
  })
  it('campos nulos → sem acesso', () => {
    expect(canAccessPatient(null, 'C1', links)).toBe(false)
    expect(canAccessPatient('TA', null, links)).toBe(false)
  })
  it('sem vínculos → nunca acessa', () => {
    expect(canAccessPatient('TA', 'C1', [])).toBe(false)
  })
})

describe('filterAccessiblePatients', () => {
  const links: LinkRow[] = [{ tutor_id: 'TA', clinic_id: 'C1' }]
  const pets = [
    { id: '1', tutor_id: 'TA', clinic_id: 'C1' }, // ok
    { id: '2', tutor_id: 'TA', clinic_id: 'C2' }, // clínica errada
    { id: '3', tutor_id: 'TX', clinic_id: 'C1' }, // tutor errado
  ]
  it('mantém só os acessíveis', () => {
    expect(filterAccessiblePatients(pets, links).map(p => p.id)).toEqual(['1'])
  })
  it('allowedTutorIds / allowedClinicIds deduplicam', () => {
    const l = [{ tutor_id: 'TA', clinic_id: 'C1' }, { tutor_id: 'TA', clinic_id: 'C1' }, { tutor_id: 'TB', clinic_id: 'C2' }]
    expect(allowedTutorIds(l).sort()).toEqual(['TA', 'TB'])
    expect(allowedClinicIds(l).sort()).toEqual(['C1', 'C2'])
  })
})

describe('token de login (uso único)', () => {
  const now = '2026-09-09T12:00:00.000Z'
  it('válido', () => expect(checkLoginToken({ expires_at: '2026-09-09T12:10:00Z', consumed_at: null }, now)).toEqual({ ok: true }))
  it('consumido bloqueia', () => expect(checkLoginToken({ expires_at: '2026-09-09T12:10:00Z', consumed_at: '2026-09-09T12:01:00Z' }, now)).toEqual({ ok: false, reason: 'consumed' }))
  it('expirado bloqueia', () => expect(checkLoginToken({ expires_at: '2026-09-09T11:59:00Z', consumed_at: null }, now)).toEqual({ ok: false, reason: 'expired' }))
  it('consumo tem prioridade sobre expiração', () => expect(checkLoginToken({ expires_at: '2026-09-09T11:00:00Z', consumed_at: '2026-09-09T10:00:00Z' }, now).reason).toBe('consumed'))
})

describe('sessão', () => {
  const now = '2026-09-09T12:00:00.000Z'
  it('válida', () => expect(isSessionValid({ expires_at: '2026-10-09T12:00:00Z', revoked_at: null }, now)).toBe(true))
  it('revogada', () => expect(isSessionValid({ expires_at: '2026-10-09T12:00:00Z', revoked_at: '2026-09-08T00:00:00Z' }, now)).toBe(false))
  it('expirada', () => expect(isSessionValid({ expires_at: '2026-09-08T12:00:00Z', revoked_at: null }, now)).toBe(false))
  it('computeExpiryISO soma ms', () => expect(computeExpiryISO('2026-09-09T00:00:00.000Z', 60000)).toBe('2026-09-09T00:01:00.000Z'))
})
