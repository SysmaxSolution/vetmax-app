/**
 * LEI 3 — Fim do Vazamento de Variaveis.
 *
 * Garante que tokens literais nunca cheguem ao PDF final.
 */

import { interpolateText, hasPlaceholder } from '../../src/lib/pdf/interpolate-vars'

describe('interpolateText (LEI 3)', () => {
  const ctx = {
    professional_name: 'Dr. Claudiney Pinto',
    professional_crmv: 'CRMV-SP 74.696',
    professional_role: 'Medico Veterinario',
    clinic_name: 'VetClin Cardio',
  }

  it('substitui [token] simples', () => {
    expect(interpolateText('[professional_name]', ctx)).toBe('Dr. Claudiney Pinto')
  })

  it('substitui [[token]] duplo', () => {
    expect(interpolateText('[[professional_crmv]]', ctx)).toBe('CRMV-SP 74.696')
  })

  it('substitui {{token}} (handlebars)', () => {
    expect(interpolateText('{{professional_name}}', ctx)).toBe('Dr. Claudiney Pinto')
  })

  it('substitui ${token} (template literal)', () => {
    expect(interpolateText('${clinic_name}', ctx)).toBe('VetClin Cardio')
  })

  it('substitui {token} (single brace)', () => {
    expect(interpolateText('{professional_role}', ctx)).toBe('Medico Veterinario')
  })

  it('substitui multiplos tokens na mesma string', () => {
    const tpl = '[professional_name] — [professional_crmv] — [professional_role]'
    expect(interpolateText(tpl, ctx)).toBe(
      'Dr. Claudiney Pinto — CRMV-SP 74.696 — Medico Veterinario',
    )
  })

  it('token desconhecido vira string vazia (NAO deixa literal vazar)', () => {
    expect(interpolateText('[unknown_field]', ctx)).toBe('')
    expect(interpolateText('[[whatever]]', ctx)).toBe('')
    expect(interpolateText('{{xxx}}', ctx)).toBe('')
  })

  it('null e undefined no contexto viram string vazia', () => {
    const ctx2 = { foo: null, bar: undefined as string | undefined }
    expect(interpolateText('[foo]-[bar]', ctx2)).toBe('-')
  })

  it('numero no contexto vira string', () => {
    expect(interpolateText('[count]', { count: 42 })).toBe('42')
  })

  it('texto sem placeholder retorna intacto', () => {
    expect(interpolateText('Texto simples', ctx)).toBe('Texto simples')
  })

  it('whitespace dentro do placeholder e ignorado', () => {
    expect(interpolateText('[[ professional_name ]]', ctx)).toBe('Dr. Claudiney Pinto')
    expect(interpolateText('{{  professional_crmv  }}', ctx)).toBe('CRMV-SP 74.696')
  })

  it('placeholders adjacentes', () => {
    expect(interpolateText('[professional_name][professional_crmv]', ctx)).toBe(
      'Dr. Claudiney PintoCRMV-SP 74.696',
    )
  })

  it('string vazia retorna vazia', () => {
    expect(interpolateText('', ctx)).toBe('')
  })

  it('ctx vazio: todos os placeholders viram vazio (nao vaza literal)', () => {
    expect(interpolateText('[professional_name] CRMV: [professional_crmv]', {}))
      .toBe(' CRMV: ')
  })
})

describe('hasPlaceholder', () => {
  it('detecta [token], {{token}}, ${token}', () => {
    expect(hasPlaceholder('Hello [name]')).toBe(true)
    expect(hasPlaceholder('Hello {{name}}')).toBe(true)
    expect(hasPlaceholder('Hello ${name}')).toBe(true)
  })

  it('texto puro nao tem placeholder', () => {
    expect(hasPlaceholder('Hello world')).toBe(false)
  })

  it('string vazia: false', () => {
    expect(hasPlaceholder('')).toBe(false)
  })
})
