/**
 * Taxa administrativa sobre coparticipação Petlove (Épico A, reunião
 * 04/06/2026) — núcleo PURO de cálculo, testado em unit.
 *
 * Regras de negócio (decisões do PO):
 *   - O % vem do CADASTRO DO SERVIÇO (stock_items.insurance_card_interest_percent),
 *     nunca do cadastro de cartões (lá a taxa é só para conciliação de repasse).
 *   - Incide APENAS sobre a coparticipação — o repasse Petlove e itens
 *     particulares na mesma fatura nunca levam taxa.
 *   - Aplicada SOMENTE quando a forma de pagamento é cartão (crédito/débito);
 *     dinheiro/PIX zeram a taxa.
 *   - Q5: arredondamento POR ITEM — juros_item = ROUND(copay_item × %/100, 2).
 *   - Q1: split misto → proporcional ao valor passado no cartão.
 *
 * Transparência (refinamento do PO): o operador faz a conta de cabeça
 * ("R$ 2,50 a cada R$ 25" = 10%), então a UI exibe o % junto do valor:
 * "Coparticipação Petlove: R$ 30,21 (+ R$ 3,02 Taxa Adm Cartão (10%))".
 */

export interface CopayInterestItem {
  /** Coparticipação da linha (copay_snapshot × quantity). */
  copay:   number
  /** % de taxa do serviço (stock_items.insurance_card_interest_percent). */
  percent: number
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Juros TOTAL da fatura quando a coparticipação inteira for paga no cartão.
 * Q5: arredonda por item e soma.
 */
export function computeFullCopayInterest(items: CopayInterestItem[]): number {
  let total = 0
  for (const it of items) {
    const copay   = Number(it.copay)   || 0
    const percent = Number(it.percent) || 0
    if (copay <= 0 || percent <= 0) continue
    total += round2((copay * percent) / 100)
  }
  return round2(total)
}

/**
 * Q1 — split misto: a taxa de um split de cartão é proporcional a quanto do
 * total base aquele split cobre. Caso típico (fatura só de coparticipação,
 * um cartão cobrindo tudo) → retorna o juros cheio.
 *
 * @param fullInterest juros total da fatura (computeFullCopayInterest)
 * @param baseTotal    total base a receber (sem juros)
 * @param splitAmount  valor base coberto por este split de cartão
 */
export function proportionalCardInterest(
  fullInterest: number,
  baseTotal: number,
  splitAmount: number,
): number {
  if (fullInterest <= 0 || baseTotal <= 0 || splitAmount <= 0) return 0
  const share = Math.min(1, splitAmount / baseTotal)
  return round2(fullInterest * share)
}

/**
 * % efetivo agregado (para o rótulo "(10%)" da UI). Quando todos os itens têm
 * o mesmo %, retorna esse % exato — o operador reconhece de bate-olho.
 */
export function effectiveInterestPercent(items: CopayInterestItem[]): number {
  const relevant = items.filter(it => (Number(it.copay) || 0) > 0 && (Number(it.percent) || 0) > 0)
  if (relevant.length === 0) return 0
  const allSame = relevant.every(it => Number(it.percent) === Number(relevant[0].percent))
  if (allSame) return Number(relevant[0].percent)
  const copayTotal = relevant.reduce((s, it) => s + Number(it.copay), 0)
  if (copayTotal <= 0) return 0
  return round2((computeFullCopayInterest(relevant) / copayTotal) * 100)
}
