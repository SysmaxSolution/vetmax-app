/** Unit — código de acesso do tutor (login CPF + código). */
import {
  generateAccessCode, normalizeCode, hashCode, verifyCode, isLocked, onFail, CODE_LEN, MAX_FAILS,
} from '@/lib/portal/access-code'

describe('geração/normalização', () => {
  it('gera código com o tamanho e alfabeto seguro', () => {
    const c = generateAccessCode(Buffer.from([5, 10, 15, 20, 25, 30, 1, 2]))
    expect(c).toHaveLength(CODE_LEN)
    expect(/^[A-HJ-NP-Z2-9]+$/.test(c)).toBe(true) // sem I,O,0,1
  })
  it('normaliza entrada', () => {
    expect(normalizeCode(' ab-cd 12 ')).toBe('ABCD12')
    expect(normalizeCode(null)).toBe('')
  })
})

describe('hash/verify', () => {
  it('verifica o código correto e rejeita o errado', () => {
    const h = hashCode('ABCD2345')
    expect(verifyCode('ABCD2345', h)).toBe(true)
    expect(verifyCode('abcd2345', h)).toBe(true)   // case-insensitive via normalize
    expect(verifyCode('WRONG999', h)).toBe(false)
  })
  it('hash é aleatório (salt) e não guarda texto', () => {
    const a = hashCode('SAME1234'), b = hashCode('SAME1234')
    expect(a).not.toBe(b)
    expect(a).not.toContain('SAME1234')
    expect(verifyCode('SAME1234', a)).toBe(true)
  })
  it('stored inválido → false', () => {
    expect(verifyCode('X', null)).toBe(false)
    expect(verifyCode('X', 'semdoispontos')).toBe(false)
  })
})

describe('lockout', () => {
  const now = '2026-09-09T12:00:00.000Z'
  it('não travado sem lockedUntil', () => expect(isLocked(null, now)).toBe(false))
  it('travado no futuro', () => expect(isLocked('2026-09-09T12:10:00Z', now)).toBe(true))
  it('lock expirado', () => expect(isLocked('2026-09-09T11:50:00Z', now)).toBe(false))
  it('onFail incrementa até travar', () => {
    let s = { count: 0, lockedUntil: null as string | null }
    for (let i = 1; i < MAX_FAILS; i++) { s = onFail(s.count, now); expect(s.lockedUntil).toBeNull() }
    s = onFail(s.count, now)  // MAX_FAILS-ésima falha
    expect(s.lockedUntil).not.toBeNull()
    expect(s.count).toBe(0)
  })
})
