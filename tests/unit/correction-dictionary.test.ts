/**
 * Unit — Frente 2 (council 2026-06-24): aplicação do dicionário de correção.
 *
 * Corrige termos que a Web Speech API erra ANTES do Haiku. Cobre fronteira de
 * palavra Unicode (acentos PT-BR), preservação de caixa e prioridade por
 * comprimento.
 *
 * Alvo: src/lib/voice/correction-dictionary.ts
 */

import { applyCorrections, type CorrectionRule } from '@/lib/voice/correction-dictionary'

describe('correction-dictionary — applyCorrections', () => {
  test('TC-CD-001 → corrige termo simples', () => {
    const rules: CorrectionRule[] = [{ wrong: 'tramado', right: 'tramadol' }]
    expect(applyCorrections('apliquei tramado no paciente', rules)).toBe('apliquei tramadol no paciente')
  })

  test('TC-CD-002 → preserva caixa alta (TRAMADO → TRAMADOL)', () => {
    const rules: CorrectionRule[] = [{ wrong: 'tramado', right: 'tramadol' }]
    expect(applyCorrections('dose de TRAMADO', rules)).toBe('dose de TRAMADOL')
  })

  test('TC-CD-003 → preserva primeira-maiúscula (Tramado → Tramadol)', () => {
    const rules: CorrectionRule[] = [{ wrong: 'tramado', right: 'tramadol' }]
    expect(applyCorrections('Tramado 50mg', rules)).toBe('Tramadol 50mg')
  })

  test('TC-CD-004 → não corrige no meio de outra palavra (fronteira)', () => {
    const rules: CorrectionRule[] = [{ wrong: 'gato', right: 'felino' }]
    expect(applyCorrections('o gato e o regato', rules)).toBe('o felino e o regato')
  })

  test('TC-CD-005 → respeita acentos PT-BR na fronteira', () => {
    const rules: CorrectionRule[] = [{ wrong: 'dirofilariose', right: 'dirofilariose (verme do coração)' }]
    expect(applyCorrections('suspeita de dirofilariose.', rules))
      .toBe('suspeita de dirofilariose (verme do coração).')
  })

  test('TC-CD-006 → regra mais longa vence a mais curta', () => {
    const rules: CorrectionRule[] = [
      { wrong: 'diro', right: 'XX' },
      { wrong: 'dirofilariose', right: 'dirofilariose-ok' },
    ]
    expect(applyCorrections('dirofilariose', rules)).toBe('dirofilariose-ok')
  })

  test('TC-CD-007 → múltiplas ocorrências são todas corrigidas', () => {
    const rules: CorrectionRule[] = [{ wrong: 'cefovecina', right: 'Convenia' }]
    expect(applyCorrections('cefovecina e mais cefovecina', rules)).toBe('Convenia e mais Convenia')
  })

  test('TC-CD-008 → texto sem regras aplicáveis fica intacto', () => {
    const rules: CorrectionRule[] = [{ wrong: 'xyz', right: 'abc' }]
    expect(applyCorrections('exame físico normal', rules)).toBe('exame físico normal')
  })

  test('TC-CD-009 → sem regras retorna o texto original', () => {
    expect(applyCorrections('qualquer texto', [])).toBe('qualquer texto')
  })

  test('TC-CD-010 → ignora regras com termo vazio (não corrompe)', () => {
    const rules: CorrectionRule[] = [{ wrong: '', right: 'x' }, { wrong: 'a', right: '' }]
    expect(applyCorrections('a b c', rules)).toBe('a b c')
  })

  test('TC-CD-011 → caracteres especiais no termo são tratados literalmente', () => {
    const rules: CorrectionRule[] = [{ wrong: 'raio.x', right: 'raio-x' }]
    expect(applyCorrections('fazer raio.x do tórax', rules)).toBe('fazer raio-x do tórax')
  })
})
