/**
 * Unit — Frente 2 fase 2.1 (council 2026-06-24): mineração de correções.
 *
 * Extrai do par (transcrição bruta, texto final do MV) apenas correções
 * foneticamente próximas; descarta reescrita de conteúdo (trava nº 2).
 *
 * Alvo: src/lib/voice/correction-mining.ts
 */

import {
  levenshtein,
  isLikelyTranscriptionFix,
  mineCorrections,
} from '@/lib/voice/correction-mining'

describe('correction-mining — levenshtein', () => {
  test('TC-CM-001 → distância básica', () => {
    expect(levenshtein('tramado', 'tramadol')).toBe(1)
    expect(levenshtein('gato', 'gato')).toBe(0)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})

describe('correction-mining — isLikelyTranscriptionFix', () => {
  test('TC-CM-002 → par fonético próximo é aceito', () => {
    expect(isLikelyTranscriptionFix('tramado', 'tramadol')).toBe(true)
    expect(isLikelyTranscriptionFix('cefovecina', 'cefovecine')).toBe(true)
  })

  test('TC-CM-003 → palavras totalmente diferentes (reescrita) são rejeitadas', () => {
    expect(isLikelyTranscriptionFix('gato', 'felino')).toBe(false)
    expect(isLikelyTranscriptionFix('paciente', 'tutor')).toBe(false)
  })

  test('TC-CM-004 → tokens curtos e números são ignorados', () => {
    expect(isLikelyTranscriptionFix('de', 'do')).toBe(false)
    expect(isLikelyTranscriptionFix('50', '15')).toBe(false)
  })

  test('TC-CM-005 → termos iguais não são correção', () => {
    expect(isLikelyTranscriptionFix('dipirona', 'dipirona')).toBe(false)
  })
})

describe('correction-mining — mineCorrections', () => {
  test('TC-CM-006 → extrai a correção fonética em meio a texto idêntico', () => {
    const raw = 'apliquei tramado no paciente'
    const final = 'apliquei tramadol no paciente'
    expect(mineCorrections(raw, final)).toEqual([{ wrong: 'tramado', right: 'tramadol' }])
  })

  test('TC-CM-007 → ignora reescrita de conteúdo (não vira regra)', () => {
    const raw = 'gato com vomito'
    const final = 'O felino apresenta êmese há dois dias, conduta instituída.'
    // nenhuma das substituições é foneticamente próxima → nada minerado
    expect(mineCorrections(raw, final)).toEqual([])
  })

  test('TC-CM-008 → captura múltiplas correções distintas no mesmo par', () => {
    const raw = 'suspeita de giardiase e dirofilariise'
    const final = 'suspeita de giardíase e dirofilariose'
    const rules = mineCorrections(raw, final)
    const pairs = rules.map(r => `${r.wrong}->${r.right.toLowerCase()}`).sort()
    expect(pairs).toEqual(['dirofilariise->dirofilariose', 'giardiase->giardíase'])
  })

  test('TC-CM-009 → deduplica correções repetidas', () => {
    const raw = 'tramado e mais tramado'
    const final = 'tramadol e mais tramadol'
    expect(mineCorrections(raw, final)).toEqual([{ wrong: 'tramado', right: 'tramadol' }])
  })

  test('TC-CM-010 → texto idêntico não gera nada', () => {
    expect(mineCorrections('exame físico normal', 'exame físico normal')).toEqual([])
  })

  test('TC-CM-011 → entradas vazias retornam lista vazia', () => {
    expect(mineCorrections('', 'qualquer')).toEqual([])
    expect(mineCorrections('qualquer', '')).toEqual([])
  })
})
