/**
 * Mock de valores ficticios para testar geracao pixel-perfect.
 *
 * INTERVENCAO CIRURGICA — regras inflexiveis:
 *
 *   1. Campos `custom_*` (qualquer um) → VAZIO. Decisao do Diretor:
 *      "E melhor o medico ver o campo em branco do que ver a idade do
 *      cachorro na velocidade da aorta."
 *
 *   2. APENAS os 8 canonicos da whitelist recebem mock-value: paciente_nome,
 *      tutor_nome, especie, raca, idade, sexo, peso, data.
 *
 *   3. Default sem match → VAZIO (nunca `[${label}]` — esse padrao vazava
 *      como literal no PDF final por NAO casar no interpolateText regex).
 *
 *   4. Fields system (professional_*, clinic_name) tambem ficam vazios aqui
 *      — o motor preenche via interpolateText/ctx do usuario logado.
 *
 * Usado apenas pelo botao "Gerar PDF de Teste" no editor de templates.
 */

import type { ExtractedField } from '@/types'

type Matcher = {
  test: (fieldName: string) => boolean
  value: string | number | boolean
}

const TODAY_BR = (() => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
})()

const TODAY_ISO = (() => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
})()

/**
 * APENAS os 8 canonicos da Intervencao Cirurgica. Match exato por field_name.
 */
const CANONICAL_MOCKS: Matcher[] = [
  { test: n => n === 'paciente_nome', value: 'Snow' },
  { test: n => n === 'tutor_nome',    value: 'Joao da Silva' },
  { test: n => n === 'especie',       value: 'Canino' },
  { test: n => n === 'raca',          value: 'Border Collie' },
  { test: n => n === 'idade',         value: '5 anos' },
  { test: n => n === 'sexo',          value: 'Macho' },
  { test: n => n === 'peso',          value: 12.5 },
  { test: n => n === 'data',          value: TODAY_BR },
]

/**
 * Retorna um valor mock para o campo, ou string vazia.
 * - Campos custom_* SEMPRE vazios (regra do Diretor).
 * - Apenas canonicos exatos recebem mock-value de teste.
 * - System fields (professional_*, clinic_name) NAO preenchemos aqui
 *   — o motor de geracao popula via ctx do usuario logado.
 */
export function mockValueForField(field: ExtractedField): string | number | boolean {
  const name = field.field_name.toLowerCase()

  // INTERVENCAO CIRURGICA: custom_* sempre vazio
  if (field.is_custom === true || name.startsWith('custom_')) return ''

  // System fields vivem do ctx do usuario logado — nao mockar aqui
  if (name.startsWith('professional_') || name === 'clinic_name') return ''

  for (const m of CANONICAL_MOCKS) {
    if (m.test(name)) return m.value
  }

  // Default sem match: VAZIO (nao [label] — esse formato vazava literal no PDF)
  switch (field.type) {
    case 'date':     return TODAY_ISO
    case 'boolean':  return false
    default:         return ''
  }
}

/**
 * Constroi um dicionario completo de mocks para todos os fields do template.
 */
export function buildMockFieldValues(
  fields: ExtractedField[],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const f of fields) {
    out[f.field_name] = mockValueForField(f)
  }
  return out
}
