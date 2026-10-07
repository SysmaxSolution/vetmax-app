/**
 * Fase 1 — catálogo de fontes (módulo puro): fallback stack, CSS var das
 * Google Fonts, @font-face das fontes da clínica, formato por extensão.
 */

import {
  fontFamilyCss, fontOptions, buildClinicFontFaceCss, fontFormatFromFilename,
  STANDARD_FONTS, type ClinicFontFace,
} from '@/lib/canva/fonts'

const clinicFont: ClinicFontFace = {
  id: 'f1', family_name: 'Fonte Animais', url: 'https://x/fonte.woff2',
  format: 'woff2', font_weight: 700, font_style: 'normal',
}

describe('fonts — fontFamilyCss', () => {
  it('Google Font usa var(--canva-font-slug, "Nome") com fallback do nome e genérico', () => {
    expect(fontFamilyCss('Inter')).toBe('var(--canva-font-inter, "Inter"), "Inter", system-ui, sans-serif')
    expect(fontFamilyCss('Merriweather')).toContain('serif')
    expect(fontFamilyCss('open sans')).toContain('--canva-font-open-sans')
  })

  it('fonte de sistema não usa var()', () => {
    expect(fontFamilyCss('Times New Roman')).toBe('"Times New Roman", serif')
    expect(fontFamilyCss('Courier New')).toBe('"Courier New", monospace')
  })

  it('fonte da clínica / desconhecida confia no @font-face', () => {
    expect(fontFamilyCss('Fonte Animais', [clinicFont])).toBe('"Fonte Animais", system-ui, sans-serif')
    expect(fontFamilyCss('Qualquer')).toBe('"Qualquer", sans-serif')
    expect(fontFamilyCss(undefined)).toContain('Inter')
  })
})

describe('fonts — opções e @font-face', () => {
  it('fontOptions lista clínica primeiro e depois padrão, sem duplicar', () => {
    const opts = fontOptions([clinicFont, { family_name: 'inter' }])
    expect(opts[0]).toEqual({ family: 'Fonte Animais', source: 'clinica' })
    expect(opts.filter(o => o.family.toLowerCase() === 'inter')).toHaveLength(1)
    expect(opts).toHaveLength(STANDARD_FONTS.length + 1)
  })

  it('buildClinicFontFaceCss gera uma regra por variante com peso/estilo', () => {
    const css = buildClinicFontFaceCss([clinicFont, { ...clinicFont, id: 'f2', font_style: 'italic' }])
    expect(css).toContain('@font-face{font-family:"Fonte Animais";src:url("https://x/fonte.woff2") format("woff2");font-weight:700;font-style:normal;')
    expect(css).toContain('font-style:italic')
    expect(css.split('\n')).toHaveLength(2)
  })

  it('fontFormatFromFilename mapeia extensões e rejeita o resto', () => {
    expect(fontFormatFromFilename('a.TTF')).toBe('truetype')
    expect(fontFormatFromFilename('a.otf')).toBe('opentype')
    expect(fontFormatFromFilename('a.woff')).toBe('woff')
    expect(fontFormatFromFilename('a.woff2')).toBe('woff2')
    expect(fontFormatFromFilename('a.png')).toBeNull()
  })
})
