/**
 * Unit — Link tokenizado de compartilhamento de estudo de imagem (Fase 3).
 */
import {
  SHARE_TOKEN_PREFIX,
  formatShareToken,
  isValidTokenFormat,
  isLinkRevoked,
  isLinkExpired,
  canViewLink,
  computeExpiry,
} from '@/lib/imaging/share-token'

describe('formatShareToken', () => {
  it('prefixa e normaliza o hex', () => {
    expect(formatShareToken('AbC123')).toBe(SHARE_TOKEN_PREFIX + 'abc123')
  })
  it('descarta caracteres não-hex', () => {
    expect(formatShareToken('ab-cd ef!')).toBe(SHARE_TOKEN_PREFIX + 'abcdef')
  })
})

describe('isValidTokenFormat', () => {
  const ok = formatShareToken('a'.repeat(32))
  it('aceita token bem formado', () => {
    expect(isValidTokenFormat(ok)).toBe(true)
  })
  it('rejeita sem prefixo', () => {
    expect(isValidTokenFormat('a'.repeat(32))).toBe(false)
  })
  it('rejeita hex curto demais', () => {
    expect(isValidTokenFormat(SHARE_TOKEN_PREFIX + 'abc')).toBe(false)
  })
  it('rejeita vazio/nulo', () => {
    expect(isValidTokenFormat('')).toBe(false)
    expect(isValidTokenFormat(null)).toBe(false)
    expect(isValidTokenFormat(undefined)).toBe(false)
  })
  it('rejeita caractere não-hex no corpo', () => {
    expect(isValidTokenFormat(SHARE_TOKEN_PREFIX + 'z'.repeat(30))).toBe(false)
  })
})

describe('validade do link', () => {
  const now = '2026-09-09T12:00:00.000Z'

  it('revogado bloqueia', () => {
    const link = { expires_at: null, revoked_at: '2026-09-08T00:00:00Z' }
    expect(isLinkRevoked(link)).toBe(true)
    expect(canViewLink(link, now)).toEqual({ ok: false, reason: 'revoked' })
  })
  it('sem expiração nunca expira', () => {
    const link = { expires_at: null, revoked_at: null }
    expect(isLinkExpired(link, now)).toBe(false)
    expect(canViewLink(link, now)).toEqual({ ok: true })
  })
  it('expirado bloqueia', () => {
    const link = { expires_at: '2026-09-09T11:59:59Z', revoked_at: null }
    expect(isLinkExpired(link, now)).toBe(true)
    expect(canViewLink(link, now)).toEqual({ ok: false, reason: 'expired' })
  })
  it('ainda válido passa', () => {
    const link = { expires_at: '2026-09-10T12:00:00Z', revoked_at: null }
    expect(canViewLink(link, now)).toEqual({ ok: true })
  })
  it('revogação tem prioridade sobre expiração', () => {
    const link = { expires_at: '2026-09-10T12:00:00Z', revoked_at: '2026-09-09T00:00:00Z' }
    expect(canViewLink(link, now)).toEqual({ ok: false, reason: 'revoked' })
  })
})

describe('computeExpiry', () => {
  const now = '2026-09-09T00:00:00.000Z'
  it('soma dias', () => {
    expect(computeExpiry(now, 7)).toBe('2026-09-16T00:00:00.000Z')
  })
  it('null/0/negativo = sem expiração', () => {
    expect(computeExpiry(now, null)).toBeNull()
    expect(computeExpiry(now, 0)).toBeNull()
    expect(computeExpiry(now, -3)).toBeNull()
  })
})
