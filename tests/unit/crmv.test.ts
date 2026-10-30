import { limparCrmv, crmvCabe, ufDoCrmv, CRMV_MAX } from '@/lib/crmv'

describe('CRMV — campo livre (migration 0529)', () => {
  it('guarda o que a pessoa escreveu, só tirando espaço sobrando', () => {
    expect(limparCrmv('  28856-SP ')).toBe('28856-SP')
    expect(limparCrmv('CRMV-SP   28856')).toBe('CRMV-SP 28856')
    expect(limparCrmv('sp28856')).toBe('sp28856')   // não força maiúscula
  })

  it('vazio continua vazio', () => {
    expect(limparCrmv('')).toBeNull()
    expect(limparCrmv('   ')).toBeNull()
    expect(limparCrmv(null)).toBeNull()
  })

  it('aceita os formatos que antes eram recusados', () => {
    for (const v of ['28856', '28856-SP', '28856/SP', 'CRMV-SP 28856', 'SP28856']) {
      expect(crmvCabe(v)).toBe(true)
    }
  })

  it('o tamanho é a única regra que sobrou', () => {
    expect(crmvCabe('x'.repeat(CRMV_MAX))).toBe(true)
    expect(crmvCabe('x'.repeat(CRMV_MAX + 1))).toBe(false)
    expect(crmvCabe(null)).toBe(true)
  })

  it('acha a sigla do estado venha ela antes ou depois do número', () => {
    expect(ufDoCrmv('28856-SP')).toBe('SP')
    expect(ufDoCrmv('SP28856')).toBe('SP')
    expect(ufDoCrmv('CRMV/MG 123456')).toBe('MG')
    expect(ufDoCrmv('28856')).toBe('')
    expect(ufDoCrmv(null)).toBe('')
  })

  it('não confunde o prefixo CRMV com uma sigla de estado', () => {
    expect(ufDoCrmv('CRMV 28856')).toBe('')
  })
})
