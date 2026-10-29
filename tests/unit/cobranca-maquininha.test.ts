/**
 * Unit — regras da cobrança na maquininha (FinPet): situação, método pela
 * bandeira, casamento por NSU e o que o caixa/extrato pode fazer.
 */

import {
  situacaoDaCobranca, metodoDaBandeira, normalizarNsu,
  podeBaixarTitulo, podeCancelarAntesDaCaptura, podeEstornar, rotuloDoTitulo,
  type EstadoCobranca,
} from '@/lib/financial/cobranca-maquininha'

const base: EstadoCobranca = {
  status: 'APPROVED', nsu: '123456', invoice_id: 'inv-1',
  settled_split_id: null, reversed_at: null, cancel_requested_at: null,
}

describe('situacaoDaCobranca', () => {
  it('traduz os status da operadora', () => {
    expect(situacaoDaCobranca(null)).toBe('aguardando')
    expect(situacaoDaCobranca('PENDING')).toBe('aguardando')
    expect(situacaoDaCobranca('PRE_APPROVED')).toBe('aguardando')
    expect(situacaoDaCobranca('APPROVED')).toBe('aprovada')
    expect(situacaoDaCobranca('COMPLETE')).toBe('aprovada')
    expect(situacaoDaCobranca('DISAPPROVED')).toBe('recusada')
    expect(situacaoDaCobranca('ABORTED_BY_MERCHANT')).toBe('recusada')
    expect(situacaoDaCobranca('CANCELLED')).toBe('cancelada')
    expect(situacaoDaCobranca('CANCELED')).toBe('cancelada')
    expect(situacaoDaCobranca('CANCEL_REQUESTED')).toBe('cancelada')
  })
})

describe('metodoDaBandeira / normalizarNsu', () => {
  it('débito só quando a bandeira é de débito', () => {
    expect(metodoDaBandeira('VISA_CREDITO')).toBe('credit')
    expect(metodoDaBandeira('MASTERCARD_DEBITO')).toBe('debit')
    expect(metodoDaBandeira('ELO_DEBITO')).toBe('debit')
    expect(metodoDaBandeira(null)).toBe('credit')
  })
  it('NSU casa ignorando zeros à esquerda, espaços e caixa', () => {
    expect(normalizarNsu(' 000123 ')).toBe('123')
    expect(normalizarNsu('a1b2-c3')).toBe('A1B2C3')
    expect(normalizarNsu('0')).toBe('0')
    expect(normalizarNsu(null)).toBe('')
  })
})

describe('ações possíveis', () => {
  it('aprovada com fatura e sem split → pode baixar e estornar; não pode cancelar pela API', () => {
    expect(podeBaixarTitulo(base)).toBe(true)
    expect(podeEstornar(base)).toBe(true)
    expect(podeCancelarAntesDaCaptura(base)).toBe(false)
    expect(rotuloDoTitulo(base)).toBe('Aprovada · título em aberto')
  })
  it('já baixada → não baixa de novo, ainda pode estornar', () => {
    const c = { ...base, settled_split_id: 'split-1' }
    expect(podeBaixarTitulo(c)).toBe(false)
    expect(podeEstornar(c)).toBe(true)
    expect(rotuloDoTitulo(c)).toBe('Título baixado')
  })
  it('estornada ou com estorno pedido → nada mais', () => {
    expect(podeEstornar({ ...base, reversed_at: '2026-10-29' })).toBe(false)
    expect(podeEstornar({ ...base, cancel_requested_at: '2026-10-29' })).toBe(false)
    expect(podeBaixarTitulo({ ...base, cancel_requested_at: '2026-10-29' })).toBe(false)
    expect(rotuloDoTitulo({ ...base, settled_split_id: 's', reversed_at: 'x' })).toBe('Baixa estornada')
  })
  it('aguardando sem NSU → cancela pela API; sem fatura → sem baixa', () => {
    const c = { ...base, status: 'PENDING', nsu: null }
    expect(podeCancelarAntesDaCaptura(c)).toBe(true)
    expect(podeBaixarTitulo(c)).toBe(false)
    expect(podeBaixarTitulo({ ...base, invoice_id: null })).toBe(false)
    expect(rotuloDoTitulo({ ...base, invoice_id: null })).toBe('Sem título vinculado')
  })
})
