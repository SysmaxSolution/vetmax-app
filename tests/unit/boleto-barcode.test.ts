/** Unit — código de barras ITF (Interleaved 2 of 5) do boleto. */
import { itfModules, barcodeSvg } from '@/lib/boleto/barcode'

describe('itfModules', () => {
  it('inclui start (4 elementos) e stop (3 elementos)', () => {
    const m = itfModules('12')
    // start(4) + 1 par * 10 + stop(3) = 17
    expect(m.length).toBe(4 + 10 + 3)
    expect(m[0]).toEqual({ width: 1, bar: true })   // start barra fina
  })
  it('44 dígitos (par) produzem 4 + 22*10 + 3 elementos', () => {
    const m = itfModules('7'.repeat(44))
    expect(m.length).toBe(4 + 22 * 10 + 3)
  })
  it('comprimento ímpar é normalizado (prefixo 0)', () => {
    expect(itfModules('123').length).toBe(itfModules('0123').length)
  })
})

describe('barcodeSvg', () => {
  const svg = barcodeSvg('75690000000000000000000000000000000000000001', { moduleWidth: 1, height: 50 })
  it('gera SVG com barras', () => {
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('<rect')
    expect(svg).toContain('height="50"')
  })
})
