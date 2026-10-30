/**
 * Conversão entre as unidades do produto.
 *
 * O saldo é contado numa unidade só, a menor (`stock_items.unit` — mL, por
 * exemplo). O mundo fala com esse saldo de três jeitos, e cada um diz quantas
 * unidades de saldo vale:
 *
 *   compra  1 CX  = 100 mL   (factor_purchase = 100)
 *   uso     1 dose = 0,1 mL  (factor_use      = 0.1)
 *   venda   1 FR  = 10 mL    (factor_sale     = 10)
 *
 * Fator nulo ou ausente significa "igual à unidade de saldo" — é o
 * comportamento que o sistema sempre teve, e é o que vale para a imensa
 * maioria dos produtos (uma caixa de luva é comprada, usada e vendida como
 * caixa).
 */

export interface UnidadesDoItem {
  /** Unidade em que o saldo é contado. */
  unit:             string | null
  unit_purchase?:   string | null
  factor_purchase?: number | null
  unit_use?:        string | null
  factor_use?:      number | null
  unit_sale?:       string | null
  factor_sale?:     number | null
  /** Fallback histórico do fator de compra (migration 0404). */
  units_per_package?: number | null
}

export type Papel = 'purchase' | 'use' | 'sale'

/** Fator positivo ou 1. Zero e negativo são tratados como ausentes. */
function positivo(v: number | null | undefined): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Quantas unidades de saldo valem 1 unidade daquele papel. */
export function fatorDe(item: UnidadesDoItem, papel: Papel): number {
  if (papel === 'purchase') {
    return positivo(item.factor_purchase) ?? positivo(item.units_per_package) ?? 1
  }
  if (papel === 'use')  return positivo(item.factor_use)  ?? 1
  return positivo(item.factor_sale) ?? 1
}

/** Rótulo da unidade daquele papel; na falta, a unidade de saldo. */
export function unidadeDe(item: UnidadesDoItem, papel: Papel): string {
  const propria = papel === 'purchase' ? item.unit_purchase
    : papel === 'use' ? item.unit_use : item.unit_sale
  return (propria ?? '').trim() || (item.unit ?? 'un')
}

/** Converte uma quantidade informada naquele papel para unidades de saldo. */
export function paraSaldo(item: UnidadesDoItem, quantidade: number, papel: Papel): number {
  const q = Number(quantidade)
  if (!Number.isFinite(q)) return 0
  return arredonda(q * fatorDe(item, papel))
}

/** Converte um saldo (na unidade de saldo) para a leitura daquele papel. */
export function doSaldo(item: UnidadesDoItem, saldo: number, papel: Papel): number {
  const s = Number(saldo)
  if (!Number.isFinite(s)) return 0
  return arredonda(s / fatorDe(item, papel))
}

/** Três casas: a mesma precisão de `stock_items.quantity` (numeric(10,3)). */
function arredonda(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** `true` quando o produto realmente usa unidades diferentes. */
export function temConversao(item: UnidadesDoItem): boolean {
  return fatorDe(item, 'purchase') !== 1
      || fatorDe(item, 'use') !== 1
      || fatorDe(item, 'sale') !== 1
}

export interface LeituraDeSaldo {
  papel:     Papel | 'balance'
  rotulo:    string
  unidade:   string
  quantidade: number
}

/**
 * As três leituras do mesmo saldo, como a clínica pediu para ver: o total, o
 * que dá para aplicar e o que dá para vender. Papéis sem conversão própria
 * são omitidos — repetir o mesmo número três vezes só polui a tela.
 */
export function leiturasDoSaldo(item: UnidadesDoItem, saldo: number): LeituraDeSaldo[] {
  const total: LeituraDeSaldo = {
    papel: 'balance', rotulo: 'Saldo total',
    unidade: item.unit ?? 'un', quantidade: arredonda(Number(saldo) || 0),
  }
  const linhas = [total]

  if (fatorDe(item, 'use') !== 1) {
    linhas.push({
      papel: 'use', rotulo: 'Para uso',
      unidade: unidadeDe(item, 'use'), quantidade: doSaldo(item, saldo, 'use'),
    })
  }
  if (fatorDe(item, 'sale') !== 1) {
    linhas.push({
      papel: 'sale', rotulo: 'Para venda',
      unidade: unidadeDe(item, 'sale'), quantidade: doSaldo(item, saldo, 'sale'),
    })
  }
  return linhas
}

/** Preço por unidade de saldo a partir do preço de uma unidade de compra. */
export function precoPorUnidadeDeSaldo(item: UnidadesDoItem, precoDaCompra: number): number {
  const f = fatorDe(item, 'purchase')
  const p = Number(precoDaCompra)
  if (!Number.isFinite(p)) return 0
  return Math.round((p / f) * 10000) / 10000
}

/** Frase curta explicando a conversão, para a tela de cadastro. */
export function explicarConversao(item: UnidadesDoItem): string | null {
  if (!temConversao(item)) return null
  const saldo = item.unit ?? 'un'
  const partes: string[] = []
  const fc = fatorDe(item, 'purchase')
  if (fc !== 1) partes.push(`1 ${unidadeDe(item, 'purchase')} entra como ${fc} ${saldo}`)
  const fu = fatorDe(item, 'use')
  if (fu !== 1) partes.push(`cada ${unidadeDe(item, 'use')} aplicado tira ${fu} ${saldo}`)
  const fv = fatorDe(item, 'sale')
  if (fv !== 1) partes.push(`cada ${unidadeDe(item, 'sale')} vendido tira ${fv} ${saldo}`)
  return partes.join(' · ')
}
