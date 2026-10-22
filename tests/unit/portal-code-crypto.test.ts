/** Unit — cifra/máscara do código de acesso (reexibir mascarado). */
import { encryptCode, decryptCode, maskCode } from '@/lib/portal/code-crypto'

describe('encrypt/decrypt', () => {
  it('round-trip recupera o código', () => {
    const enc = encryptCode('ABCDE-234567')
    expect(enc).not.toContain('ABCDE')      // não fica em texto
    expect(decryptCode(enc)).toBe('ABCDE-234567')
  })
  it('cifra é aleatória (iv)', () => {
    expect(encryptCode('X')).not.toBe(encryptCode('X'))
  })
  it('enc inválido → null', () => {
    expect(decryptCode(null)).toBeNull()
    expect(decryptCode('lixo')).toBeNull()
  })
})

describe('maskCode', () => {
  it('código do parceiro: mostra público, esconde segredo', () => {
    expect(maskCode('ABCDE-234567')).toBe('ABCDE-••••67')
  })
  it('código do tutor (sem hífen): mostra pontas', () => {
    expect(maskCode('ABCD2345')).toBe('AB••••45')
  })
  it('vazio', () => expect(maskCode(null)).toBe(''))
})
