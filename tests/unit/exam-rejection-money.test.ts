import { describe, it, expect } from '@jest/globals'
import {
  planLabCostOnRejection,
  planBilledExamReversal,
  lineBilledAmount,
  type LabPayable,
  type InvoiceSnapshot,
} from '@/lib/exams/rejection-money'

const payable = (o: Partial<LabPayable> = {}): LabPayable => ({ id: 'fe1', amount: 100, status: 'pending', ...o })
const invoice = (o: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot =>
  ({ id: 'inv1', status: 'pending', subtotal: 300, discount: 0, total_amount: 300, paid_at: null, ...o })

describe('planLabCostOnRejection — item 6', () => {
  it('DESLIGADA (padrão) não toca no contas a pagar', () => {
    const p = planLabCostOnRejection(false, payable(), 40)
    expect(p.action).toBe('none')
    expect(p.newAmount).toBe(100)
  })

  it('LIGADA abate o custo do exame rejeitado', () => {
    const p = planLabCostOnRejection(true, payable({ amount: 100 }), 40)
    expect(p.action).toBe('reduce')
    expect(p.newAmount).toBe(60)
  })

  it('LIGADA cancela o título quando o abatimento zera o valor', () => {
    const p = planLabCostOnRejection(true, payable({ amount: 40 }), 40)
    expect(p.action).toBe('cancel')
    expect(p.newAmount).toBe(0)
  })

  it('nunca deixa o título negativo', () => {
    const p = planLabCostOnRejection(true, payable({ amount: 30 }), 80)
    expect(p.action).toBe('cancel')
    expect(p.newAmount).toBe(0)
  })

  it('não mexe em título já PAGO — bloqueia e manda ajustar no Financeiro', () => {
    const p = planLabCostOnRejection(true, payable({ status: 'paid' }), 40)
    expect(p.action).toBe('blocked_paid')
    expect(p.newAmount).toBe(100)
    expect(p.reason).toContain('manualmente')
  })

  it('sem título do laboratório, não faz nada', () => {
    expect(planLabCostOnRejection(true, null, 40).action).toBe('none')
  })

  it('exame sem custo para o laboratório não altera nada', () => {
    expect(planLabCostOnRejection(true, payable(), 0).action).toBe('none')
  })

  it('arredonda para centavos', () => {
    expect(planLabCostOnRejection(true, payable({ amount: 100 }), 33.333).newAmount).toBe(66.67)
  })
})

describe('planBilledExamReversal — item 7', () => {
  it('DESLIGADA (padrão) recusa e mantém a orientação atual', () => {
    const p = planBilledExamReversal(false, invoice(), 80)
    expect(p.action).toBe('refuse')
    expect(p.message).toContain('estorno no Financeiro')
  })

  it('LIGADA estorna a fatura em aberto', () => {
    const p = planBilledExamReversal(true, invoice({ subtotal: 300, total_amount: 300 }), 80)
    expect(p.action).toBe('reverse')
    expect(p.newSubtotal).toBe(220)
    expect(p.newTotal).toBe(220)
    expect(p.clearsInvoice).toBe(false)
  })

  it('LIGADA marca que a fatura zerou quando a linha era o total', () => {
    const p = planBilledExamReversal(true, invoice({ subtotal: 80, total_amount: 80 }), 80)
    expect(p.action).toBe('reverse')
    expect(p.clearsInvoice).toBe(true)
    expect(p.newTotal).toBe(0)
  })

  it('NUNCA mexe em fatura PAGA, mesmo com a flag ligada', () => {
    expect(planBilledExamReversal(true, invoice({ status: 'paid' }), 80).action).toBe('refuse')
  })

  it('NUNCA mexe em fatura com paid_at preenchido, mesmo com status estranho', () => {
    const p = planBilledExamReversal(true, invoice({ status: 'pending', paid_at: '2026-09-01' }), 80)
    expect(p.action).toBe('refuse')
    expect(p.message).toContain('PAGA')
  })

  it('recusa status desconhecido em vez de arriscar', () => {
    expect(planBilledExamReversal(true, invoice({ status: 'cancelled' }), 80).action).toBe('refuse')
  })

  it('recusa quando a fatura não foi encontrada', () => {
    expect(planBilledExamReversal(true, null, 80).action).toBe('refuse')
  })

  it('não deixa o total negativo', () => {
    const p = planBilledExamReversal(true, invoice({ subtotal: 50, total_amount: 50 }), 90)
    expect(p.newTotal).toBe(0)
    expect(p.newSubtotal).toBe(0)
  })
})

describe('lineBilledAmount', () => {
  it('multiplica preço pela quantidade', () => {
    expect(lineBilledAmount(45.5, 2)).toBe(91)
  })
  it('assume quantidade 1 e preço 0 quando ausentes', () => {
    expect(lineBilledAmount(null, null)).toBe(0)
    expect(lineBilledAmount(30, null)).toBe(30)
  })
})
