/**
 * Fase 1 — paginação: elementos pinados (header/footer/all_pages) em todas
 * as páginas (reais + virtuais do repeater) e resolução de doc.page /
 * doc.total_pages / tokens inline em texto livre.
 */

import { defaultCanvasState, type CanvasState } from '@/lib/canva/canvas-state'
import {
  makeTextElement, makeDynamicTagElement, makeRepeaterElement,
} from '@/lib/canva/elements'
import {
  expandPages, collectPinnedElements, withDocPageContext, isPinned,
} from '@/lib/canva/pagination'
import { resolveTagValue, resolveInlineTags, findTag, tagsByGroup } from '@/lib/canva/dynamic-tags'

function buildState(): CanvasState {
  const header = makeTextElement({ content: 'CLÍNICA X', pin: 'header', box: { x: 5, y: 2, w: 90, h: 4 } })
  const footer = makeTextElement({ content: 'Pág. {{doc.page}} de {{doc.total_pages}}', pin: 'footer', box: { x: 70, y: 95, w: 25, h: 3 } })
  const free = makeTextElement({ content: 'Só na página 1' })
  const repeater = makeRepeaterElement('prescriptions', { maxItemsPerPage: 2 })
  const base = defaultCanvasState()
  return {
    ...base,
    elements: [header, footer, free, repeater],
    extraPages: [{ page: { ...base.page }, elements: [makeTextElement({ content: 'Página 2 real' })] }],
  }
}

const ctx = {
  consultation: {
    prescriptions: [
      { medication: 'A' }, { medication: 'B' }, { medication: 'C' }, { medication: 'D' }, { medication: 'E' },
    ],
  },
}

describe('pagination — pin', () => {
  it('isPinned/collectPinnedElements consideram header/footer/all_pages e ignoram none', () => {
    const cs = buildState()
    const pinned = collectPinnedElements(cs)
    expect(pinned.map(e => e.pin)).toEqual(['header', 'footer'])
    expect(isPinned(makeTextElement({ pin: 'all_pages' }))).toBe(true)
    expect(isPinned(makeTextElement({ pin: 'none' }))).toBe(false)
    expect(isPinned(makeTextElement())).toBe(false)
  })

  it('expande 5 itens com maxItemsPerPage=2 em 3 páginas virtuais + 1 real = 4', () => {
    const pages = expandPages(buildState(), ctx)
    expect(pages).toHaveLength(4)
    expect(pages.map(p => p.pageNumber)).toEqual([1, 2, 3, 4])
    expect(pages.every(p => p.totalPages === 4)).toBe(true)
    expect(pages[0].repeaterSlices).toBeDefined()
    expect(Object.values(pages[2].repeaterSlices!)[0]).toEqual({ start: 4, end: 5 })
    expect(pages[3].sourceIndex).toBe(1)
  })

  it('pinados da página 1 aparecem em TODAS as páginas (virtuais e reais); livres só na origem', () => {
    const cs = buildState()
    const pages = expandPages(cs, ctx)
    const [header, footer, free] = cs.elements
    for (const p of pages) {
      const ids = p.elements.map(e => e.id)
      expect(ids).toContain(header.id)
      expect(ids).toContain(footer.id)
    }
    // "Só na página 1" existe nas virtuais da página 1 mas não na página 2 real
    expect(pages[2].elements.map(e => e.id)).toContain(free.id)
    expect(pages[3].elements.map(e => e.id)).not.toContain(free.id)
    // sem duplicar ids
    for (const p of pages) {
      const ids = p.elements.map(e => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('sem repeater paginado e sem extras → 1 página, ctx sem prescrições não quebra', () => {
    const cs = defaultCanvasState()
    cs.elements = [makeTextElement({ pin: 'header' })]
    const pages = expandPages(cs, undefined)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ pageNumber: 1, totalPages: 1 })
  })
})

describe('pagination — doc.page / doc.total_pages', () => {
  it('withDocPageContext injeta doc.* sem perder outros campos de doc', () => {
    const base = { doc: { verify_code: 'ABC' }, patient: { name: 'Toby' } }
    const c = withDocPageContext(base, { pageNumber: 2, totalPages: 3 })
    expect(c.doc).toEqual({ verify_code: 'ABC', page: 2, total_pages: 3, page_of_total: '2 de 3' })
    expect(c.patient).toEqual({ name: 'Toby' })
    expect(withDocPageContext(undefined, { pageNumber: 1, totalPages: 1 }).doc?.page).toBe(1)
  })

  it('tags doc.* existem no catálogo (grupo documento) e resolvem', () => {
    expect(findTag('doc.page')?.group).toBe('documento')
    expect(tagsByGroup().some(g => g.group === 'documento')).toBe(true)
    const c = withDocPageContext({}, { pageNumber: 3, totalPages: 7 })
    expect(resolveTagValue('doc.page', c)).toBe('3')
    expect(resolveTagValue('doc.total_pages', c)).toBe('7')
    expect(resolveTagValue('doc.page_of_total', c)).toBe('3 de 7')
  })

  it('resolveInlineTags troca tokens em texto livre e preserva desconhecidos', () => {
    const c = withDocPageContext({ patient: { name: 'Toby' } }, { pageNumber: 2, totalPages: 5 })
    expect(resolveInlineTags('Pág. {{doc.page}} de {{doc.total_pages}} — {{pet.name}}', c))
      .toBe('Pág. 2 de 5 — Toby')
    expect(resolveInlineTags('{{nao.existe}} fica', c)).toBe('{{nao.existe}} fica')
    expect(resolveInlineTags('sem ctx {{doc.page}}', undefined)).toBe('sem ctx {{doc.page}}')
  })

  it('dynamic_tag doc.page no rodapé pinado resolve por página no pipeline', () => {
    const cs = defaultCanvasState()
    cs.elements = [makeDynamicTagElement('doc.page', { pin: 'footer' }), makeRepeaterElement('prescriptions', { maxItemsPerPage: 1 })]
    const pages = expandPages(cs, { consultation: { prescriptions: [{ medication: 'A' }, { medication: 'B' }] } })
    const rendered = pages.map(p => resolveTagValue('doc.page', withDocPageContext({}, p)))
    expect(rendered).toEqual(['1', '2'])
  })
})
