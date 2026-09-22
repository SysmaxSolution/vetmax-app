/** Unit — código do portal do parceiro (login por código). */
import { generatePartnerCode, splitPartnerCode, formatPartnerCode, CODE_PUBLIC_LEN } from '@/lib/portal/partner-code'
import { hashCode, verifyCode } from '@/lib/portal/access-code'

describe('generate/split', () => {
  it('gera código PPPPP-SSSSSS', () => {
    const g = generatePartnerCode()
    expect(g.publicPart).toHaveLength(CODE_PUBLIC_LEN)
    expect(g.secret).toHaveLength(6)
    expect(g.code).toBe(`${g.publicPart}-${g.secret}`)
  })
  it('split reconstrói as partes (tolerante a hífen/caixa/espaço)', () => {
    const g = generatePartnerCode()
    const parts = splitPartnerCode(` ${g.publicPart.toLowerCase()}-${g.secret} `)
    expect(parts).toEqual({ publicPart: g.publicPart, secret: g.secret })
  })
  it('rejeita curto demais', () => {
    expect(splitPartnerCode('ABC')).toBeNull()
    expect(splitPartnerCode(null)).toBeNull()
  })
})

describe('round-trip login', () => {
  it('o segredo verifica contra o hash guardado', () => {
    const g = generatePartnerCode()
    const stored = hashCode(g.secret)                 // guardaríamos publicPart + este hash
    const parts = splitPartnerCode(g.code)!
    expect(parts.publicPart).toBe(g.publicPart)       // lookup
    expect(verifyCode(parts.secret, stored)).toBe(true)
    expect(verifyCode('ZZZZZZ', stored)).toBe(false)
  })
  it('formatPartnerCode', () => {
    expect(formatPartnerCode('ABCDE', '234567')).toBe('ABCDE-234567')
  })
})
