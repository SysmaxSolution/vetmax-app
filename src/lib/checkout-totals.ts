/**
 * Cálculo do "Total a Pagar" do caixa (CheckoutModal) — extraído como função
 * pura para teste unitário.
 *
 * Fix B2 (reunião 04/06/2026): com cobertura de convênio aplicada, o caixa
 * cobra apenas a coparticipação (charge_now). O repasse (A Receber Petlove) e
 * a parcela que a Petlove cobra direto no cartão do tutor saem do total —
 * ficam como pending source='petlove_open', baixado pela remessa fechada.
 */

export interface CheckoutInsuranceSplit {
  /** Coparticipação — o que o tutor paga AGORA no caixa. */
  charge_now:        number
  /** Repasse — o que a Petlove paga à clínica (A Receber). */
  receivable:        number
  /** O que a Petlove cobra direto no cartão do tutor. */
  deferred_provider: number
  /** Desconto contábil que a clínica oferece ao plano. */
  clinic_discount:   number
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function computeCheckoutTotals(params: {
  /** Subtotal dinâmico dos itens (com edições de preço do caixa). */
  subtotal:         number
  /** Desconto já persistido na invoice (invoices.discount). */
  existingDiscount: number
  /** Valor já recebido (invoices.paid_amount). */
  existingPaid:     number
  /** Desconto manual digitado nesta operação (R$, já resolvido de %). */
  manualDiscount:   number
  /** Split de convênio aplicado nesta operação (null = particular cheio). */
  insuranceSplit?:  CheckoutInsuranceSplit | null
}): { totalAmount: number; totalDue: number } {
  const insuranceDiscount = params.insuranceSplit?.clinic_discount ?? 0
  const insuranceDeferred =
    (params.insuranceSplit?.receivable ?? 0) +
    (params.insuranceSplit?.deferred_provider ?? 0)

  const totalAmount = Math.max(
    0,
    params.subtotal - params.existingDiscount - params.manualDiscount - insuranceDiscount - insuranceDeferred,
  )
  const totalDue = Math.max(0, totalAmount - params.existingPaid)
  return { totalAmount: round2(totalAmount), totalDue: round2(totalDue) }
}
