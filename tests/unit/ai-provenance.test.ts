/**
 * Unit — Frente 1 (council 2026-06-24): proveniência do prontuário.
 *
 * Os trechos INFERIDOS pela IA (SOAP) são delimitados por marcadores para o MV
 * distinguir do texto ditado e validar antes de assinar. Estes testes cobrem
 * o ciclo wrap → detectar pendência → strip (revisar).
 *
 * Alvo: src/lib/voice/ai-provenance.ts
 */

import {
  AI_BLOCK_OPEN,
  AI_BLOCK_CLOSE,
  wrapAiBlock,
  hasUnreviewedAiText,
  stripAiBlocks,
} from '@/lib/voice/ai-provenance'

describe('ai-provenance — wrapAiBlock', () => {
  test('TC-AIP-001 → envolve o trecho com os marcadores de abertura e fechamento', () => {
    const out = wrapAiBlock('Paciente apático, TPC 3s.')
    expect(out.startsWith(AI_BLOCK_OPEN)).toBe(true)
    expect(out.endsWith(AI_BLOCK_CLOSE)).toBe(true)
    expect(out).toContain('Paciente apático, TPC 3s.')
  })
})

describe('ai-provenance — hasUnreviewedAiText', () => {
  test('TC-AIP-002 → detecta pendência quando há bloco de IA não revisado', () => {
    const notes = `Anamnese ditada.\n\n${wrapAiBlock('SOAP inferido pela IA.')}`
    expect(hasUnreviewedAiText(notes)).toBe(true)
  })

  test('TC-AIP-003 → texto puramente ditado (sem marcador) não acusa pendência', () => {
    expect(hasUnreviewedAiText('Tutor relata vômito há 2 dias. Exame físico normal.')).toBe(false)
  })

  test('TC-AIP-004 → string vazia não acusa pendência', () => {
    expect(hasUnreviewedAiText('')).toBe(false)
  })
})

describe('ai-provenance — stripAiBlocks (MV revisou)', () => {
  test('TC-AIP-005 → remove os marcadores e preserva o conteúdo', () => {
    const cleaned = stripAiBlocks(wrapAiBlock('Conduta: dipirona 25mg/kg.'))
    expect(cleaned).toBe('Conduta: dipirona 25mg/kg.')
    expect(hasUnreviewedAiText(cleaned)).toBe(false)
  })

  test('TC-AIP-006 → após strip, o prontuário não tem mais pendência (libera finalização)', () => {
    const notes = `Anamnese ditada.\n\n${wrapAiBlock('SOAP A.')}\n\n${wrapAiBlock('SOAP B.')}`
    expect(hasUnreviewedAiText(notes)).toBe(true)
    const cleaned = stripAiBlocks(notes)
    expect(hasUnreviewedAiText(cleaned)).toBe(false)
    expect(cleaned).toContain('Anamnese ditada.')
    expect(cleaned).toContain('SOAP A.')
    expect(cleaned).toContain('SOAP B.')
  })

  test('TC-AIP-007 → normaliza excesso de linhas em branco deixado pelos marcadores', () => {
    const cleaned = stripAiBlocks(notesWithExtraBlankLines())
    expect(cleaned).not.toMatch(/\n{3,}/)
  })

  test('TC-AIP-008 → idempotente em texto já limpo (sem marcadores)', () => {
    const plain = 'Retorno em 7 dias. Sem alterações.'
    expect(stripAiBlocks(plain)).toBe(plain)
  })
})

function notesWithExtraBlankLines(): string {
  return `Linha 1.\n\n${wrapAiBlock('Bloco IA.')}\n\n\n\nLinha final.`
}
