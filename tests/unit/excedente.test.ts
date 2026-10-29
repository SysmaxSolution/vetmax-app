import { decidirExcedente } from '@/lib/financial/excedente'

// O defeito de origem, apontado pelo Diretor e pior do que ele supunha: não
// era "o sistema permite informar valor maior" — o código CORTAVA em silêncio
// com Math.min(recebido, valorTitulo) e chamava isso de "segurança". Tutor
// pagava R$ 200 num título de R$ 150 e os R$ 50 deixavam de existir.

const com = (p: Partial<Parameters<typeof decidirExcedente>[0]>) =>
  decidirExcedente({ valorTitulo: 150, valorRecebido: 150, temCliente: true, ...p })

describe('sem excedente', () => {
  it('valor exato passa direto', () => {
    const d = com({})
    expect(d.excesso).toBe(0)
    expect(d.exigeEscolha).toBe(false)
    expect(d.baixar).toBe(150)
  })

  it('baixa PARCIAL não é excedente e não pergunta nada', () => {
    const d = com({ valorRecebido: 80 })
    expect(d.excesso).toBe(0)
    expect(d.exigeEscolha).toBe(false)
    expect(d.baixar).toBe(80)
  })

  it('diferença de centavo por arredondamento não vira pergunta', () => {
    expect(com({ valorRecebido: 150.004 }).exigeEscolha).toBe(false)
  })
})

describe('com excedente — exige decisão', () => {
  it('pagou mais e não escolheu: recusa e explica', () => {
    const d = com({ valorRecebido: 200 })
    expect(d.excesso).toBe(50)
    expect(d.exigeEscolha).toBe(true)
    expect(d.erro).toMatch(/troco ou cr[ée]dito/i)
    expect(d.erro).toContain('50.00')
  })

  it('o excedente NUNCA é engolido: baixa o valor do título, não o recebido', () => {
    const d = com({ valorRecebido: 200, destino: 'troco' })
    expect(d.baixar).toBe(150)
    expect(d.excesso).toBe(50)   // a diferença continua existindo e tem destino
  })

  it('troco é aceito mesmo sem cliente no título', () => {
    const d = com({ valorRecebido: 200, destino: 'troco', temCliente: false })
    expect(d.exigeEscolha).toBe(false)
    expect(d.erro).toBeNull()
  })

  it('crédito exige cliente — crédito é saldo DE alguém', () => {
    const d = com({ valorRecebido: 200, destino: 'credito', temCliente: false })
    expect(d.exigeEscolha).toBe(true)
    expect(d.erro).toMatch(/n[ãa]o tem cliente/i)
  })

  it('crédito com cliente é aceito', () => {
    const d = com({ valorRecebido: 200, destino: 'credito', temCliente: true })
    expect(d.exigeEscolha).toBe(false)
    expect(d.erro).toBeNull()
    expect(d.excesso).toBe(50)
  })
})

describe('aritmética do centavo', () => {
  it('excedente é arredondado a 2 casas', () => {
    expect(com({ valorTitulo: 99.99, valorRecebido: 100, destino: 'troco' }).excesso).toBe(0.01)
  })

  it('valores com dízima não geram centavo fantasma', () => {
    const d = com({ valorTitulo: 33.33, valorRecebido: 100, destino: 'troco' })
    expect(d.excesso).toBe(66.67)
    expect(d.baixar).toBe(33.33)
  })

  it('negativo é tratado como zero, não vira crédito do nada', () => {
    const d = com({ valorTitulo: 150, valorRecebido: -50 })
    expect(d.excesso).toBe(0)
    expect(d.baixar).toBe(0)
  })
})
