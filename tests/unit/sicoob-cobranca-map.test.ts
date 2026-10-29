/** Unit — mapeadores puros da Cobrança Bancária Sicoob. */
import { buildBoletoPayload, parseBoletoResponse } from '@/lib/integrations/sicoob-cobranca-map'

const cfg = { numeroCliente: 25546454, numeroContaCorrente: 12345, codigoModalidade: 1 }
const pagador = { cpfCnpj: '123.456.789-09', nome: 'Tutor Teste', endereco: 'Rua A, 100', bairro: 'Centro', cidade: 'Ribeirão Preto', cep: '14000-000', uf: 'sp', email: 'a@b.com' }

describe('buildBoletoPayload', () => {
  it('monta payload base sem encargos', () => {
    const p: any = buildBoletoPayload(cfg, { seuNumero: 'OS-1', valor: 150, dataVencimento: '2026-09-20', pagador })
    expect(p.numeroCliente).toBe(25546454)
    expect(p.codigoEspecieDocumento).toBe('DM')
    expect(p.valor).toBe(150)
    expect(p.tipoMulta).toBe(0)
    expect(p.tipoJurosMora).toBe(3)   // isento
    expect(p.tipoDesconto).toBe(0)
    expect(p.pagador.numeroCpfCnpj).toBe('12345678909') // só dígitos
    expect(p.pagador.cep).toBe('14000000')
    expect(p.pagador.uf).toBe('SP')
  })
  it('aplica multa, juros e desconto quando informados', () => {
    const p: any = buildBoletoPayload(cfg, {
      seuNumero: 'OS-2', valor: 200, dataVencimento: '2026-10-01', pagador,
      multaPercent: 2, jurosMesPercent: 1, descontoValor: 10, descontoData: '2026-09-25',
    })
    expect(p.tipoMulta).toBe(2); expect(p.valorMulta).toBe(2)
    expect(p.tipoJurosMora).toBe(2); expect(p.valorJurosMora).toBe(1)
    expect(p.tipoDesconto).toBe(1); expect(p.valorPrimeiroDesconto).toBe(10); expect(p.dataPrimeiroDesconto).toBe('2026-09-25')
  })
  it('limita mensagens a 5 linhas', () => {
    const p: any = buildBoletoPayload(cfg, { seuNumero: 'OS-3', valor: 1, dataVencimento: '2026-10-01', pagador, mensagens: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(p.mensagensInstrucao).toHaveLength(5)
  })
})

describe('parseBoletoResponse', () => {
  it('extrai campos com envelope resultado', () => {
    const r = parseBoletoResponse({ resultado: { nossoNumero: 999, linhaDigitavel: '000', codigoBarras: 'BC', pdfBoleto: 'base64==' } })
    expect(r.nossoNumero).toBe('999')
    expect(r.linhaDigitavel).toBe('000')
    expect(r.pdfBase64).toBe('base64==')
  })
  it('tolera resposta sem envelope', () => {
    const r = parseBoletoResponse({ nossoNumero: '1', qrCode: 'pix' })
    expect(r.nossoNumero).toBe('1')
    expect(r.pixCopiaECola).toBe('pix')
  })
})
