/**
 * Fase 1 — página flexível: presets em mm, custom, orientação, hidratação
 * retrocompatível do canvas_state version 1 (sem customMm / size novo).
 */

import {
  PAGE_PRESETS, pageDimensionsMm, pageDimensionsCm, pageDimensionsPx,
  pageLabel, hydratePageConfig, hydrateCanvasState, isCanvasState,
  defaultCanvasState, addPage,
} from '@/lib/canva/canvas-state'
import { makeTextElement } from '@/lib/canva/elements'

describe('página flexível — dimensões', () => {
  it('presets batem com ISO/ANSI', () => {
    expect(pageDimensionsMm({ size: 'A4', orientation: 'portrait' })).toEqual({ w: 210, h: 297 })
    expect(pageDimensionsMm({ size: 'A5', orientation: 'portrait' })).toEqual({ w: 148, h: 210 })
    expect(pageDimensionsMm({ size: 'A6', orientation: 'portrait' })).toEqual({ w: 105, h: 148 })
    expect(pageDimensionsMm({ size: 'Letter', orientation: 'portrait' })).toEqual({ w: 216, h: 279 })
    expect(pageDimensionsMm({ size: 'Etiqueta', orientation: 'portrait' })).toEqual({ w: 100, h: 50 })
  })

  it('paisagem inverte w/h (inclusive custom)', () => {
    expect(pageDimensionsMm({ size: 'Letter', orientation: 'landscape' })).toEqual({ w: 279, h: 216 })
    expect(pageDimensionsMm({ size: 'custom', orientation: 'landscape', customMm: { w: 100, h: 150 } }))
      .toEqual({ w: 150, h: 100 })
  })

  it('custom usa customMm e faz clamp nos limites', () => {
    expect(pageDimensionsMm({ size: 'custom', orientation: 'portrait', customMm: { w: 120, h: 80 } }))
      .toEqual({ w: 120, h: 80 })
    // abaixo do mínimo → 30 mm; acima do máximo → 1200 mm
    expect(pageDimensionsMm({ size: 'custom', orientation: 'portrait', customMm: { w: 5, h: 5000 } }))
      .toEqual({ w: 30, h: 1200 })
    // custom sem customMm cai para A4 (nunca lança)
    expect(pageDimensionsMm({ size: 'custom', orientation: 'portrait', customMm: null }))
      .toEqual({ w: 210, h: 297 })
  })

  it('cm e px derivam dos mm (A4 = 21×29.7 cm = 794×1123 px @96dpi)', () => {
    expect(pageDimensionsCm({ size: 'A4', orientation: 'portrait' })).toEqual({ w: 21, h: 29.7 })
    expect(pageDimensionsPx({ size: 'A4', orientation: 'portrait' })).toEqual({ w: 794, h: 1123 })
    expect(pageDimensionsCm({ size: 'A5', orientation: 'portrait' })).toEqual({ w: 14.8, h: 21 })
  })

  it('pageLabel descreve tamanho + orientação em PT-BR', () => {
    expect(pageLabel({ size: 'A4', orientation: 'portrait' })).toBe('A4 retrato')
    expect(pageLabel({ size: 'Letter', orientation: 'landscape' })).toBe('Carta paisagem')
    expect(pageLabel({ size: 'custom', orientation: 'portrait', customMm: { w: 100, h: 150 } }))
      .toBe('Personalizado 100×150 mm retrato')
  })

  it('PAGE_PRESETS não contém custom', () => {
    expect((PAGE_PRESETS as Record<string, unknown>).custom).toBeUndefined()
  })
})

describe('página flexível — hidratação retrocompatível', () => {
  it('canvas_state v1 legado (A4/A5 sem customMm) passa intacto', () => {
    const legacy = {
      version: 1,
      page: { size: 'A5', orientation: 'landscape', margins: { top: 1, bottom: 1, left: 1, right: 1 }, backgroundImageUrl: null },
      elements: [],
    }
    expect(isCanvasState(legacy)).toBe(true)
    expect(hydrateCanvasState(legacy)).toBe(legacy)
  })

  it('hydratePageConfig preenche defaults sem perder o que existe', () => {
    const p = hydratePageConfig({ size: 'Letter', margins: { top: 3 } })
    expect(p.size).toBe('Letter')
    expect(p.orientation).toBe('portrait')
    expect(p.margins).toEqual({ top: 3, bottom: 2, left: 2, right: 2 })
    expect(p.customMm).toBeNull()
    expect(p.backgroundImageUrl).toBeNull()
  })

  it('hydratePageConfig: size desconhecido → A4; custom sem mm → A4', () => {
    expect(hydratePageConfig({ size: 'B9' }).size).toBe('A4')
    expect(hydratePageConfig({ size: 'custom' }).size).toBe('A4')
    expect(hydratePageConfig({ size: 'custom', customMm: { w: 80, h: 120 } })).toMatchObject({
      size: 'custom', customMm: { w: 80, h: 120 },
    })
    expect(hydratePageConfig(null).size).toBe('A4')
  })

  it('hydrateCanvasState preserva elementos quando só a page está parcial', () => {
    const el = makeTextElement({ content: 'Olá' })
    const partial = { version: 1, page: { size: 'A4' }, elements: [el], extraPages: [{ page: {}, elements: [] }] }
    const cs = hydrateCanvasState(partial)
    expect(cs.elements).toHaveLength(1)
    expect(cs.elements[0]).toBe(el)
    expect(cs.page.margins).toEqual({ top: 2, bottom: 2, left: 2, right: 2 })
    expect(cs.extraPages).toHaveLength(1)
    expect(cs.extraPages![0].page.size).toBe('A4')
    expect(isCanvasState(cs)).toBe(true)
  })

  it('hydrateCanvasState cai para default quando não há elements', () => {
    expect(hydrateCanvasState({ page: { size: 'A4' } }).elements).toEqual([])
  })

  it('addPage herda size/orientation/customMm da página 1', () => {
    let cs = defaultCanvasState()
    cs = { ...cs, page: { ...cs.page, size: 'custom', orientation: 'landscape', customMm: { w: 100, h: 150 } } }
    const [next, idx] = addPage(cs)
    expect(idx).toBe(1)
    expect(next.extraPages![0].page).toMatchObject({
      size: 'custom', orientation: 'landscape', customMm: { w: 100, h: 150 },
    })
  })
})
