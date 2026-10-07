import { digitaisDoLote, type LinhaExtrato } from '@/lib/financial/extrato-digital'

// O defeito que este arquivo trava, medido em PRODUÇÃO:
//   150 linhas em bank_statements, 43 grupos duplicados por conteúdo.
// O usuário consultava um período, vinculava alguns títulos, saía da tela,
// voltava, reimportava o mesmo período e ganhava cópias — inclusive de
// lançamento já conciliado, o que permitia gerar vários títulos do mesmo
// movimento.
//
// E por que `external_id` não serve de chave: ele guarda o `numeroDocumento`
// do Sicoob, que para Pix vem como a string literal "Pix". Em produção havia
// 51 linhas com external_id = 'Pix' — 51 transações DIFERENTES.

const CONTA = '11111111-1111-1111-1111-111111111111'
const l = (p: Partial<LinhaExtrato>): LinhaExtrato =>
  ({ date: '2026-10-01', amount: 100, description: 'X', type: 'credit', ...p })

describe('digitaisDoLote — com transactionId do banco', () => {
  it('usa o transactionId, que é único', () => {
    const d = digitaisDoLote(CONTA, [l({ tx_id: 'ABC-123' }), l({ tx_id: 'DEF-456' })])
    expect(d).toEqual(['tx:ABC-123', 'tx:DEF-456'])
  })

  it('o MESMO lote gera as MESMAS digitais (reimportar é inofensivo)', () => {
    const lote = [l({ tx_id: 'A' }), l({ tx_id: 'B' }), l({ tx_id: 'C' })]
    expect(digitaisDoLote(CONTA, lote)).toEqual(digitaisDoLote(CONTA, lote))
  })

  it('ignora o external_id inútil: 3 linhas "Pix" com tx_id distinto seguem distintas', () => {
    const d = digitaisDoLote(CONTA, [
      l({ external_id: 'Pix', tx_id: 'T1', amount: 50 }),
      l({ external_id: 'Pix', tx_id: 'T2', amount: 50 }),
      l({ external_id: 'Pix', tx_id: 'T3', amount: 50 }),
    ])
    expect(new Set(d).size).toBe(3)
  })
})

describe('digitaisDoLote — sem identificador do banco (CSV, OFX)', () => {
  it('conteúdo diferente gera digital diferente', () => {
    const d = digitaisDoLote(CONTA, [l({ amount: 10 }), l({ amount: 20 }), l({ description: 'Y' }), l({ type: 'debit' })])
    expect(new Set(d).size).toBe(4)
  })

  it('duas transações REALMENTE iguais no mesmo dia continuam linhas distintas', () => {
    const d = digitaisDoLote(CONTA, [l({ amount: 78.77 }), l({ amount: 78.77 })])
    expect(d[0]).not.toBe(d[1])
    expect(d[0].endsWith(':1')).toBe(true)
    expect(d[1].endsWith(':2')).toBe(true)
  })

  it('mas reimportar o mesmo lote cai nas mesmas digitais', () => {
    const lote = [l({ amount: 78.77 }), l({ amount: 78.77 }), l({ amount: 5 })]
    expect(digitaisDoLote(CONTA, lote)).toEqual(digitaisDoLote(CONTA, lote))
  })

  it('contas diferentes não colidem', () => {
    const outra = '22222222-2222-2222-2222-222222222222'
    expect(digitaisDoLote(CONTA, [l({})])[0]).not.toBe(digitaisDoLote(outra, [l({})])[0])
  })

  it('o sinal do valor não muda a identidade (gravamos sempre o absoluto)', () => {
    const a = digitaisDoLote(CONTA, [l({ amount: 100, type: 'debit' })])[0]
    const b = digitaisDoLote(CONTA, [l({ amount: -100, type: 'debit' })])[0]
    expect(a).toBe(b)
  })

  it('descrição ausente não quebra', () => {
    const d = digitaisDoLote(CONTA, [l({ description: undefined })])
    expect(typeof d[0]).toBe('string')
    expect(d[0].length).toBeGreaterThan(10)
  })
})

describe('digitaisDoLote — mistura de linhas com e sem tx_id', () => {
  it('cada uma segue sua regra, e a ordem das sem-id é preservada', () => {
    const d = digitaisDoLote(CONTA, [
      l({ tx_id: 'T1' }), l({ amount: 9 }), l({ tx_id: 'T2' }), l({ amount: 9 }),
    ])
    expect(d[0]).toBe('tx:T1')
    expect(d[2]).toBe('tx:T2')
    expect(d[1]).not.toBe(d[3])
    expect(new Set(d).size).toBe(4)
  })

  it('lote vazio devolve lista vazia', () => {
    expect(digitaisDoLote(CONTA, [])).toEqual([])
  })

  it('tx_id em branco cai na regra de conteúdo', () => {
    const d = digitaisDoLote(CONTA, [l({ tx_id: '   ' }), l({ tx_id: '' })])
    expect(d[0].startsWith('tx:')).toBe(false)
    expect(d[0]).not.toBe(d[1])
  })
})
