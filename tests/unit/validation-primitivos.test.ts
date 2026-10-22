import { zDinheiro, zDinheiroOuZero, zPercentual, zDataISO, zCpfCnpj, zCpfCnpjPreservandoFormato, zParcela, valida } from '@/lib/validation/primitivos'
import { cpfValido, cnpjValido, formataCpfCnpj } from '@/lib/validation/documento'
import { z } from 'zod'

const ok = (e: z.ZodTypeAny, v: unknown) => e.safeParse(v).success

describe('zDinheiro', () => {
  it.each([0.01, 1, 10.5, 1.23, 99.99, 1500, 123456.78])('aceita %p', v => expect(ok(zDinheiro, v)).toBe(true))
  it.each([0, -1, -0.01, NaN, Infinity, -Infinity])('recusa %p', v => expect(ok(zDinheiro, v)).toBe(false))

  // O que motivou o teto e as casas: centavo fantasma no livro e dígito a mais.
  it('recusa mais de 2 casas decimais', () => {
    expect(ok(zDinheiro, 1.005)).toBe(false)
    expect(ok(zDinheiro, 1.234)).toBe(false)
    expect(ok(zDinheiro, 0.999)).toBe(false)
  })
  it('não se confunde com ponto flutuante binário', () => {
    // 1.23*100 = 122.99999999999999 e 0.1*100 = 10.000000000000002
    for (const v of [0.1, 0.2, 0.3, 1.23, 10.1, 870.25, 7.07, 29.29]) {
      expect(ok(zDinheiro, v)).toBe(true)
    }
    // 2.675 tem 3 casas — recusar é o certo, mesmo que 2.675*100 dê 267.49999…
    expect(ok(zDinheiro, 2.675)).toBe(false)
  })
  it('recusa acima do teto de sanidade (R$ 10 milhões)', () => {
    expect(ok(zDinheiro, 10_000_000)).toBe(true)
    expect(ok(zDinheiro, 10_000_000.01)).toBe(false)
  })
  it('aceita string numérica (vem assim de input type=number)', () => {
    expect(zDinheiro.parse('150.75')).toBe(150.75)
  })
})

describe('zDinheiroOuZero', () => {
  it('aceita zero (desconto/juros ausentes)', () => expect(ok(zDinheiroOuZero, 0)).toBe(true))
  it('recusa negativo', () => expect(ok(zDinheiroOuZero, -0.01)).toBe(false))
})

describe('zPercentual', () => {
  it.each([0, 0.5, 2.99, 50, 100])('aceita %p', v => expect(ok(zPercentual, v)).toBe(true))
  it.each([-0.1, 100.01, NaN])('recusa %p', v => expect(ok(zPercentual, v)).toBe(false))
})

describe('zDataISO', () => {
  it.each(['2026-01-01', '2026-10-07', '2028-02-29'])('aceita %s', v => expect(ok(zDataISO, v)).toBe(true))
  // 2026 não é bissexto: 29/02/2026 não existe e a checagem de data real pega.
  it.each(['07/10/2026', '2026-02-29', '2026-13-01', '2026-02-30', '2026-00-10', '2026-10-32', '', 'hoje'])(
    'recusa %p', v => expect(ok(zDataISO, v)).toBe(false))
})

describe('zParcela', () => {
  it.each([1, 2, 12])('aceita %p', v => expect(ok(zParcela, v)).toBe(true))
  it.each([0, -1, 1.5])('recusa %p', v => expect(ok(zParcela, v)).toBe(false))
})

describe('CPF / CNPJ — dígito verificador', () => {
  // CNPJ real e público: o da Sysmax Software, que já consta nos nossos docs.
  it('aceita CNPJ válido', () => {
    expect(cnpjValido('67.264.369/0001-82')).toBe(true)
    expect(cnpjValido('23.692.661/0001-20')).toBe(true)
  })
  it('recusa CNPJ com dígito trocado', () => {
    expect(cnpjValido('67.264.369/0001-83')).toBe(false)
    expect(cnpjValido('23.692.661/0001-21')).toBe(false)
  })
  it('recusa sequência repetida e comprimento errado', () => {
    expect(cnpjValido('00.000.000/0000-00')).toBe(false)
    expect(cnpjValido('11.111.111/1111-11')).toBe(false)
    expect(cnpjValido('1234')).toBe(false)
  })
  it('CPF: aceita válido, recusa dígito trocado e repetido', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)   // CPF de teste conhecido
    expect(cpfValido('529.982.247-26')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
  it('zCpfCnpj normaliza para dígitos', () => {
    expect(zCpfCnpj.parse('67.264.369/0001-82')).toBe('67264369000182')
    expect(zCpfCnpj.parse('529.982.247-25')).toBe('52998224725')
  })
  it('zCpfCnpjPreservandoFormato confere o dígito sem mudar o formato', () => {
    // companies.cnpj está gravado mascarado em produção; normalizar no save
    // mudaria o formato de um registro existente.
    expect(zCpfCnpjPreservandoFormato.parse('67.264.369/0001-82')).toBe('67.264.369/0001-82')
    expect(zCpfCnpjPreservandoFormato.parse('67264369000182')).toBe('67264369000182')
    expect(zCpfCnpjPreservandoFormato.safeParse('67.264.369/0001-83').success).toBe(false)
  })

  it('formata de volta', () => {
    expect(formataCpfCnpj('67264369000182')).toBe('67.264.369/0001-82')
    expect(formataCpfCnpj('52998224725')).toBe('529.982.247-25')
  })
})

describe('valida() — formato que as actions já usam', () => {
  const E = z.object({ amount: zDinheiro, due_date: zDataISO })

  it('devolve dados normalizados quando passa', () => {
    const r = valida(E, { amount: '99.90', due_date: '2026-12-01' })
    expect(r).toEqual({ dados: { amount: 99.9, due_date: '2026-12-01' } })
  })
  it('devolve { error } com o campo e a mensagem quando falha', () => {
    const r = valida(E, { amount: -5, due_date: '2026-12-01' })
    expect('error' in r).toBe(true)
    if ('error' in r) {
      expect(r.error).toContain('amount')
      expect(r.error).toMatch(/maior que zero/i)
    }
  })
  it('não lança com entrada completamente errada', () => {
    expect('error' in valida(E, null)).toBe(true)
    expect('error' in valida(E, 'texto')).toBe(true)
    expect('error' in valida(E, undefined)).toBe(true)
  })
})
