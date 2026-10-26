import { filtrarBoletos, FILTRO_VAZIO, filtroAtivo, documentoFormatado } from '@/lib/financial/pagfor-filtro'
import type { DdaMatchRow } from '@/types/pagfor'

const linha = (p: Partial<DdaMatchRow['boleto']>, extra: Partial<DdaMatchRow> = {}): DdaMatchRow => ({
  boleto: { barcode: null, beneficiary: null, beneficiary_doc: null, amount: null, due_date: null, document: null, raw: '', ...p },
  status: 'not_in_system', entry_id: null, entry_scheduled: null, entry_bank_payment_id: null, ...extra,
})

const ROWS: DdaMatchRow[] = [
  linha({ beneficiary: 'L.P.S. AGROFARMA LTDA', beneficiary_doc: '04852370000108', amount: 436.75, due_date: '2026-11-20', document: 'NF 202142' }, { status: 'in_system', entry_id: 'e1' }),
  linha({ beneficiary: 'VETNIL INDÚSTRIA', beneficiary_doc: '61286655000111', amount: 1200, due_date: '2026-11-05', barcode: '23793381286000000012345678901234567890123456' }),
  linha({ beneficiary: 'COPEL ENERGIA', beneficiary_doc: '04368898000106', amount: 89.9, due_date: '2026-10-30' }, { status: 'in_system', entry_id: 'e3', entry_scheduled: '2026-10-29', entry_bank_payment_id: 'p9' }),
  linha({ beneficiary: 'FORNECEDOR IGNORADO', beneficiary_doc: '11111111000191', amount: 50, due_date: '2026-11-10' }),
]
const PERSISTIDOS = [undefined, undefined, undefined, { dismissed_at: '2026-10-20T10:00:00Z' }]

describe('filtrarBoletos', () => {
  it('sem filtro devolve tudo, na ordem', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, FILTRO_VAZIO)).toEqual([0, 1, 2, 3])
    expect(filtroAtivo(FILTRO_VAZIO)).toBe(false)
  })

  it('texto: acha pelo nome sem acento, sem pontuação e em qualquer caixa', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, texto: 'agrofarma' })).toEqual([0])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, texto: 'industria' })).toEqual([1])   // VETNIL INDÚSTRIA
  })

  it('texto: também acha pelo nº do documento e pelo código de barras', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, texto: '202142' })).toEqual([0])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, texto: '2379338128' })).toEqual([1])
  })

  it('CNPJ: parcial, com ou sem pontuação', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, cnpj: '04.852.370' })).toEqual([0])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, cnpj: '0001-06' })).toEqual([2])
  })

  it('vencimento: faixa inclusiva', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, vencDe: '2026-11-01', vencAte: '2026-11-10' })).toEqual([1, 3])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, vencAte: '2026-10-31' })).toEqual([2])
  })

  it('valor: faixa, aceitando vírgula', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, valorMin: '100', valorMax: '500' })).toEqual([0])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, valorMin: '1.200,00' })).toEqual([1])
  })

  it('situação: lançados, não lançados, agendados e ignorados', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, situacao: 'lancados' })).toEqual([0, 2])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, situacao: 'nao_lancados' })).toEqual([1])   // o ignorado fica de fora
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, situacao: 'agendados' })).toEqual([2])
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, situacao: 'ignorados' })).toEqual([3])
  })

  it('combina filtros', () => {
    expect(filtrarBoletos(ROWS, PERSISTIDOS, { ...FILTRO_VAZIO, texto: 'a', vencDe: '2026-11-01', situacao: 'lancados' })).toEqual([0])
  })
})

describe('documentoFormatado', () => {
  it('formata CNPJ e CPF; deixa o resto como veio', () => {
    expect(documentoFormatado('04852370000108')).toBe('04.852.370/0001-08')
    expect(documentoFormatado('12345678909')).toBe('123.456.789-09')
    expect(documentoFormatado('ABC')).toBe('ABC')
    expect(documentoFormatado(null)).toBe('')
  })
})
