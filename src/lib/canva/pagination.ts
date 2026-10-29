/**
 * Paginação do documento (módulo PURO) — usada pelo LaudoPrintable (print),
 * pelo modal do consultório (preview ao vivo) e por testes.
 *
 *  1. Páginas reais (page 1 + extraPages)
 *  2. Páginas virtuais por overflow de Repeater (maxItemsPerPage)
 *  3. Elementos PINADOS (pin = header | footer | all_pages) definidos na
 *     página 1 são replicados em TODAS as páginas (reais e virtuais)
 *  4. Numeração: pageNumber / totalPages → ctx.doc (tags doc.page etc.)
 */

import type { CanvasState, PageConfig } from './canvas-state'
import { getAllPages } from './canvas-state'
import type { CanvasElement, RepeaterElement } from './elements'
import type { ResolveContext } from './dynamic-tags'
import { readRepeaterItems } from './repeater-data'

/** Página real ou virtual (gerada por overflow do repeater). */
export interface ExpandedPage {
  page: PageConfig
  elements: CanvasElement[]
  /** Map de repeater id → slice de itens. Quando ausente, o repeater
   *  renderiza tudo (comportamento legado). */
  repeaterSlices?: Record<string, { start: number; end: number }>
  /** Etiqueta opcional pra debug ("1", "1 (cont. 2/3)"). */
  label?: string
  /** Índice da página REAL de origem (0 = página 1). */
  sourceIndex: number
  /** Numeração final (1-based) e total — preenchidos por expandPages. */
  pageNumber: number
  totalPages: number
}

export function isPinned(el: CanvasElement): boolean {
  return !!el.pin && el.pin !== 'none'
}

/** Elementos pinados da página 1 (fonte da verdade do cabeçalho/rodapé). */
export function collectPinnedElements(cs: CanvasState): CanvasElement[] {
  return cs.elements.filter(isPinned)
}

/** Expande páginas reais em virtuais quando algum Repeater tem
 *  maxItemsPerPage e mais itens que isso. Cada página virtual herda os
 *  MESMOS elementos da página real. */
export function expandPagesForRepeaterOverflow(
  pages: ReturnType<typeof getAllPages>,
  resolveContext: ResolveContext | undefined,
): ExpandedPage[] {
  const out: ExpandedPage[] = []
  for (const p of pages) {
    const repeaters = p.elements.filter((el): el is RepeaterElement => el.kind === 'repeater')
    // Primeiro repeater paginável da página (múltiplos na MESMA página = evolução futura)
    const paged = repeaters.find(r => r.maxItemsPerPage && r.maxItemsPerPage > 0)
    if (!paged) {
      out.push({ page: p.page, elements: p.elements, sourceIndex: p.index, pageNumber: 0, totalPages: 0 })
      continue
    }
    const items = readRepeaterItems(paged, resolveContext)
    const effectiveTotal = Math.min(items.length, paged.maxLines ?? items.length)
    const max = paged.maxItemsPerPage!
    const slices = Math.max(1, Math.ceil(effectiveTotal / max))
    for (let s = 0; s < slices; s++) {
      out.push({
        page: p.page,
        elements: p.elements,
        repeaterSlices: {
          [paged.id]: { start: s * max, end: Math.min(effectiveTotal, (s + 1) * max) },
        },
        label: slices > 1 ? `${p.index + 1}${s > 0 ? ` (cont. ${s + 1}/${slices})` : ''}` : undefined,
        sourceIndex: p.index,
        pageNumber: 0,
        totalPages: 0,
      })
    }
  }
  return out
}

/** Injeta os elementos pinados da página 1 nas demais páginas (sem
 *  duplicar ids já presentes). A página 1 e suas virtuais já os contêm. */
export function applyPinnedElements(pages: ExpandedPage[], pinned: CanvasElement[]): ExpandedPage[] {
  if (pinned.length === 0) return pages
  return pages.map(p => {
    if (p.sourceIndex === 0) return p
    const present = new Set(p.elements.map(e => e.id))
    const extra = pinned.filter(e => !present.has(e.id))
    if (extra.length === 0) return p
    return { ...p, elements: [...p.elements, ...extra] }
  })
}

/** Pipeline completo: reais → virtuais → pinados → numeração. */
export function expandPages(cs: CanvasState, resolveContext?: ResolveContext): ExpandedPage[] {
  const expanded = expandPagesForRepeaterOverflow(getAllPages(cs), resolveContext)
  const withPins = applyPinnedElements(expanded, collectPinnedElements(cs))
  const total = withPins.length
  return withPins.map((p, i) => ({ ...p, pageNumber: i + 1, totalPages: total }))
}

/** Contexto por página: injeta ctx.doc.page / total_pages preservando o
 *  restante de ctx.doc (verify_code, qr_svg, printed_at…). */
export function withDocPageContext(
  ctx: ResolveContext | undefined,
  page: Pick<ExpandedPage, 'pageNumber' | 'totalPages'>,
): ResolveContext {
  const base = ctx ?? {}
  return {
    ...base,
    doc: {
      ...(base.doc ?? {}),
      page: page.pageNumber,
      total_pages: page.totalPages,
      page_of_total: `${page.pageNumber} de ${page.totalPages}`,
    },
  }
}
