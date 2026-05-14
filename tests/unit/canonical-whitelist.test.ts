/**
 * Operacao Zero-Touch — Mapeamento Deterministico.
 *
 * Valida que o canonical-whitelist eh a UNICA fonte da verdade. Qualquer
 * rotulo fora da whitelist vira custom_*. A Trava de IA (LEI 1) e
 * matematicamente garantida.
 */

import {
  matchCanonicalLocal,
  isCanonical,
  isLegitCanonicalAssignment,
  buildCustomFieldName,
  guessCustomType,
  normalizeForMatch,
  SYSTEM_FIELDS,
  REQUIRED_DEFAULTS,
  CANONICAL_TYPES,
} from '../../src/lib/pdf/canonical-whitelist'

describe('normalizeForMatch', () => {
  it('remove acentos, ":", lowercase, colapsa espacos', () => {
    expect(normalizeForMatch('PACIENTE:')).toBe('paciente')
    expect(normalizeForMatch('Espécie:')).toBe('especie')
    expect(normalizeForMatch('  Raça  ')).toBe('raca')
    expect(normalizeForMatch('Nome do animal:')).toBe('nome do animal')
  })
})

describe('matchCanonicalLocal — canonicos basicos batem', () => {
  it('paciente_nome: paciente, pet, animal, nome do animal', () => {
    expect(matchCanonicalLocal('Paciente:')?.field_name).toBe('paciente_nome')
    expect(matchCanonicalLocal('PET:')?.field_name).toBe('paciente_nome')
    expect(matchCanonicalLocal('Animal:')?.field_name).toBe('paciente_nome')
    expect(matchCanonicalLocal('Nome do Animal:')?.field_name).toBe('paciente_nome')
  })

  it('tutor_nome: tutor, proprietario, dono, responsavel', () => {
    expect(matchCanonicalLocal('Tutor:')?.field_name).toBe('tutor_nome')
    expect(matchCanonicalLocal('Proprietário:')?.field_name).toBe('tutor_nome')
    expect(matchCanonicalLocal('Responsavel:')?.field_name).toBe('tutor_nome')
  })

  it('campos basicos: idade, peso, raca, sexo, especie', () => {
    expect(matchCanonicalLocal('Idade:')?.field_name).toBe('idade')
    expect(matchCanonicalLocal('Peso:')?.field_name).toBe('peso')
    expect(matchCanonicalLocal('Raça:')?.field_name).toBe('raca')
    expect(matchCanonicalLocal('Sexo:')?.field_name).toBe('sexo')
    expect(matchCanonicalLocal('Espécie:')?.field_name).toBe('especie')
  })

  it('tipos canonicos: peso=number, data=date, sexo=select', () => {
    expect(matchCanonicalLocal('Peso:')?.type).toBe('number')
    expect(matchCanonicalLocal('Data:')?.type).toBe('date')
    expect(matchCanonicalLocal('Sexo:')?.type).toBe('select')
  })

  it('campos de sistema marcados', () => {
    expect(matchCanonicalLocal('Veterinario:')?.is_system).toBe(true)
    expect(matchCanonicalLocal('CRMV:')?.is_system).toBe(true)
    expect(matchCanonicalLocal('Clinica:')?.is_system).toBe(true)
    expect(matchCanonicalLocal('Paciente:')?.is_system).toBe(false)
  })

  it('REQUIRED_DEFAULTS contem campos essenciais', () => {
    expect(matchCanonicalLocal('Paciente:')?.required).toBe(true)
    expect(matchCanonicalLocal('Tutor:')?.required).toBe(true)
    expect(matchCanonicalLocal('Data:')?.required).toBe(true)
    // Nao-essenciais
    expect(matchCanonicalLocal('Idade:')?.required).toBe(false)
  })
})

describe('matchCanonicalLocal — clinicos NUNCA batem (operacao Zero-Touch)', () => {
  it('Aorta, Mitral, Septo, Onda E: NAO batem com canonico', () => {
    expect(matchCanonicalLocal('Aorta:')).toBeNull()
    expect(matchCanonicalLocal('Mitral:')).toBeNull()
    expect(matchCanonicalLocal('Septo Diastole:')).toBeNull()
    expect(matchCanonicalLocal('Onda E:')).toBeNull()
    expect(matchCanonicalLocal('Fração de Ejeção:')).toBeNull()
    expect(matchCanonicalLocal('Velocidade da Onda E:')).toBeNull()
    expect(matchCanonicalLocal('IVS:')).toBeNull()
    expect(matchCanonicalLocal('LVPW:')).toBeNull()
    expect(matchCanonicalLocal('DDVE:')).toBeNull()
  })

  it('label ambíguo (raca cardiaca? not in whitelist) — nao bate', () => {
    expect(matchCanonicalLocal('Raca de Onda E:')).toBeNull()
    expect(matchCanonicalLocal('Pet Mitral:')).toBeNull()
  })
})

describe('isLegitCanonicalAssignment — defesa em profundidade', () => {
  it('pareamento legitimo retorna true', () => {
    expect(isLegitCanonicalAssignment('Paciente:', 'paciente_nome')).toBe(true)
    expect(isLegitCanonicalAssignment('Tutor:', 'tutor_nome')).toBe(true)
    expect(isLegitCanonicalAssignment('CRMV:', 'professional_crmv')).toBe(true)
  })

  it('alucinacao (Mitral -> raca) retorna FALSE', () => {
    expect(isLegitCanonicalAssignment('Mitral:', 'raca')).toBe(false)
    expect(isLegitCanonicalAssignment('Aorta:', 'paciente_nome')).toBe(false)
    expect(isLegitCanonicalAssignment('Onda E:', 'idade')).toBe(false)
  })

  it('canonico inexistente retorna false', () => {
    expect(isLegitCanonicalAssignment('Paciente:', 'nao_existe')).toBe(false)
  })
})

describe('buildCustomFieldName — labels clinicos viram custom_*', () => {
  it('Aorta -> custom_aorta', () => {
    expect(buildCustomFieldName('Aorta:')).toBe('custom_aorta')
  })

  it('Fração de Ejeção -> custom_fracao_de_ejecao', () => {
    expect(buildCustomFieldName('Fração de Ejeção:')).toBe('custom_fracao_de_ejecao')
  })

  it('Modo M / Doppler -> custom_modo_m_doppler', () => {
    // "/" eh removido, nao vira espaco; "modo m doppler"
    const result = buildCustomFieldName('Modo M / Doppler:')
    expect(result.startsWith('custom_modo_m')).toBe(true)
    expect(result).toContain('doppler')
  })

  it('Velocidade da Onda E -> custom_velocidade_da_onda_e', () => {
    expect(buildCustomFieldName('Velocidade da Onda E:')).toBe('custom_velocidade_da_onda_e')
  })

  it('label vazio -> custom_parametro (fallback)', () => {
    expect(buildCustomFieldName('')).toBe('custom_parametro')
    expect(buildCustomFieldName('::: :::')).toBe('custom_parametro')
  })

  it('idempotente: ja prefixado nao duplica', () => {
    expect(buildCustomFieldName('custom_foo')).toBe('custom_foo')
  })
})

describe('guessCustomType — heuristica de tipo', () => {
  it('unidades comuns -> number', () => {
    expect(guessCustomType('Peso (kg):')).toBe('number')
    expect(guessCustomType('Aorta (cm)')).toBe('number')
    expect(guessCustomType('FC bpm')).toBe('number')
  })

  it('observacoes/diagnostico -> textarea', () => {
    expect(guessCustomType('Observações:')).toBe('textarea')
    expect(guessCustomType('Diagnostico:')).toBe('textarea')
    expect(guessCustomType('Conclusão:')).toBe('textarea')
  })

  it('data/dia -> date', () => {
    expect(guessCustomType('Data:')).toBe('date')
  })

  it('default -> text', () => {
    expect(guessCustomType('Texto qualquer')).toBe('text')
  })
})

describe('SYSTEM_FIELDS', () => {
  it('contem os 4 campos do usuario logado', () => {
    expect(SYSTEM_FIELDS.has('professional_name')).toBe(true)
    expect(SYSTEM_FIELDS.has('professional_crmv')).toBe(true)
    expect(SYSTEM_FIELDS.has('professional_role')).toBe(true)
    expect(SYSTEM_FIELDS.has('clinic_name')).toBe(true)
  })

  it('NAO contem paciente_nome (preenchido pelo formulario)', () => {
    expect(SYSTEM_FIELDS.has('paciente_nome')).toBe(false)
  })
})
