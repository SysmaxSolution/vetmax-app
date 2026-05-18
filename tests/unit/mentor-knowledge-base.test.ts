/**
 * Unit — Mentor Knowledge Base (VETMAX_KNOWLEDGE_BASE)
 * Importa a constante exportada de @/lib/mentor/knowledge-base.
 *
 * TC-KB-001..020 → cobrem versão, presença de seções-chave, terminologia CFMV.
 */

import { VETMAX_KNOWLEDGE_BASE } from '@/lib/mentor/knowledge-base'

describe('VETMAX_KNOWLEDGE_BASE — metadata', () => {
  test('TC-KB-001 → export é string não-vazia', () => {
    expect(typeof VETMAX_KNOWLEDGE_BASE).toBe('string')
    expect(VETMAX_KNOWLEDGE_BASE.length).toBeGreaterThan(1000)
  })

  test('TC-KB-002 → contém cabeçalho VETMAX_KNOWLEDGE_BASE', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('VETMAX_KNOWLEDGE_BASE')
  })

  test('TC-KB-003 → versão declarada (1.x.x)', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/\*\*version\*\*:\s*\d+\.\d+\.\d+/)
  })

  test('TC-KB-004 → last-updated em formato YYYY-MM-DD', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/last-updated\*\*:\s*\d{4}-\d{2}-\d{2}/)
  })

  test('TC-KB-005 → contém marca END do documento', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('END OF VETMAX_KNOWLEDGE_BASE')
  })
})

describe('VETMAX_KNOWLEDGE_BASE — terminologia CFMV', () => {
  test('TC-KB-006 → menciona termo "Tutor"', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Tutor')
  })

  test('TC-KB-007 → menciona "Pet" ou "Animal"', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/\bPet\b|\bAnimal\b/)
  })

  test('TC-KB-008 → menciona Médico Veterinário', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/Médico Veterinário|\bMV\b/)
  })

  test('TC-KB-009 → menciona Prontuário', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Prontuário')
  })

  test('TC-KB-010 → menciona SOAP', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('SOAP')
  })
})

describe('VETMAX_KNOWLEDGE_BASE — módulos do sistema', () => {
  test('TC-KB-011 → menciona Recepção', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Recepção')
  })

  test('TC-KB-012 → menciona Triagem', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Triagem')
  })

  test('TC-KB-013 → menciona Consultório', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Consultório')
  })

  test('TC-KB-014 → menciona Internação', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Internação')
  })

  test('TC-KB-015 → menciona Caixa Central', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Caixa Central')
  })

  test('TC-KB-016 → menciona Banho & Tosa (ou Banho e Tosa)', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/Banho [&e] Tosa/)
  })

  test('TC-KB-017 → menciona Farmácia', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('Farmácia')
  })

  test('TC-KB-018 → menciona WhatsApp', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('WhatsApp')
  })
})

describe('VETMAX_KNOWLEDGE_BASE — seções estruturais', () => {
  test('TC-KB-019 → contém pelo menos 1 seção markdown (## ou ---)', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toMatch(/##\s/)
  })

  test('TC-KB-020 → AI-CONTEXT directive presente (orienta a IA)', () => {
    expect(VETMAX_KNOWLEDGE_BASE).toContain('AI-CONTEXT')
  })
})
