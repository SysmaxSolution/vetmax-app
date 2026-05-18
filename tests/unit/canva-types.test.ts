/**
 * Canva Nativo — testes unit dos validadores e tipos.
 */

import {
  validateContent, emptyContent, isCanvaTemplate,
  CANVA_DEFAULT_MARGINS, A4_CM, A4_ASPECT,
} from '@/lib/canva/types'

describe('canva/types', () => {
  describe('emptyContent', () => {
    it('cria estrutura mínima válida', () => {
      const c = emptyContent()
      expect(c.static_fields).toEqual({})
      expect(c.dynamic_fields).toEqual([])
      expect(validateContent(c)).toBe(true)
    })
  })

  describe('validateContent', () => {
    it('aceita schema canônico (static + dynamic)', () => {
      expect(validateContent({
        static_fields: { medicamentos: 'X' },
        dynamic_fields: [{ key: 'Pressão Arterial', value: '120/80 mmHg' }],
      })).toBe(true)
    })

    it('aceita schema vazio mas estruturalmente correto', () => {
      expect(validateContent({ static_fields: {}, dynamic_fields: [] })).toBe(true)
    })

    it('rejeita null/undefined', () => {
      expect(validateContent(null)).toBe(false)
      expect(validateContent(undefined)).toBe(false)
    })

    it('rejeita dynamic_fields que não é array', () => {
      expect(validateContent({ static_fields: {}, dynamic_fields: 'x' })).toBe(false)
      expect(validateContent({ static_fields: {}, dynamic_fields: { a: 1 } })).toBe(false)
    })

    it('rejeita static_fields que não é objeto', () => {
      expect(validateContent({ static_fields: 'x', dynamic_fields: [] })).toBe(false)
      expect(validateContent({ static_fields: null, dynamic_fields: [] })).toBe(false)
    })

    it('rejeita item dynamic sem key string', () => {
      expect(validateContent({
        static_fields: {},
        dynamic_fields: [{ key: 42, value: 'x' }],
      })).toBe(false)
    })

    it('rejeita item dynamic sem value string', () => {
      expect(validateContent({
        static_fields: {},
        dynamic_fields: [{ key: 'a', value: 42 }],
      })).toBe(false)
    })
  })

  describe('isCanvaTemplate', () => {
    it('retorna true quando background_image_url está presente', () => {
      expect(isCanvaTemplate({ background_image_url: 'https://x.com/bg.png' })).toBe(true)
    })

    it('retorna false quando background_image_url é null/undefined/empty', () => {
      expect(isCanvaTemplate({ background_image_url: null })).toBe(false)
      expect(isCanvaTemplate({ background_image_url: undefined })).toBe(false)
      expect(isCanvaTemplate({ background_image_url: '' })).toBe(false)
      expect(isCanvaTemplate({})).toBe(false)
    })
  })

  describe('constantes A4', () => {
    it('CANVA_DEFAULT_MARGINS é 2cm em todas as bordas', () => {
      expect(CANVA_DEFAULT_MARGINS).toEqual({ top: 2.0, bottom: 2.0, left: 2.0, right: 2.0 })
    })

    it('A4_CM bate com norma ISO 216', () => {
      expect(A4_CM.width).toBe(21.0)
      expect(A4_CM.height).toBe(29.7)
    })

    it('A4_ASPECT ≈ 1/√2', () => {
      expect(A4_ASPECT).toBeCloseTo(1 / Math.sqrt(2), 2)
    })
  })
})
