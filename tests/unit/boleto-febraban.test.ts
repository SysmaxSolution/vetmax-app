/** Unit — núcleo FEBRABAN (código de barras ↔ linha digitável).
 * Testes de CONSISTÊNCIA INTERNA (o exemplo bancário é gerado e reparseado),
 * pois em produção a linha/código vêm do próprio banco. */
import {
  codigoBarras, linhaDigitavel, mod10, mod11Barras, fatorVencimento, valorBarras,
  formatLinhaDigitavel, gerarBoletoSicoob,
} from '@/lib/boleto/febraban'

// Reconstrói o código de barras a partir da linha digitável (remove os DVs de campo).
function barcodeFromLinha(ld: string): string {
  const s = ld.replace(/\D/g, '')
  const c1 = s.slice(0, 9)      // sem DV (pos 10)
  const c2 = s.slice(10, 20)    // sem DV (pos 21)
  const c3 = s.slice(21, 31)    // sem DV (pos 32)
  const dvGeral = s.slice(32, 33)
  const fatorValor = s.slice(33)          // 14
  const banco = c1.slice(0, 4)
  const campo = c1.slice(4) + c2 + c3     // 5+10+10 = 25
  return banco + dvGeral + fatorValor + campo
}

describe('helpers', () => {
  it('valorBarras', () => expect(valorBarras(150)).toBe('0000015000'))
  it('fatorVencimento cai na faixa válida (2026)', () => {
    const f = Number(fatorVencimento('2026-09-20'))
    expect(f).toBeGreaterThan(1000); expect(f).toBeLessThan(9999)
  })
  it('mod10 e mod11 retornam dígito 0-9', () => {
    expect(mod10('341910900')).toBeGreaterThanOrEqual(0)
    expect(mod10('341910900')).toBeLessThanOrEqual(9)
    expect(mod11Barras('123456789012345678901234567890123456789012')).toBeLessThanOrEqual(9)
  })
})

describe('código de barras ↔ linha digitável (consistência)', () => {
  const cb = codigoBarras({ banco: '756', dueISO: '2026-09-20', valor: 249.9, campoLivre: '1000112345670000012341' })
  it('código de barras tem 44 dígitos', () => expect(cb).toHaveLength(44))
  it('linha digitável tem 47 dígitos', () => expect(linhaDigitavel(cb)).toHaveLength(47))
  it('round-trip: reconstruir o código de barras a partir da linha bate', () => {
    expect(barcodeFromLinha(linhaDigitavel(cb))).toBe(cb)
  })
  it('DV geral (pos 5) é o mesmo emitido', () => {
    expect(linhaDigitavel(cb)[32]).toBe(cb[4])
  })
  it('formata em 5 blocos', () => {
    const f = formatLinhaDigitavel(linhaDigitavel(cb))
    expect(f.split(' ')).toHaveLength(5)
    expect(f).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/)
  })
})

describe('gerarBoletoSicoob', () => {
  const b = gerarBoletoSicoob({ agencia: '4321', codigoCliente: '123456', nossoNumero: '1234', valor: 249.9, dueISO: '2026-09-20' })
  it('gera barras 44 + linha 47', () => {
    expect(b.codigoBarras).toHaveLength(44)
    expect(b.linhaDigitavel).toHaveLength(47)
    expect(b.codigoBarras.slice(0, 3)).toBe('756')  // Sicoob
  })
  it('nosso número formatado com DV', () => {
    expect(b.nossoNumeroFmt).toMatch(/^1234-\d$/)
  })
})
