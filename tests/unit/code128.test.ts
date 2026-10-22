/**
 * Unit — Codificador Code 128-B (etiquetas de tubo, Fase 2).
 */
import { encodeCode128B } from '@/lib/lab/code128'

describe('encodeCode128B', () => {
  it('codifica "0" com checksum correto', () => {
    // start(104) + valor("0"=16)*1 = 120 → 120 % 103 = 17
    const enc = encodeCode128B('0')
    if ('error' in enc) throw new Error(enc.error)
    expect(enc.check).toBe(17)
  })

  it('checksum de string numérica ("204457")', () => {
    // valor = ascii-32 → [18,16,20,20,21,23]; start=104
    // 104 + 18*1+16*2+20*3+20*4+21*5+23*6 = 104+433 = 537 → 537 % 103 = 22
    const enc = encodeCode128B('204457')
    if ('error' in enc) throw new Error(enc.error)
    expect(enc.check).toBe(22)
  })

  it('começa com START-B e termina com STOP (2331112)', () => {
    const enc = encodeCode128B('A')
    if ('error' in enc) throw new Error(enc.error)
    // START-B pattern = 211214 → primeiras 6 larguras
    expect(enc.widths.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4])
    // STOP = 2331112 → últimas 7 larguras
    expect(enc.widths.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2])
  })

  it('nº de larguras = (2 + n + 2) símbolos, sendo o último com 7', () => {
    // "AB": start + 2 dados + check + stop = 5 símbolos; 4×6 + 7 = 31 larguras
    const enc = encodeCode128B('AB')
    if ('error' in enc) throw new Error(enc.error)
    expect(enc.widths).toHaveLength(4 * 6 + 7)
  })

  it('módulos = soma das larguras > 0', () => {
    const enc = encodeCode128B('LAB-001')
    if ('error' in enc) throw new Error(enc.error)
    expect(enc.modules).toBe(enc.widths.reduce((a, b) => a + b, 0))
    expect(enc.modules).toBeGreaterThan(0)
  })

  it('rejeita vazio e caractere fora do ASCII imprimível', () => {
    expect(encodeCode128B('')).toHaveProperty('error')
    expect(encodeCode128B('café')).toHaveProperty('error')   // 'é' fora de 32..126
  })
})
