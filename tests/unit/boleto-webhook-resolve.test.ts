import { describe, it, expect } from '@jest/globals'
import {
  normalizeBankId,
  extractAccountHints,
  matchScore,
  resolveBoletoCandidate,
  type BoletoCandidate,
} from '@/lib/boleto/webhook-resolve'

const c = (id: string, clinicId: string, bankAccountId: string | null, cfg?: Record<string, string>): BoletoCandidate =>
  ({ id, clinicId, bankAccountId, accountConfig: cfg ?? null })

describe('normalizeBankId', () => {
  it('ignora zeros à esquerda, pontuação e espaços', () => {
    expect(normalizeBankId('004321')).toBe('4321')
    expect(normalizeBankId(' 4.321 ')).toBe('4321')
    expect(normalizeBankId(4321)).toBe('4321')
  })
  it('devolve vazio para ausente', () => {
    expect(normalizeBankId(undefined)).toBe('')
    expect(normalizeBankId('')).toBe('')
  })
  it('preserva zero legítimo', () => {
    expect(normalizeBankId('000')).toBe('0')
  })
})

describe('extractAccountHints', () => {
  it('lê os nomes de campo do payload plano do Sicoob', () => {
    expect(extractAccountHints({ numeroCooperativa: '4321', numeroContaCorrente: '123456', numeroContrato: '99' }))
      .toEqual({ agencia: '4321', conta: '123456', codigoCliente: '99' })
  })
  it('lê também de dentro de "resultado"', () => {
    expect(extractAccountHints({ resultado: { agencia: '1', conta: '2', codigoModalidade: '1' } }))
      .toEqual({ agencia: '1', conta: '2', carteira: '1' })
  })
  it('não inventa campos quando o payload é vazio', () => {
    expect(extractAccountHints({})).toEqual({})
    expect(extractAccountHints(null)).toEqual({})
  })
})

describe('matchScore', () => {
  it('pontua os campos que batem', () => {
    expect(matchScore({ agencia: '4321', conta: '123456' }, { agencia: '04321', conta: '123456' })).toBe(2)
  })
  it('descarta (-1) quando há conflito declarado', () => {
    expect(matchScore({ agencia: '4321' }, { agencia: '9999' })).toBe(-1)
  })
  it('ignora campos ausentes de um dos lados', () => {
    expect(matchScore({ agencia: '4321' }, { conta: '1' })).toBe(0)
  })
})

describe('resolveBoletoCandidate — isolamento entre clínicas', () => {
  it('resolve quando há um único candidato', () => {
    const r = resolveBoletoCandidate([c('b1', 'clinicA', 'acc1')])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.boleto.clinicId).toBe('clinicA')
  })

  it('devolve not_found sem candidatos', () => {
    const r = resolveBoletoCandidate([])
    expect(r).toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('FALHA (ambiguous) com duas clínicas de mesmo nosso número e payload sem pistas', () => {
    const r = resolveBoletoCandidate([
      c('b1', 'clinicA', 'acc1', { agencia: '1000', conta: '11' }),
      c('b2', 'clinicB', 'acc2', { agencia: '2000', conta: '22' }),
    ], {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous')
      expect(r.candidates).toBe(2)
      expect(r.message).toContain('&conta=')
    }
  })

  it('NÃO escolhe "o mais recente" — a ordem da lista não decide', () => {
    const a = resolveBoletoCandidate([c('b1', 'clinicA', 'acc1'), c('b2', 'clinicB', 'acc2')], {})
    const b = resolveBoletoCandidate([c('b2', 'clinicB', 'acc2'), c('b1', 'clinicA', 'acc1')], {})
    expect(a.ok).toBe(false)
    expect(b.ok).toBe(false)
  })

  it('desempata pela carteira quando o payload traz agência/conta', () => {
    const r = resolveBoletoCandidate([
      c('b1', 'clinicA', 'acc1', { agencia: '1000', conta: '11' }),
      c('b2', 'clinicB', 'acc2', { agencia: '2000', conta: '22' }),
    ], { agencia: '02000', conta: '22' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.boleto.clinicId).toBe('clinicB')
  })

  it('continua ambíguo se as pistas casam com mais de uma conta', () => {
    const r = resolveBoletoCandidate([
      c('b1', 'clinicA', 'acc1', { agencia: '1000' }),
      c('b2', 'clinicB', 'acc2', { agencia: '1000' }),
    ], { agencia: '1000' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ambiguous')
  })

  it('é ambíguo, e não um acerto, quando os candidatos não têm config alguma', () => {
    const r = resolveBoletoCandidate([c('b1', 'clinicA', null), c('b2', 'clinicB', null)], { agencia: '1000' })
    expect(r.ok).toBe(false)
  })
})
