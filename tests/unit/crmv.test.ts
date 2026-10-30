import { normalizarCrmv } from '@/lib/crmv'

describe('normalizarCrmv — o CRMV como a pessoa digita', () => {
  const ok = (r: ReturnType<typeof normalizarCrmv>) => ('crmv' in r ? r.crmv : `ERRO: ${r.error}`)

  it('só o número vira UF + número usando o estado da clínica', () => {
    expect(ok(normalizarCrmv('28856', 'SP'))).toBe('SP28856')
  })
  it('aceita o que está na carteirinha, com prefixo e pontuação', () => {
    expect(ok(normalizarCrmv('CRMV-SP 28856', 'SP'))).toBe('SP28856')
    expect(ok(normalizarCrmv('sp/28856', null))).toBe('SP28856')
  })
  it('vazio continua vazio', () => {
    expect(ok(normalizarCrmv('', 'SP'))).toBeNull()
    expect(ok(normalizarCrmv(null, 'SP'))).toBeNull()
  })
  it('só número sem estado na clínica explica o que fazer', () => {
    const r = normalizarCrmv('28856', null)
    expect('error' in r && r.error).toMatch(/sigla do estado/i)
  })
  it('sigla que não é estado é recusada com frase clara', () => {
    const r = normalizarCrmv('XX28856', 'SP')
    expect('error' in r && r.error).toMatch(/não é uma sigla de estado/i)
  })
  it('número curto demais não passa (a CHECK exige 4 dígitos)', () => {
    expect('error' in normalizarCrmv('123', 'SP')).toBe(true)
  })
  it('o resultado sempre casa com a regra do banco', () => {
    const regra = /^[A-Z]{2}[0-9]{4,10}$/
    for (const entrada of ['28856', 'CRMV-SP 28856', 'sp28856', 'MG 123456']) {
      const r = normalizarCrmv(entrada, 'SP')
      expect('crmv' in r && regra.test(r.crmv!)).toBe(true)
    }
  })
})
