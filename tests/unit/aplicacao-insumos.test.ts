// Regras da baixa de insumo aplicado na consulta (Fase 1 · item 1.7).
//
// O que se cobre aqui é o que decide o que o Médico Veterinário vê na tela e o
// que entra na conta do tutor. O comportamento de banco (FIFO por validade,
// rastro de lote, devolução no lote exato, idempotência) é provado contra o
// Postgres, não aqui.

import {
  resumirBaixa,
  deveCobrarAplicacao,
  formatarQuantidade,
  ROTULO_STATUS_BAIXA,
} from '@/lib/stock/aplicacao'

describe('formatarQuantidade', () => {
  it('tira os zeros que o NUMERIC(10,3) devolve', () => {
    expect(formatarQuantidade(8)).toBe('8')
    expect(formatarQuantidade(8.0)).toBe('8')
    expect(formatarQuantidade(0.5, 'ml')).toBe('0,5 ml')
    expect(formatarQuantidade(2.25, 'ml')).toBe('2,25 ml')
  })

  it('não inventa número quando não há quantidade', () => {
    expect(formatarQuantidade(null)).toBe('—')
    expect(formatarQuantidade(undefined, 'ml')).toBe('—')
  })

  it('mostra saldo negativo como negativo', () => {
    expect(formatarQuantidade(-3, 'un')).toBe('-3 un')
  })
})

describe('resumirBaixa', () => {
  const base = { nome: 'Dipirona 500mg/ml', quantidade: 2, unidade: 'ml' }

  it('baixa normal informa o que saiu e o que restou', () => {
    const r = resumirBaixa({
      ...base,
      resultado: { matched: true, quantity_after: 8, below_minimum: false, requires_reconciliation: false },
    })
    expect(r.status).toBe('baixado')
    expect(r.tom).toBe('ok')
    expect(r.saldo_depois).toBe(8)
    expect(r.mensagem).toContain('2 ml')
    expect(r.mensagem).toContain('8 ml')
  })

  it('avisa quando o saldo cruzou o mínimo, sem tratar como erro', () => {
    const r = resumirBaixa({
      ...base,
      resultado: { matched: true, quantity_after: 1, below_minimum: true, requires_reconciliation: false },
    })
    expect(r.status).toBe('baixado')
    expect(r.tom).toBe('atencao')
    expect(r.mensagem).toContain('abaixo do mínimo')
  })

  it('saldo negativo vira divergência visível, não silêncio', () => {
    const r = resumirBaixa({
      ...base,
      quantidade: 5,
      resultado: { matched: true, quantity_after: -3, below_minimum: false, requires_reconciliation: true },
    })
    expect(r.status).toBe('insuficiente')
    expect(r.tom).toBe('alerta')
    expect(r.mensagem).toContain('-3 ml')
  })

  it('item fora do catálogo não pode passar calado', () => {
    const r = resumirBaixa({
      ...base,
      resultado: { matched: false, quantity_after: null, below_minimum: false, requires_reconciliation: true },
    })
    expect(r.status).toBe('nao_reconhecido')
    expect(r.tom).toBe('alerta')
    expect(r.mensagem).toContain('não está cadastrado')
    expect(r.mensagem).toContain('Dipirona 500mg/ml')
  })

  it('registro deliberadamente sem baixa diz isso com clareza', () => {
    const r = resumirBaixa({ ...base, resultado: null })
    expect(r.status).toBe('sem_baixa')
    expect(r.mensagem).toContain('sem efeito no estoque')
  })

  it('falha da própria baixa aparece com o motivo, e o registro clínico fica de pé', () => {
    const r = resumirBaixa({ ...base, resultado: null, erro: 'RPC indisponível' })
    expect(r.status).toBe('sem_baixa')
    expect(r.tom).toBe('alerta')
    expect(r.mensagem).toContain('Registrado no prontuário')
    expect(r.mensagem).toContain('RPC indisponível')
  })

  it('todo status tem rótulo para a linha da lista', () => {
    for (const status of ['baixado', 'insuficiente', 'nao_reconhecido', 'sem_baixa', 'devolvido'] as const) {
      expect(ROTULO_STATUS_BAIXA[status]).toBeTruthy()
    }
  })
})

describe('deveCobrarAplicacao', () => {
  const item = { cobrancaAutomatica: true, stockItemId: 'item-1', itemEhServico: false, status: 'baixado' as const }

  it('cobra quando a clínica ligou a cobrança automática e o insumo saiu do estoque', () => {
    expect(deveCobrarAplicacao(item)).toBe(true)
  })

  it('não cobra nada enquanto a clínica não ligar a flag (retrocompatibilidade)', () => {
    expect(deveCobrarAplicacao({ ...item, cobrancaAutomatica: false })).toBe(false)
  })

  it('não cobra texto livre — não há item nem preço', () => {
    expect(deveCobrarAplicacao({ ...item, stockItemId: null, status: 'nao_reconhecido' })).toBe(false)
  })

  it('não cobra serviço, que o painel de serviços já cobra — evita conta dobrada', () => {
    expect(deveCobrarAplicacao({ ...item, itemEhServico: true })).toBe(false)
  })

  it('cobra mesmo com saldo negativo: o insumo foi aplicado no animal', () => {
    expect(deveCobrarAplicacao({ ...item, status: 'insuficiente' })).toBe(true)
  })

  it('não cobra o que foi registrado sem baixa nem o que já voltou ao estoque', () => {
    expect(deveCobrarAplicacao({ ...item, status: 'sem_baixa' })).toBe(false)
    expect(deveCobrarAplicacao({ ...item, status: 'devolvido' })).toBe(false)
  })
})
