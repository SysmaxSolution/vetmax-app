// Predicados puros de reconciliação contábil (auditoria 2026-09-05).
// Centralizam as regras usadas em DRE, fluxo, CompanyOverview e caixa para que
// os números fechem entre si. SEM efeitos colaterais — testável isoladamente.

export interface EntryLike {
  type?:              string | null   // 'receivable' | 'payable'
  status?:            string | null   // 'pending' | 'paid' | 'cancelled'
  amount?:            number | null
  discount?:          number | null
  category?:          string | null
  payment_method?:    string | null
  is_intercompany?:   boolean | null
  purchase_order_id?: string | null
}

/** Movimento interno entre CNPJs — eliminado de qualquer soma consolidada. */
export function isIntercompany(e: EntryLike): boolean {
  return Boolean(e.is_intercompany)
}

/** "Utilização de crédito" — abatimento, não dinheiro novo no caixa. */
export function isCreditBalance(e: EntryLike): boolean {
  return e.payment_method === 'credit_balance'
}

/** Adiantamento é passivo (crédito do cliente), não receita quando recebido. */
export function isAdvance(e: EntryLike): boolean {
  return (e.category ?? '').toLowerCase().includes('adiantamento')
}

/** Compra de estoque (vinculada a ordem) = aquisição de ativo, não despesa. */
export function isStockPurchase(e: EntryLike): boolean {
  return Boolean(e.purchase_order_id)
}

/** Entra no CAIXA real (dinheiro que efetivamente passou)? */
export function isRealCashMovement(e: EntryLike): boolean {
  return e.status === 'paid' && !isIntercompany(e) && !isCreditBalance(e)
}

/** Conta como RECEITA reconhecida no DRE (regime de caixa)? */
export function isRecognizedRevenue(e: EntryLike): boolean {
  return e.type === 'receivable' && e.status === 'paid'
    && !isIntercompany(e) && !isAdvance(e)
}

/** Valor líquido (amount − discount), protegido contra não-números. */
export function netAmount(e: EntryLike): number {
  const a = Number(e.amount ?? 0)
  const d = Number(e.discount ?? 0)
  const v = (Number.isFinite(a) ? a : 0) - (Number.isFinite(d) ? d : 0)
  return Math.round(v * 100) / 100
}
