/**
 * Cálculo puro do total de um documento de Faturamento (orçamento/NFS-e).
 * Módulo SEM 'use server' — funções síncronas não podem viver em arquivo de
 * server actions (o Next exige que todo export de 'use server' seja async).
 * Float-safe: arredonda por linha antes de somar.
 */

export interface RawItem {
  quantity:   number
  unit_price: number
}

export function computeBillingTotal(items: RawItem[]): number {
  const total = items.reduce((s, it) => {
    const q = Number(it.quantity) || 0
    const p = Number(it.unit_price) || 0
    return s + Math.round(q * p * 100) / 100
  }, 0)
  return Math.round(total * 100) / 100
}
