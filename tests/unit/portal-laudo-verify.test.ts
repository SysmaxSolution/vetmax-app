/** Unit — código de verificação de laudo + hash. */
import { generateVerifyCode, normalizeVerifyCode, formatVerifyCode, sha256Hex, VERIFY_CODE_LEN } from '@/lib/portal/laudo-verify'

describe('verify code', () => {
  it('gera código do tamanho certo, alfabeto seguro', () => {
    const c = generateVerifyCode()
    expect(c).toHaveLength(VERIFY_CODE_LEN)
    expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
    expect(c).not.toMatch(/[IO01]/)
  })
  it('normaliza entrada', () => {
    expect(normalizeVerifyCode('k7q2m-9xr4t')).toBe('K7Q2M9XR4T')
    expect(normalizeVerifyCode(' k7 q2 ')).toBe('K7Q2')
  })
  it('formata em blocos', () => {
    expect(formatVerifyCode('K7Q2M9XR4T')).toBe('K7Q2M-9XR4T')
  })
})

describe('sha256Hex', () => {
  it('hash estável e determinístico', () => {
    const a = sha256Hex(Buffer.from('laudo-teste'))
    const b = sha256Hex(Buffer.from('laudo-teste'))
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
    expect(sha256Hex(Buffer.from('outro'))).not.toBe(a)
  })
})
