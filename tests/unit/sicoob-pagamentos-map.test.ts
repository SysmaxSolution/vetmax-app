/** Unit — mapeadores da API Sicoob Pagamentos (DDA + pagamento). */
import { mapDdaResponse, buildPagamentoPayload, extractDdaList } from '@/lib/integrations/sicoob-pagamentos-map'

describe('DDA', () => {
  it('extrai lista de vários envelopes', () => {
    expect(extractDdaList({ resultado: [{ a: 1 }] })).toHaveLength(1)
    expect(extractDdaList({ boletos: [{ a: 1 }, { b: 2 }] })).toHaveLength(2)
    expect(extractDdaList([{ a: 1 }])).toHaveLength(1)
    expect(extractDdaList({})).toHaveLength(0)
  })
  it('mapeia campos do DDA para DdaBoleto', () => {
    const r = mapDdaResponse({ resultado: [{
      linhaDigitavel: '75690.00001 12345.678901 00000.100115 1 99990000015000',
      nomeBeneficiario: 'Fornecedor X LTDA', numeroCpfCnpjBeneficiario: '12345678000199',
      valor: 150.5, dataVencimento: '20/09/2026', seuNumero: 'NF-123',
    }] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      beneficiary: 'Fornecedor X LTDA', beneficiary_doc: '12345678000199',
      amount: 150.5, due_date: '2026-09-20', document: 'NF-123',
    })
    expect(r[0].barcode).toContain('75690')
  })
})

describe('buildPagamentoPayload', () => {
  it('monta o corpo com date (agendamento) e debtorAccount', () => {
    const p: any = buildPagamentoPayload({
      identificadorConsulta: 'hash123', valor: 152.3, dataPagamento: '2026-09-24',
      pagadorNome: 'Fornecedor', pagadorCpfCnpj: '123.456.789-00', observacao: 'PAGFOR',
      conta: { agencia: 4321, conta: 123456 },
    })
    expect(p.valorBoleto).toBe(152.3)
    expect(p.amount).toBe(152.3)
    expect(p.date).toBe('2026-09-24')
    expect(p.numeroCpfCnpjPortador).toBe('12345678900')
    expect(p.debtorAccount).toEqual({ issuer: 4321, number: 123456, accountType: 0, personType: 0 })
    expect(p.aceitaValorDivergente).toBe(false)
  })
})
