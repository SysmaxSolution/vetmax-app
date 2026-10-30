import {
  fatorDe, unidadeDe, paraSaldo, doSaldo, leiturasDoSaldo,
  precoPorUnidadeDeSaldo, explicarConversao, temConversao,
} from '@/lib/stock/unidades'

// O caso que a clínica descreveu: frasco de 10 mL, aplicado e vendido em 0,1 mL.
const frasco10ml = {
  unit: 'mL',
  unit_purchase: 'FR', factor_purchase: 10,
  unit_use: 'dose',    factor_use: 0.1,
  unit_sale: 'dose',   factor_sale: 0.1,
}

// O outro caso: caixa com 10 frascos de 10 mL, vendida por frasco, aplicada em mL.
const caixa10frascos = {
  unit: 'mL',
  unit_purchase: 'CX', factor_purchase: 100,
  unit_use: 'mL',      factor_use: 1,
  unit_sale: 'FR',     factor_sale: 10,
}

const semConversao = { unit: 'un' }

describe('unidades — entrada do fornecedor', () => {
  it('1 frasco entra como 10 mL', () => {
    expect(paraSaldo(frasco10ml, 1, 'purchase')).toBe(10)
  })
  it('1 caixa entra como 100 mL', () => {
    expect(paraSaldo(caixa10frascos, 1, 'purchase')).toBe(100)
  })
  it('produto sem conversão entra igual ao que veio', () => {
    expect(paraSaldo(semConversao, 7, 'purchase')).toBe(7)
  })
  it('units_per_package antigo ainda vale como fator de compra', () => {
    expect(fatorDe({ unit: 'comprimido', units_per_package: 30 }, 'purchase')).toBe(30)
  })
  it('o fator novo ganha do units_per_package', () => {
    expect(fatorDe({ unit: 'mL', units_per_package: 30, factor_purchase: 100 }, 'purchase')).toBe(100)
  })
})

describe('unidades — baixa por aplicação e por venda', () => {
  it('aplicar 1 dose tira 0,1 mL', () => {
    expect(paraSaldo(frasco10ml, 1, 'use')).toBe(0.1)
  })
  it('aplicar 3 doses tira 0,3 mL', () => {
    expect(paraSaldo(frasco10ml, 3, 'use')).toBe(0.3)
  })
  it('vender 1 frasco tira 10 mL', () => {
    expect(paraSaldo(caixa10frascos, 1, 'sale')).toBe(10)
  })
  it('vender 2 doses tira 0,2 mL', () => {
    expect(paraSaldo(frasco10ml, 2, 'sale')).toBe(0.2)
  })
})

describe('unidades — as três leituras do mesmo saldo', () => {
  it('100 mL em caixa viram 100 mL, 100 de uso e 10 frascos', () => {
    const l = leiturasDoSaldo(caixa10frascos, 100)
    expect(l.find(x => x.papel === 'balance')).toMatchObject({ quantidade: 100, unidade: 'mL' })
    expect(l.find(x => x.papel === 'sale')).toMatchObject({ quantidade: 10, unidade: 'FR' })
  })
  it('10 mL em frasco de doses dão 100 doses', () => {
    const l = leiturasDoSaldo(frasco10ml, 10)
    expect(l.find(x => x.papel === 'use')).toMatchObject({ quantidade: 100, unidade: 'dose' })
  })
  it('produto sem conversão mostra só o total, sem repetir o número', () => {
    expect(leiturasDoSaldo(semConversao, 5)).toHaveLength(1)
  })
})

describe('unidades — guardas', () => {
  it('fator zero ou negativo é ignorado, não zera o estoque', () => {
    expect(fatorDe({ unit: 'mL', factor_use: 0 }, 'use')).toBe(1)
    expect(fatorDe({ unit: 'mL', factor_sale: -5 }, 'sale')).toBe(1)
  })
  it('quantidade inválida não vira NaN no saldo', () => {
    expect(paraSaldo(frasco10ml, NaN, 'use')).toBe(0)
    expect(doSaldo(frasco10ml, NaN, 'use')).toBe(0)
  })
  it('unidade sem apelido cai na unidade de saldo', () => {
    expect(unidadeDe({ unit: 'mL' }, 'use')).toBe('mL')
  })
})

describe('unidades — preço e explicação', () => {
  it('frasco de 10 mL a R$ 50 custa R$ 5 o mL', () => {
    expect(precoPorUnidadeDeSaldo(frasco10ml, 50)).toBe(5)
  })
  it('explica a conversão em uma frase', () => {
    expect(explicarConversao(caixa10frascos)).toContain('1 CX entra como 100 mL')
    expect(explicarConversao(caixa10frascos)).toContain('cada FR vendido tira 10 mL')
  })
  it('produto comum não tem o que explicar', () => {
    expect(temConversao(semConversao)).toBe(false)
    expect(explicarConversao(semConversao)).toBeNull()
  })
})
