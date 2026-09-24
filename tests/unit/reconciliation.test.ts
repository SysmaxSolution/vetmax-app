/**
 * Unit — Pontas de reconciliação (predicados). Auditoria 2026-09-05.
 * Cobre a eliminação de inter-CNPJ, "utilização de crédito", adiantamento como
 * passivo e compra de estoque como ativo.
 */
import {
  isIntercompany, isCreditBalance, isAdvance, isStockPurchase,
  isRealCashMovement, isRecognizedRevenue, netAmount,
} from '@/lib/finance/reconciliation'

describe('reconciliation predicates', () => {
  it('isIntercompany detecta movimento interno', () => {
    expect(isIntercompany({ is_intercompany: true })).toBe(true)
    expect(isIntercompany({ is_intercompany: false })).toBe(false)
    expect(isIntercompany({})).toBe(false)
  })

  it('isCreditBalance detecta utilização de crédito', () => {
    expect(isCreditBalance({ payment_method: 'credit_balance' })).toBe(true)
    expect(isCreditBalance({ payment_method: 'pix' })).toBe(false)
  })

  it('isAdvance detecta adiantamento por categoria (case-insensitive)', () => {
    expect(isAdvance({ category: 'Adiantamento de cliente' })).toBe(true)
    expect(isAdvance({ category: 'adiantamento' })).toBe(true)
    expect(isAdvance({ category: 'Consulta' })).toBe(false)
    expect(isAdvance({})).toBe(false)
  })

  it('isStockPurchase detecta compra vinculada a ordem', () => {
    expect(isStockPurchase({ purchase_order_id: 'po-1' })).toBe(true)
    expect(isStockPurchase({ purchase_order_id: null })).toBe(false)
  })

  it('isRealCashMovement exige pago e exclui inter-CNPJ e crédito', () => {
    expect(isRealCashMovement({ status: 'paid' })).toBe(true)
    expect(isRealCashMovement({ status: 'pending' })).toBe(false)
    expect(isRealCashMovement({ status: 'paid', is_intercompany: true })).toBe(false)
    expect(isRealCashMovement({ status: 'paid', payment_method: 'credit_balance' })).toBe(false)
  })

  it('isRecognizedRevenue: receivable pago, sem adiantamento nem inter-CNPJ', () => {
    expect(isRecognizedRevenue({ type: 'receivable', status: 'paid' })).toBe(true)
    expect(isRecognizedRevenue({ type: 'receivable', status: 'paid', category: 'Adiantamento de cliente' })).toBe(false)
    expect(isRecognizedRevenue({ type: 'receivable', status: 'paid', is_intercompany: true })).toBe(false)
    expect(isRecognizedRevenue({ type: 'payable', status: 'paid' })).toBe(false)
    expect(isRecognizedRevenue({ type: 'receivable', status: 'pending' })).toBe(false)
  })

  it('netAmount subtrai desconto e trata não-números', () => {
    expect(netAmount({ amount: 100, discount: 10 })).toBe(90)
    expect(netAmount({ amount: 100 })).toBe(100)
    expect(netAmount({ amount: NaN as any, discount: 5 })).toBe(-5)
    expect(netAmount({})).toBe(0)
  })
})
