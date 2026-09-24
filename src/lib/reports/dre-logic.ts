// Núcleo puro do DRE (regime de caixa). Classifica lançamentos pagos em buckets
// e monta a cascata. Aplica as regras de reconciliação (auditoria 2026-09-05):
// adiantamento = passivo; inter-CNPJ eliminado; compra de estoque vira CMV no
// consumo (não despesa); comissão = despesa variável. SEM I/O — testável.

import { isIntercompany, isAdvance, isStockPurchase, type EntryLike } from '@/lib/finance/reconciliation'

export interface DreBuckets {
  receita:   number
  deducoes:  number
  desp_var:  number   // comissões, taxas variáveis
  desp_op:   number
  amort:     number
}

export interface DreTotals {
  receita_bruta:    number
  deducoes:         number
  receita_liquida:  number
  cmv:              number
  lucro_bruto:      number
  desp_var:         number
  margem_contrib:   number
  desp_op:          number
  ebitda:           number
  amort:            number
  lajir:            number
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Soma os lançamentos PAGOS nos buckets do DRE, já aplicando as eliminações. */
export function accumulateDre(entries: EntryLike[]): DreBuckets {
  const b: DreBuckets = { receita: 0, deducoes: 0, desp_var: 0, desp_op: 0, amort: 0 }
  for (const e of entries) {
    if (isIntercompany(e)) continue
    const amt = Number(e.amount ?? 0)
    if (!Number.isFinite(amt)) continue
    const cat = (e.category ?? '').toLowerCase()
    if (e.type === 'receivable') {
      if (isAdvance(e)) continue           // passivo → receita só no consumo
      b.receita += amt
    } else {
      if (isStockPurchase(e)) continue     // ativo → vira CMV no consumo
      if (cat.includes('deduc') || cat.includes('imposto') || cat.includes('tax')) b.deducoes += amt
      else if (cat.includes('comiss') || cat.includes('commission'))               b.desp_var += amt
      else if (cat.includes('amort') || cat.includes('deprec'))                     b.amort    += amt
      else if (cat.includes('cmv') || cat.includes('custo dos produtos'))          { /* CMV vem do consumo */ }
      else                                                                          b.desp_op  += amt
    }
  }
  b.receita = r2(b.receita); b.deducoes = r2(b.deducoes); b.desp_var = r2(b.desp_var)
  b.desp_op = r2(b.desp_op); b.amort = r2(b.amort)
  return b
}

/** Monta a cascata do DRE a partir dos buckets + CMV por consumo. */
export function dreTotals(b: DreBuckets, cmv: number): DreTotals {
  const receita_liquida = r2(b.receita - b.deducoes)
  const lucro_bruto     = r2(receita_liquida - cmv)
  const margem_contrib  = r2(lucro_bruto - b.desp_var)
  const ebitda          = r2(margem_contrib - b.desp_op)
  const lajir           = r2(ebitda - b.amort)
  return {
    receita_bruta: b.receita, deducoes: b.deducoes, receita_liquida,
    cmv: r2(cmv), lucro_bruto, desp_var: b.desp_var, margem_contrib,
    desp_op: b.desp_op, ebitda, amort: b.amort, lajir,
  }
}
