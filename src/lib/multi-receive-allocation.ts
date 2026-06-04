/**
 * Recebimento múltiplo (Épico B — C3, reunião 04/06/2026).
 *
 * Decisão Q3 do PO: o agrupamento é só do ATO de receber (um pagamento na
 * maquininha) — no financeiro cada fatura mantém seus próprios lançamentos.
 * Implementação: os splits informados no modal são ALOCADOS SEQUENCIALMENTE
 * entre as faturas selecionadas (quita na ordem), e cada fatura é baixada
 * individualmente via processSplitPayment — rastreabilidade preservada.
 *
 * Um split que "atravessa" o limite de uma fatura é dividido: a 1ª parte quita
 * a fatura atual e o restante segue para a próxima (mesmo cartão/NSU — é a
 * mesma transação física na maquininha).
 */

export interface AllocInvoice {
  id:  string
  /** Saldo a receber desta fatura (total - pago). */
  due: number
}

export interface AllocSplit {
  amount: number
  /** Carregado adiante sem alteração (método, cartão, NSU...). */
  [key: string]: unknown
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Distribui os splits entre as faturas em ordem. Retorna um mapa
 * invoice_id → splits alocados (com amounts ajustados).
 *
 * Pré-condição: Σ splits.amount ≈ Σ invoices.due (validado pelo modal).
 * Sobras de centavos por arredondamento ficam na última fatura.
 */
export function allocateSplitsSequentially<S extends AllocSplit>(
  invoices: AllocInvoice[],
  splits: S[],
): Map<string, S[]> {
  const result = new Map<string, S[]>()
  for (const inv of invoices) result.set(inv.id, [])

  let invoiceIdx = 0
  let invoiceRemaining = invoices.length > 0 ? round2(invoices[0].due) : 0

  for (const split of splits) {
    let splitRemaining = round2(split.amount)

    while (splitRemaining > 0.004 && invoiceIdx < invoices.length) {
      const take = round2(Math.min(splitRemaining, invoiceRemaining))
      if (take > 0.004) {
        result.get(invoices[invoiceIdx].id)!.push({ ...split, amount: take })
      }
      splitRemaining   = round2(splitRemaining - take)
      invoiceRemaining = round2(invoiceRemaining - take)

      if (invoiceRemaining <= 0.004) {
        invoiceIdx++
        invoiceRemaining = invoiceIdx < invoices.length ? round2(invoices[invoiceIdx].due) : 0
      }
    }

    // Sobra de centavos do último split → última fatura (fecha a conta)
    if (splitRemaining > 0.004 && invoices.length > 0) {
      const lastId = invoices[invoices.length - 1].id
      const arr = result.get(lastId)!
      if (arr.length > 0) {
        arr[arr.length - 1] = {
          ...arr[arr.length - 1],
          amount: round2(arr[arr.length - 1].amount + splitRemaining),
        }
      } else {
        arr.push({ ...split, amount: splitRemaining })
      }
    }
  }

  return result
}
