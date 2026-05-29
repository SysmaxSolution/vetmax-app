/**
 * Unit — Extração unificada de voz clínica (normalize + merge cumulativo).
 */

import {
  normalizeUnifiedExtraction, mergeExtractions, summarizeExtraction, EMPTY_EXTRACTION,
} from '@/lib/voice/unified-extraction'

describe('normalizeUnifiedExtraction', () => {
  test('TC-UVE-001 → vitais com vírgula decimal e unidades são coeridos', () => {
    const x = normalizeUnifiedExtraction({ vitals: { temperature: '39,5', heart_rate: '120 bpm', spo2: 97 } })
    expect(x.vitals?.temperature).toBe(39.5)
    expect(x.vitals?.heart_rate).toBe(120)
    expect(x.vitals?.spo2).toBe(97)
  })

  test('TC-UVE-002 → vitals vazio vira null', () => {
    const x = normalizeUnifiedExtraction({ vitals: { temperature: null, heart_rate: '' } })
    expect(x.vitals).toBeNull()
  })

  test('TC-UVE-003 → fluido sem volume é descartado; direção inferida pelo kind', () => {
    const x = normalizeUnifiedExtraction({ fluids: [
      { kind: 'urine', volume_ml: 200 },
      { kind: 'fluid', volume_ml: 500 },
      { kind: 'emesis' }, // sem volume → descartado
    ] })
    expect(x.fluids).toHaveLength(2)
    expect(x.fluids[0]).toMatchObject({ direction: 'out', kind: 'urine', volume_ml: 200 })
    expect(x.fluids[1]).toMatchObject({ direction: 'in', kind: 'fluid', volume_ml: 500 })
  })

  test('TC-UVE-004 → medicação sem dose/via/freq marca needs_review', () => {
    const x = normalizeUnifiedExtraction({ medications: [
      { name: 'Amoxicilina' },
      { name: 'Dipirona', dose: '500mg', route: 'IV', frequency_hours: 8 },
    ] })
    expect(x.medications[0].needs_review).toBe(true)
    expect(x.medications[1].needs_review).toBe(false)
  })

  test('TC-UVE-005 → frequência aproxima para a cadência permitida (7 → 6 ou 8)', () => {
    const x = normalizeUnifiedExtraction({ medications: [{ name: 'X', dose: '1', route: 'VO', frequency_hours: 7 }] })
    expect([6, 8]).toContain(x.medications[0].frequency_hours)
  })

  test('TC-UVE-006 → tarefa sem descrição é descartada; kind inválido vira other', () => {
    const x = normalizeUnifiedExtraction({ tasks: [
      { kind: 'banho', description: 'Dar ração úmida', frequency_hours: 8 },
      { kind: 'exam', description: '' },
    ] })
    expect(x.tasks).toHaveLength(1)
    expect(x.tasks[0]).toMatchObject({ kind: 'other', description: 'Dar ração úmida', frequency_hours: 8 })
  })

  test('TC-UVE-007 → booleanos em pt-BR no checklist/clinical_data', () => {
    const x = normalizeUnifiedExtraction({
      checklist: { fasting_confirmed: 'sim', consent_signed: 'não' },
      clinical_data: { isolation_required: 'sim', diet_notes: 'jejum' },
    })
    expect(x.checklist?.fasting_confirmed).toBe(true)
    expect(x.checklist?.consent_signed).toBe(false)
    expect(x.clinical_data?.isolation_required).toBe(true)
  })

  test('TC-UVE-008 → improvement_level inválido vira null', () => {
    expect(normalizeUnifiedExtraction({ improvement_level: 'otimo' }).improvement_level).toBeNull()
    expect(normalizeUnifiedExtraction({ improvement_level: 'melhorou' }).improvement_level).toBe('melhorou')
  })
})

describe('mergeExtractions (cumulativo, sem sobrescrever)', () => {
  test('TC-UVE-010 → 2ª gravação preenche campos vazios e mantém os já preenchidos', () => {
    const a = normalizeUnifiedExtraction({ vitals: { temperature: 39 } })
    const b = normalizeUnifiedExtraction({ vitals: { temperature: 40, heart_rate: 120 } })
    const m = mergeExtractions(a, b)
    expect(m.vitals?.temperature).toBe(39)   // mantém o 1º (não sobrescreve)
    expect(m.vitals?.heart_rate).toBe(120)   // preenche o vazio
  })

  test('TC-UVE-011 → listas SOMAM entre gravações', () => {
    const a = normalizeUnifiedExtraction({ tasks: [{ kind: 'feeding', description: 'Ração', frequency_hours: 8 }], medications: [{ name: 'Dipirona', dose: '1', route: 'IV', frequency_hours: 8 }] })
    const b = normalizeUnifiedExtraction({ tasks: [{ kind: 'exam', description: 'Raio-X', frequency_hours: null }] })
    const m = mergeExtractions(a, b)
    expect(m.tasks).toHaveLength(2)
    expect(m.medications).toHaveLength(1)
  })

  test('TC-UVE-012 → notes concatenam; partir de EMPTY é idempotente', () => {
    const a = normalizeUnifiedExtraction({ notes: 'Paciente alerta.' })
    const m = mergeExtractions(EMPTY_EXTRACTION, a)
    expect(m.notes).toBe('Paciente alerta.')
    const m2 = mergeExtractions(m, normalizeUnifiedExtraction({ notes: 'Aceitou alimentação.' }))
    expect(m2.notes).toContain('Paciente alerta.')
    expect(m2.notes).toContain('Aceitou alimentação.')
  })
})

describe('summarizeExtraction', () => {
  test('TC-UVE-020 → resumo lista só as abas com captura', () => {
    const x = normalizeUnifiedExtraction({
      vitals: { temperature: 39 },
      medications: [{ name: 'X', dose: '1', route: 'IV', frequency_hours: 8 }],
      tasks: [{ kind: 'exam', description: 'Raio-X' }],
    })
    const s = summarizeExtraction(x)
    const labels = s.map(i => i.label)
    expect(labels).toContain('sinais vitais')
    expect(labels).toContain('medicação(ões)')
    expect(labels).toContain('tarefa(s)')
    expect(labels).not.toContain('fluido(s)')
  })
})
