/**
 * LEI 1 — A Trava de IA (Whitelist Estrita).
 *
 * Esta é a UNICA FONTE DA VERDADE dos campos canonicos que o sistema
 * reconhece. Qualquer rotulo extraido do PDF que NAO bate com um sinonimo
 * exato listado aqui DEVE virar custom_* — sem excecoes, sem alucinacao.
 *
 * O matcher faz duas passagens:
 *   1. Pre-match local (deterministico): se o rotulo bate com algum sinonimo,
 *      resolve sem chamar a IA.
 *   2. Sobras vao ao Claude apenas para refinar a NORMALIZACAO do nome custom_
 *      (em geral o usuario nao precisa mexer depois).
 *
 * Defesa em profundidade: depois do Claude responder, validamos novamente
 * que toda atribuicao a um canonico vem de um sinonimo legitimo. Se o Claude
 * tentar mapear "Mitral" para "raca", forcamos custom_mitral.
 */

import type { FieldType } from '@/types'

/**
 * Sinonimos por campo canonico. Todos os sinonimos sao normalizados via
 * `normalizeForMatch` (lowercase, sem acentos, sem pontuacao, ":" removido).
 */
export const CANONICAL_WHITELIST: Record<string, readonly string[]> = {
  // Cadastro do animal
  paciente_nome: ['paciente', 'pet', 'animal', 'nome do animal', 'nome do pet', 'nome'],
  especie: ['especie', 'species'],
  raca: ['raca', 'race', 'breed'],
  idade: ['idade', 'age'],
  sexo: ['sexo', 'gender', 'genero'],
  peso: ['peso', 'weight'],
  pelagem: ['pelagem', 'cor', 'cor do pelo', 'pelo'],

  // Cadastro do tutor
  tutor_nome: ['tutor', 'proprietario', 'dono', 'responsavel'],
  tutor_cpf: ['cpf'],
  tutor_telefone: ['telefone', 'celular', 'fone'],
  tutor_email: ['email', 'e-mail'],
  tutor_endereco: ['endereco', 'rua'],
  tutor_cep: ['cep'],

  // Documento
  data: ['data', 'data do exame', 'dia', 'date'],
  hora: ['hora', 'horario', 'time'],

  // Sinais vitais GENERICOS — NAO confundir com parametros cardiologicos
  // (Aorta, Mitral, etc. NUNCA mapeiam aqui)
  temperatura: ['temperatura', 'temp', 't'],
  frequencia_cardiaca: ['fc', 'frequencia cardiaca', 'freq cardiaca'],
  frequencia_respiratoria: ['fr', 'frequencia respiratoria', 'freq respiratoria'],
  pressao_arterial: ['pa', 'pressao arterial'],

  // Textos clinicos longos
  anamnese: ['anamnese', 'queixa', 'historico'],
  observacoes: ['observacoes', 'obs', 'consideracoes'],
  diagnostico: ['diagnostico', 'conclusao'],
  tratamento: ['tratamento', 'prescricao', 'medicacao'],

  // Profissional (campos de sistema — preenchidos automaticamente pelo
  // usuario logado, sem input manual no formulario de geracao)
  professional_name: ['veterinario', 'medico', 'mv', 'medico veterinario'],
  professional_crmv: ['crmv'],
  professional_role: ['cargo', 'especialidade', 'cargo do profissional'],
  clinic_name: ['clinica', 'hospital', 'estabelecimento'],
}

/** Tipos canonicos. Default e 'text' para o que nao estiver aqui. */
export const CANONICAL_TYPES: Record<string, FieldType> = {
  peso: 'number',
  idade: 'text',                // pode ser "5 anos" — string
  temperatura: 'number',
  frequencia_cardiaca: 'number',
  frequencia_respiratoria: 'number',
  data: 'date',
  hora: 'text',
  sexo: 'select',
  anamnese: 'textarea',
  observacoes: 'textarea',
  diagnostico: 'textarea',
  tratamento: 'textarea',
}

/** Campos de sistema — preenchidos via contexto do usuario logado. */
export const SYSTEM_FIELDS = new Set([
  'professional_name',
  'professional_crmv',
  'professional_role',
  'clinic_name',
])

/** Campos required default (clinicamente essenciais). */
export const REQUIRED_DEFAULTS = new Set([
  'paciente_nome',
  'tutor_nome',
  'data',
])

/**
 * Normaliza um rotulo para comparacao:
 *   - lowercase
 *   - remove acentos
 *   - remove pontuacao (":", ".", ",", ";")
 *   - colapsa espacos
 *   - trim
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Match deterministico contra a whitelist. Retorna o field_name canonico
 * se um sinonimo bate EXATAMENTE. null se nao bate.
 */
export function matchCanonicalLocal(labelText: string): {
  field_name: string
  type: FieldType
  is_system: boolean
  required: boolean
} | null {
  const norm = normalizeForMatch(labelText)
  if (!norm) return null

  for (const [canonical, synonyms] of Object.entries(CANONICAL_WHITELIST)) {
    if ((synonyms as readonly string[]).includes(norm)) {
      return {
        field_name: canonical,
        type: CANONICAL_TYPES[canonical] ?? 'text',
        is_system: SYSTEM_FIELDS.has(canonical),
        required: REQUIRED_DEFAULTS.has(canonical),
      }
    }
  }
  return null
}

/** Retorna true se `fieldName` e um canonico declarado. */
export function isCanonical(fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(CANONICAL_WHITELIST, fieldName)
}

/**
 * Para uma atribuicao Claude→canonico, valida que o label original e um
 * sinonimo legitimo. Retorna true se OK, false se foi alucinacao.
 */
export function isLegitCanonicalAssignment(labelText: string, canonical: string): boolean {
  const synonyms = CANONICAL_WHITELIST[canonical]
  if (!synonyms) return false
  const norm = normalizeForMatch(labelText)
  return (synonyms as readonly string[]).includes(norm)
}

/**
 * Cria um field_name custom_* a partir do rotulo. Idempotente.
 *   "Velocidade da Onda E:" → "custom_velocidade_da_onda_e"
 *   "Aorta:"                → "custom_aorta"
 *   "Modo M / Doppler:"     → "custom_modo_m_doppler"
 */
export function buildCustomFieldName(labelText: string): string {
  const norm = normalizeForMatch(labelText)
    .replace(/[^a-z0-9_\s]/g, '')   // remove "/", "-", etc
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50) || 'parametro'
  return norm.startsWith('custom_') ? norm : `custom_${norm}`
}

/**
 * Sugere um type para um custom_ a partir do conteudo do rotulo.
 * Heuristicas baratas — o usuario sempre pode editar.
 */
export function guessCustomType(labelText: string): FieldType {
  const norm = normalizeForMatch(labelText)
  if (/\b(kg|cm|mm|mmhg|bpm|ml|mg|hz|ms)\b/.test(norm)) return 'number'
  if (/\bdata\b|\bdia\b/.test(norm)) return 'date'
  if (/\bobservac|conclus|diagnost|anamnese|tratamento|prescricao\b/.test(norm)) return 'textarea'
  return 'text'
}
