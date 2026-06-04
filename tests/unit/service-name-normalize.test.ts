/**
 * Unit — Fix B3 (reunião 04/06/2026): normalização de nome de serviço para
 * o find-or-create do importador Petlove ("Consulta Veterinária" duplicada).
 *
 * TC-B3-001..008 → normalizeServiceName / buildNormalizedNameIndex
 *                  (src/lib/service-name-normalize.ts)
 */

import { normalizeServiceName, buildNormalizedNameIndex } from '@/lib/service-name-normalize'

describe('service-name — normalizeServiceName', () => {
  test('TC-B3-001 → caso da demo: planilha CAIXA ALTA sem acento bate com o catálogo acentuado', () => {
    expect(normalizeServiceName('CONSULTA VETERINARIA'))
      .toBe(normalizeServiceName('Consulta Veterinária'))
  })

  test('TC-B3-002 → espaços extras/duplos/trailing são colapsados', () => {
    expect(normalizeServiceName('  Consulta   Veterinária ')).toBe('consulta veterinaria')
  })

  test('TC-B3-003 → acentos variados (ã é ç ô ü) removidos', () => {
    expect(normalizeServiceName('Aplicação de Medicação Injetável çÔü'))
      .toBe('aplicacao de medicacao injetavel cou')
  })

  test('TC-B3-004 → nomes realmente diferentes NÃO colidem', () => {
    expect(normalizeServiceName('Consulta Veterinária'))
      .not.toBe(normalizeServiceName('Consulta Retorno'))
  })

  test('TC-B3-005 → string vazia/whitespace vira vazio', () => {
    expect(normalizeServiceName('   ')).toBe('')
  })
})

describe('service-name — buildNormalizedNameIndex', () => {
  test('TC-B3-006 → variantes apontam para o MESMO id (primeiro da lista = canônico)', () => {
    const index = buildNormalizedNameIndex([
      { id: 'canonico',  name: 'Consulta Veterinária' },   // created_at mais antigo
      { id: 'duplicado', name: 'CONSULTA VETERINARIA' },
    ])
    expect(index.size).toBe(1)
    expect(index.get('consulta veterinaria')).toBe('canonico')
  })

  test('TC-B3-007 → lookup de nome vindo da planilha encontra o canônico', () => {
    const index = buildNormalizedNameIndex([
      { id: 'a', name: 'Consulta Veterinária' },
      { id: 'b', name: 'Vacina V10' },
    ])
    expect(index.get(normalizeServiceName(' CONSULTA  VETERINARIA '))).toBe('a')
    expect(index.get(normalizeServiceName('vacina v10'))).toBe('b')
    expect(index.get(normalizeServiceName('Castração'))).toBeUndefined()
  })

  test('TC-B3-008 → nomes vazios são ignorados no índice', () => {
    const index = buildNormalizedNameIndex([
      { id: 'x', name: '  ' },
      { id: 'y', name: 'Hemograma' },
    ])
    expect(index.size).toBe(1)
  })
})
