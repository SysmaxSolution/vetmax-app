import { cfopDeEntrada, NATUREZA_POR_SUFIXO, EFEITO_DA_NATUREZA } from '@/lib/fiscal/cfop'

describe('CFOP — conversão de saída do fornecedor para entrada nossa', () => {
  it('troca só o primeiro dígito', () => {
    expect(cfopDeEntrada('5102')).toBe('1102')   // mesmo estado
    expect(cfopDeEntrada('6102')).toBe('2102')   // outro estado
    expect(cfopDeEntrada('7102')).toBe('3102')   // exterior
    expect(cfopDeEntrada('5910')).toBe('1910')   // bonificação
    expect(cfopDeEntrada('6922')).toBe('2922')   // faturamento de entrega futura
  })

  it('aceita o CFOP escrito com pontuação', () => {
    expect(cfopDeEntrada('5.102')).toBe('1102')
    expect(cfopDeEntrada(' 5102 ')).toBe('1102')
  })

  it('CFOP que já é de entrada fica como está', () => {
    expect(cfopDeEntrada('1102')).toBe('1102')
    expect(cfopDeEntrada('2102')).toBe('2102')
  })

  it('lixo não vira CFOP', () => {
    expect(cfopDeEntrada('')).toBeNull()
    expect(cfopDeEntrada(null)).toBeNull()
    expect(cfopDeEntrada('abc')).toBeNull()
    expect(cfopDeEntrada('51020')).toBeNull()
    expect(cfopDeEntrada('9102')).toBeNull()
  })
})

describe('CFOP — o que cada natureza faz ao lançar a entrada', () => {
  const natureza = (cfop: string) => NATUREZA_POR_SUFIXO[cfop.slice(1)]?.natureza ?? 'outra'
  const efeito = (cfop: string) => EFEITO_DA_NATUREZA[natureza(cfop)]

  it('compra comum lança financeiro e movimenta estoque', () => {
    expect(efeito('5102')).toEqual({ financeiro: true, estoque: true })
  })

  it('bonificação e amostra grátis entram no estoque sem contas a pagar', () => {
    expect(efeito('5910')).toEqual({ financeiro: false, estoque: true })
    expect(efeito('6911')).toEqual({ financeiro: false, estoque: true })
  })

  it('simples faturamento da entrega futura só lança financeiro', () => {
    expect(efeito('5922')).toEqual({ financeiro: true, estoque: false })
    expect(efeito('6922')).toEqual({ financeiro: true, estoque: false })
  })

  it('remessa da entrega futura só movimenta estoque', () => {
    for (const c of ['5116', '5117', '6116', '6117']) {
      expect(efeito(c)).toEqual({ financeiro: false, estoque: true })
    }
  })

  it('remessa para conserto ou demonstração não mexe em nada sozinha', () => {
    expect(efeito('5915')).toEqual({ financeiro: false, estoque: false })
    expect(efeito('5912')).toEqual({ financeiro: false, estoque: false })
  })

  it('as duas pontas da entrega futura são naturezas diferentes', () => {
    expect(natureza('5922')).toBe('entrega_futura_faturamento')
    expect(natureza('5117')).toBe('entrega_futura_remessa')
  })
})

describe('CFOP — natureza da nota inteira', () => {
  const { naturezaDaNota } = require('@/lib/fiscal/cfop') as typeof import('@/lib/fiscal/cfop')

  it('nota com um CFOP só assume aquela natureza', () => {
    expect(naturezaDaNota(['5102', '5102'])).toBe('compra')
    expect(naturezaDaNota(['5910'])).toBe('bonificacao')
  })

  it('um item de entrega futura decide a nota toda', () => {
    // Lançar como compra comum criaria contas a pagar ou saldo que não existem.
    expect(naturezaDaNota(['5102', '5922'])).toBe('entrega_futura_faturamento')
    expect(naturezaDaNota(['5102', '5117'])).toBe('entrega_futura_remessa')
  })

  it('bonificação ganha da compra quando vêm juntas', () => {
    expect(naturezaDaNota(['5102', '5910'])).toBe('bonificacao')
  })

  it('CFOP vazio ou desconhecido não vira compra por acidente', () => {
    expect(naturezaDaNota([null, undefined, ''])).toBe('outra')
    expect(naturezaDaNota(['5949'])).toBe('outra')
  })
})
