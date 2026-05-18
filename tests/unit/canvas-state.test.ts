/**
 * Testes unit do schema canvas_state + dynamic-tags.
 */

import {
  defaultCanvasState, isCanvasState, hydrateCanvasState,
  pageDimensionsCm, pageAspect,
} from '@/lib/canva/canvas-state'
import {
  DYNAMIC_TAGS, findTag, resolveTagValue, tagsByGroup,
} from '@/lib/canva/dynamic-tags'
import {
  makeTextElement, makeImageElement, makeLineElement,
  makeDynamicTagElement, makeRepeaterElement,
  DEFAULT_BOX, DEFAULT_TYPOGRAPHY,
} from '@/lib/canva/elements'

describe('canvas-state', () => {
  describe('defaultCanvasState', () => {
    it('cria estado válido com page A4 portrait e elements vazio', () => {
      const s = defaultCanvasState()
      expect(s.version).toBe(1)
      expect(s.page.size).toBe('A4')
      expect(s.page.orientation).toBe('portrait')
      expect(s.page.margins).toEqual({ top: 2, bottom: 2, left: 2, right: 2 })
      expect(s.elements).toEqual([])
      expect(isCanvasState(s)).toBe(true)
    })
  })

  describe('isCanvasState', () => {
    it('rejeita null/undefined/objetos vazios', () => {
      expect(isCanvasState(null)).toBe(false)
      expect(isCanvasState(undefined)).toBe(false)
      expect(isCanvasState({})).toBe(false)
    })

    it('rejeita versão diferente de 1', () => {
      expect(isCanvasState({ ...defaultCanvasState(), version: 2 })).toBe(false)
    })

    it('rejeita page.size inválido', () => {
      const s = defaultCanvasState()
      ;(s.page as any).size = 'Letter'
      expect(isCanvasState(s)).toBe(false)
    })

    it('rejeita elements que não é array', () => {
      const s = defaultCanvasState()
      ;(s as any).elements = 'foo'
      expect(isCanvasState(s)).toBe(false)
    })
  })

  describe('hydrateCanvasState', () => {
    it('aceita state válido como-está', () => {
      const s = defaultCanvasState()
      expect(hydrateCanvasState(s)).toBe(s)
    })

    it('cai para default em entradas inválidas', () => {
      expect(hydrateCanvasState(null).version).toBe(1)
      expect(hydrateCanvasState({ broken: true }).page.size).toBe('A4')
    })
  })

  describe('pageDimensionsCm + pageAspect', () => {
    it('A4 portrait = 21x29.7', () => {
      const d = pageDimensionsCm({ size: 'A4', orientation: 'portrait' })
      expect(d).toEqual({ w: 21.0, h: 29.7 })
      expect(pageAspect({ size: 'A4', orientation: 'portrait' })).toBeCloseTo(21 / 29.7, 3)
    })

    it('A4 landscape inverte dimensões', () => {
      const d = pageDimensionsCm({ size: 'A4', orientation: 'landscape' })
      expect(d).toEqual({ w: 29.7, h: 21.0 })
    })

    it('A5 portrait = 14.8x21', () => {
      const d = pageDimensionsCm({ size: 'A5', orientation: 'portrait' })
      expect(d).toEqual({ w: 14.8, h: 21.0 })
    })
  })
})

describe('elements factories', () => {
  it('makeTextElement aplica defaults', () => {
    const e = makeTextElement()
    expect(e.kind).toBe('text')
    expect(e.box).toEqual(DEFAULT_BOX)
    expect(e.typography).toEqual(DEFAULT_TYPOGRAPHY)
    expect(e.content).toBe('Texto livre')
    expect(e.id).toMatch(/^el_text_/)
  })

  it('makeImageElement nasce com objectFit contain', () => {
    const e = makeImageElement()
    expect(e.kind).toBe('image')
    expect(e.objectFit).toBe('contain')
  })

  it('makeLineElement vertical tem box estreito alto', () => {
    const e = makeLineElement('vertical')
    expect(e.orientation).toBe('vertical')
    expect(e.box.w).toBeLessThan(1)
    expect(e.box.h).toBeGreaterThan(10)
  })

  it('makeDynamicTagElement preserva tagId', () => {
    const e = makeDynamicTagElement('pet.name')
    expect(e.tagId).toBe('pet.name')
    expect(e.kind).toBe('dynamic_tag')
  })

  it('makeRepeaterElement de prescriptions usa template completo', () => {
    const e = makeRepeaterElement('prescriptions')
    expect(e.source).toBe('prescriptions')
    expect(e.itemTemplate).toBe('{{name}} — {{posology}}')
    expect(e.groupAndEnumerate).toBe(true)
  })

  it('IDs são únicos entre chamadas', () => {
    const a = makeTextElement().id
    const b = makeTextElement().id
    expect(a).not.toBe(b)
  })
})

describe('dynamic-tags', () => {
  it('DYNAMIC_TAGS tem pelo menos um item por grupo principal', () => {
    const groups = new Set(DYNAMIC_TAGS.map(t => t.group))
    expect(groups.has('tutor')).toBe(true)
    expect(groups.has('pet')).toBe(true)
    expect(groups.has('consulta')).toBe(true)
    expect(groups.has('clinica')).toBe(true)
    expect(groups.has('vet')).toBe(true)
  })

  it('findTag retorna definição por id', () => {
    expect(findTag('pet.name')?.label).toBe('Nome do Pet')
    expect(findTag('inexistente.xyz')).toBeUndefined()
  })

  it('tagsByGroup ordena pet primeiro (mais usado pelo vet)', () => {
    expect(tagsByGroup()[0].group).toBe('pet')
  })

  describe('resolveTagValue', () => {
    const ctx = {
      patient: { name: 'Toby', weight: 28.4 },
      tutor: { phone: '11988887777', cpf: '12345678900' },
      // ISO com hora para evitar drift de timezone (UTC midnight vira dia
      // anterior em horários americanos negativos quando exibido em pt-BR).
      consultation: { date: '2026-05-18T12:00:00Z' },
    }

    it('resolve path simples', () => {
      expect(resolveTagValue('pet.name', ctx)).toBe('Toby')
    })

    it('formata peso com kg + locale BR', () => {
      const v = resolveTagValue('pet.weight', ctx)
      expect(v).toMatch(/28,4 kg|28,40 kg/)
    })

    it('formata telefone BR (11 dígitos)', () => {
      expect(resolveTagValue('tutor.phone', ctx)).toBe('(11) 98888-7777')
    })

    it('formata CPF', () => {
      expect(resolveTagValue('tutor.cpf', ctx)).toBe('123.456.789-00')
    })

    it('formata data BR', () => {
      const v = resolveTagValue('consulta.date', ctx)
      expect(v).toMatch(/18\/05\/2026/)
    })

    it('retorna string vazia para path ausente', () => {
      expect(resolveTagValue('pet.microchip', ctx)).toBe('')
    })

    it('retorna string vazia para tag desconhecida', () => {
      expect(resolveTagValue('nope.xxx', ctx)).toBe('')
    })
  })
})
