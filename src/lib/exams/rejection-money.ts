// Caminho do DINHEIRO na rejeição de exame — lógica PURA (sem I/O, sem
// 'use server'). Cobre os dois pontos que a clínica passa a configurar:
//
//  (6) `cancela_custo_lab_na_recusa` — o contas a PAGAR gerado no envio ao
//      laboratório parceiro continua devido quando o exame volta não realizado?
//  (7) `estorna_exame_faturado_na_recusa` — rejeitar uma linha JÁ FATURADA
//      estorna a fatura automaticamente ou é recusado (comportamento atual)?
//
// Em ambos, o default preserva o comportamento de hoje e nada é feito em
// documento já PAGO/baixado sem recusa explícita + trilha.

const money = (n: number) => Math.round(n * 100) / 100

// ─── (6) Custo do laboratório parceiro ───────────────────────────────────────

export type LabCostAction = 'none' | 'reduce' | 'cancel' | 'blocked_paid'

export interface LabPayable {
  id: string
  amount: number
  /** status do financial_entries: 'pending' | 'paid' | 'cancelled' … */
  status: string
}

export interface LabCostPlan {
  action: LabCostAction
  /** Novo valor do título quando action === 'reduce'. */
  newAmount: number
  /** Explicação para a trilha de auditoria / retorno da action. */
  reason: string
}

/**
 * Decide o que fazer com o contas a pagar do laboratório quando uma linha de
 * exame é rejeitada.
 *
 * @param enabled  flow_config.cancela_custo_lab_na_recusa
 * @param payable  título do laboratório (null quando não existe)
 * @param rejectedCost custo do laboratório correspondente À LINHA rejeitada
 */
export function planLabCostOnRejection(
  enabled: boolean,
  payable: LabPayable | null,
  rejectedCost: number,
): LabCostPlan {
  if (!enabled) {
    return { action: 'none', newAmount: payable?.amount ?? 0, reason: 'Configuração da clínica: o custo do laboratório continua devido mesmo com o exame não realizado.' }
  }
  if (!payable) {
    return { action: 'none', newAmount: 0, reason: 'Não há contas a pagar do laboratório vinculado a este atendimento.' }
  }
  if (payable.status !== 'pending') {
    return {
      action: 'blocked_paid',
      newAmount: payable.amount,
      reason: `O contas a pagar do laboratório já está com status "${payable.status}" — o ajuste precisa ser feito manualmente no Financeiro.`,
    }
  }
  const cost = money(Math.max(0, rejectedCost))
  if (cost <= 0) {
    return { action: 'none', newAmount: payable.amount, reason: 'O exame rejeitado não gera custo para o laboratório parceiro.' }
  }
  const next = money(payable.amount - cost)
  if (next <= 0) {
    return { action: 'cancel', newAmount: 0, reason: 'Exame não realizado: o custo do laboratório deixou de ser devido e o título foi cancelado.' }
  }
  return { action: 'reduce', newAmount: next, reason: `Exame não realizado: custo de R$ ${cost.toFixed(2)} abatido do título do laboratório.` }
}

// ─── (7) Estorno de exame já faturado ────────────────────────────────────────

export type ReversalAction = 'refuse' | 'reverse'

export interface InvoiceSnapshot {
  id: string
  status: string            // 'pending' | 'paid' | …
  subtotal: number
  discount: number
  total_amount: number
  paid_at: string | null
}

export interface ReversalPlan {
  action: ReversalAction
  newSubtotal: number
  newTotal: number
  /** A fatura zerou — a pendência do caixa deve sair junto. */
  clearsInvoice: boolean
  message: string
}

/**
 * Decide se dá para estornar automaticamente a linha faturada.
 *
 * Regras inegociáveis:
 *  - Flag desligada → recusa (comportamento atual: estorno manual no Financeiro).
 *  - Fatura PAGA/baixada → recusa SEMPRE, mesmo com a flag ligada. Mexer em
 *    dinheiro já recebido não pode acontecer por efeito colateral de uma
 *    rejeição de exame.
 *  - Valor da linha maior que o total da fatura → não deixa o total negativo.
 */
export function planBilledExamReversal(
  enabled: boolean,
  invoice: InvoiceSnapshot | null,
  lineAmount: number,
): ReversalPlan {
  const base: Omit<ReversalPlan, 'action' | 'message'> = {
    newSubtotal: invoice?.subtotal ?? 0,
    newTotal: invoice?.total_amount ?? 0,
    clearsInvoice: false,
  }
  if (!enabled) {
    return { ...base, action: 'refuse', message: 'Este exame já foi faturado. Faça o estorno no Financeiro antes de marcar como não realizado.' }
  }
  if (!invoice) {
    return { ...base, action: 'refuse', message: 'A fatura vinculada a este exame não foi encontrada. Faça o estorno manualmente no Financeiro.' }
  }
  if (invoice.status === 'paid' || invoice.paid_at) {
    return { ...base, action: 'refuse', message: 'A fatura deste exame já está PAGA/baixada. O estorno automático não mexe em dinheiro já recebido — faça o estorno manualmente no Financeiro.' }
  }
  if (invoice.status !== 'pending') {
    return { ...base, action: 'refuse', message: `A fatura está com status "${invoice.status}" e não pode ser ajustada automaticamente. Faça o estorno manualmente no Financeiro.` }
  }

  const amount = money(Math.max(0, lineAmount))
  const newSubtotal = money(Math.max(0, invoice.subtotal - amount))
  const newTotal = money(Math.max(0, invoice.total_amount - amount))
  return {
    action: 'reverse',
    newSubtotal,
    newTotal,
    clearsInvoice: newTotal <= 0,
    message: `Exame não realizado: R$ ${amount.toFixed(2)} estornado da fatura em aberto.`,
  }
}

/** Valor cobrado de uma linha de serviço (snapshot imutável). */
export function lineBilledAmount(priceSnapshot: number | null | undefined, quantity: number | null | undefined): number {
  return money(Number(priceSnapshot ?? 0) * Number(quantity ?? 1))
}
