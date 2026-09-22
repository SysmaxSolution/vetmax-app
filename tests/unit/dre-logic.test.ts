/**
 * Unit — DRE (núcleo puro). Valida a correção do bug crítico (receivable=receita,
 * não 'inflow') + as regras de reconciliação: adiantamento fora da receita,
 * inter-CNPJ eliminado, compra de estoque fora do opex, comissão como despesa
 * variável, e a cascata (margem de contribuição / EBITDA / LAJIR).
 */
import { accumulateDre, dreTotals } from '@/lib/reports/dre-logic'

const SAMPLE = [
  { type: 'receivable', amount: 100, status: 'paid' },
  { type: 'receivable', amount: 250, status: 'paid', category: 'Adiantamento de cliente' },
  { type: 'receivable', amount: 50,  status: 'paid', is_intercompany: true },
  { type: 'payable',    amount: 30,  status: 'paid', category: 'commission' },
  { type: 'payable',    amount: 20,  status: 'paid', category: 'Impostos ISS' },
  { type: 'payable',    amount: 40,  status: 'paid', category: 'Aluguel' },
  { type: 'payable',    amount: 200, status: 'paid', category: 'Fornecedores', purchase_order_id: 'po-1' },
  { type: 'payable',    amount: 15,  status: 'paid', category: 'Depreciação' },
]

describe('accumulateDre', () => {
  it('receita = soma de receivable (bug corrigido: não é inflow)', () => {
    expect(accumulateDre([{ type: 'receivable', amount: 100, status: 'paid' }]).receita).toBe(100)
  })
  it('adiantamento NÃO entra na receita (é passivo)', () => {
    expect(accumulateDre([{ type: 'receivable', amount: 250, status: 'paid', category: 'Adiantamento de cliente' }]).receita).toBe(0)
  })
  it('inter-CNPJ é eliminado de receita e despesa', () => {
    const b = accumulateDre([
      { type: 'receivable', amount: 50, status: 'paid', is_intercompany: true },
      { type: 'payable',    amount: 50, status: 'paid', is_intercompany: true },
    ])
    expect(b.receita).toBe(0)
    expect(b.desp_op).toBe(0)
  })
  it('compra de estoque (purchase_order_id) fica fora do opex', () => {
    const b = accumulateDre([{ type: 'payable', amount: 200, status: 'paid', category: 'Fornecedores', purchase_order_id: 'po-1' }])
    expect(b.desp_op).toBe(0)
  })
  it('comissão vira despesa variável, imposto vira dedução', () => {
    const b = accumulateDre(SAMPLE)
    expect(b.receita).toBe(100)
    expect(b.deducoes).toBe(20)
    expect(b.desp_var).toBe(30)
    expect(b.desp_op).toBe(40)
    expect(b.amort).toBe(15)
  })
})

describe('dreTotals (cascata)', () => {
  it('calcula a cascata com CMV por consumo', () => {
    const t = dreTotals(accumulateDre(SAMPLE), 25)
    expect(t.receita_liquida).toBe(80)   // 100 - 20
    expect(t.lucro_bruto).toBe(55)       // 80 - 25
    expect(t.margem_contrib).toBe(25)    // 55 - 30
    expect(t.ebitda).toBe(-15)           // 25 - 40
    expect(t.lajir).toBe(-30)            // -15 - 15
  })
  it('tudo zero quando não há lançamentos', () => {
    const t = dreTotals(accumulateDre([]), 0)
    expect(t.receita_bruta).toBe(0)
    expect(t.lajir).toBe(0)
  })
})
