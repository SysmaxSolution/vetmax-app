/**
 * Leitura dos itens de um Repeater a partir do ResolveContext (módulo PURO,
 * sem React) — compartilhado pelo RepeaterRenderer e pela paginação
 * (expandPages), que precisam enxergar EXATAMENTE a mesma lista.
 */

import type { RepeaterElement } from './elements'
import type { ResolveContext } from './dynamic-tags'

export function readRepeaterSource(source: RepeaterElement['source'], ctx?: ResolveContext): Record<string, unknown>[] {
  if (!ctx) return []
  const consultation = ctx.consultation as Record<string, unknown> | undefined
  if (!consultation) return []
  const list = consultation[source]
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

/** Fonte + filtro do elemento. */
export function readRepeaterItems(e: RepeaterElement, ctx?: ResolveContext): Record<string, unknown>[] {
  const items = readRepeaterSource(e.source, ctx)
  if (!e.filter?.field) return items
  const { field, equals, negate } = e.filter
  return items.filter(item => (item[field] === equals) !== Boolean(negate))
}
