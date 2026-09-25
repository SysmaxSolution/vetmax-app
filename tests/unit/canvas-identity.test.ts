/**
 * Fase 1 — identidade documental: hidratação, geração de elementos pinados
 * (cabeçalho/rodapé) e aplicação idempotente num canvas_state.
 */

import {
  DEFAULT_IDENTITY, hydrateIdentity, buildIdentityElements, applyIdentityToState,
  isIdentityElement, identityPageConfig,
} from '@/lib/canva/identity'
import { defaultCanvasState } from '@/lib/canva/canvas-state'
import { makeTextElement } from '@/lib/canva/elements'
import { collectPinnedElements, expandPages } from '@/lib/canva/pagination'

describe('identity — hidratação', () => {
  it('null → padrão; parcial preserva o que veio e completa o resto', () => {
    expect(hydrateIdentity(null)).toEqual(DEFAULT_IDENTITY)
    const h = hydrateIdentity({ colors: { primary: '#ff0000' }, header: { showLogo: false, lines: ['{{clinica.name}}'] }, defaultPage: { size: 'A5' } })
    expect(h.colors.primary).toBe('#ff0000')
    expect(h.colors.secondary).toBe(DEFAULT_IDENTITY.colors.secondary)
    expect(h.header.showLogo).toBe(false)
    expect(h.header.lines).toEqual(['{{clinica.name}}'])
    expect(h.defaultPage.size).toBe('A5')
    expect(h.footer).toEqual(DEFAULT_IDENTITY.footer)
  })

  it('rejeita cor inválida e tamanho desconhecido', () => {
    const h = hydrateIdentity({ colors: { primary: 'vermelho' }, defaultPage: { size: 'B9' } })
    expect(h.colors.primary).toBe(DEFAULT_IDENTITY.colors.primary)
    expect(h.defaultPage.size).toBe('A4')
  })
})

describe('identity — elementos', () => {
  const page = identityPageConfig(DEFAULT_IDENTITY)

  it('gera cabeçalho/rodapé pinados, QR, numeração e assinatura', () => {
    const els = buildIdentityElements(DEFAULT_IDENTITY, page)
    expect(els.every(isIdentityElement)).toBe(true)
    const header = els.filter(e => e.pin === 'header')
    const footer = els.filter(e => e.pin === 'footer')
    expect(header.length).toBeGreaterThanOrEqual(4)  // logo + 3 linhas + divisória
    expect(footer.some(e => e.kind === 'qr_validation')).toBe(true)
    expect(footer.some(e => e.kind === 'text' && e.content.includes('{{doc.page}}'))).toBe(true)
    expect(els.some(e => e.kind === 'dynamic_tag' && e.tagId === 'vet.crmv')).toBe(true)
    // tudo dentro da folha
    for (const e of els) {
      expect(e.box.x).toBeGreaterThanOrEqual(0)
      expect(e.box.y).toBeGreaterThanOrEqual(0)
      expect(e.box.x + e.box.w).toBeLessThanOrEqual(100.01)
      expect(e.box.y + e.box.h).toBeLessThanOrEqual(100.01)
    }
  })

  it('respeita toggles desligados', () => {
    const els = buildIdentityElements({
      ...DEFAULT_IDENTITY,
      header: { ...DEFAULT_IDENTITY.header, enabled: false },
      footer: { ...DEFAULT_IDENTITY.footer, showQr: false, showPageNumber: false },
      signature: { ...DEFAULT_IDENTITY.signature, enabled: false },
    }, page)
    expect(els.some(e => e.pin === 'header')).toBe(false)
    expect(els.some(e => e.kind === 'qr_validation')).toBe(false)
    expect(els.some(e => e.kind === 'dynamic_tag')).toBe(false)
    expect(els.filter(e => e.pin === 'footer').length).toBeGreaterThan(0)
  })

  it('usa a fonte padrão da identidade nos textos', () => {
    const els = buildIdentityElements({ ...DEFAULT_IDENTITY, defaultFontFamily: 'Montserrat' }, page)
    const texts = els.filter(e => e.kind === 'text')
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t.kind === 'text' && t.typography.fontFamily === 'Montserrat')).toBe(true)
  })
})

describe('identity — aplicação no canvas_state', () => {
  it('modelo vazio adota a página padrão e ganha os elementos', () => {
    const ident = hydrateIdentity({ defaultPage: { size: 'Letter', orientation: 'landscape' } })
    const cs = applyIdentityToState(defaultCanvasState(), ident)
    expect(cs.page.size).toBe('Letter')
    expect(cs.page.orientation).toBe('landscape')
    expect(cs.elements.length).toBeGreaterThan(5)
  })

  it('modelo com conteúdo mantém a página e os elementos próprios; reaplicar substitui sem duplicar', () => {
    const own = makeTextElement({ content: 'meu texto' })
    let cs = { ...defaultCanvasState(), elements: [own] }
    cs = applyIdentityToState(cs, DEFAULT_IDENTITY)
    const n1 = cs.elements.length
    expect(cs.page.size).toBe('A4')
    expect(cs.elements).toContain(own)
    cs = applyIdentityToState(cs, DEFAULT_IDENTITY)
    expect(cs.elements.length).toBe(n1)
    expect(cs.elements.filter(e => !isIdentityElement(e))).toEqual([own])
    // zIndex dos novos acima dos existentes
    expect(Math.min(...cs.elements.filter(isIdentityElement).map(e => e.zIndex ?? 0))).toBeGreaterThan(own.zIndex ?? 0)
  })

  it('cabeçalho/rodapé da identidade repetem em todas as páginas no pipeline de paginação', () => {
    let cs = applyIdentityToState(defaultCanvasState(), DEFAULT_IDENTITY)
    cs = { ...cs, extraPages: [{ page: { ...cs.page }, elements: [] }] }
    const pinned = collectPinnedElements(cs)
    expect(pinned.length).toBeGreaterThan(0)
    const pages = expandPages(cs, undefined)
    expect(pages).toHaveLength(2)
    for (const id of pinned.map(p => p.id)) {
      expect(pages[1].elements.map(e => e.id)).toContain(id)
    }
  })
})
