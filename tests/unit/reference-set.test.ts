import { applyReferenceSet, pickReferenceSet, type ReferenceItem, type ReferenceSet } from '@/lib/lab/reference-set'
import type { HL7Analyte } from '@/lib/lab/hl7-parser'

const item = (p: Partial<ReferenceItem> & { label: string }): ReferenceItem => ({
  id: p.label, sort_order: 0, analyte_code: null, section: 'erythrogram', input_source: 'device',
  unit: null, ref_text: null, ref_low: null, ref_high: null,
  ref_abs_text: null, ref_abs_low: null, ref_abs_high: null,
  is_visible: true, is_editable: false, default_text: null, ...p,
})

const set = (items: ReferenceItem[], extra: Partial<ReferenceSet> = {}): ReferenceSet => ({
  id: 's1', panel_key: 'hemograma', species: 'dog', name: 'Hemograma — Canino (Animais)', items, ...extra,
})

const an = (code: string, value: string, extra: Partial<HL7Analyte> = {}): HL7Analyte => ({
  code, name: code, value, unit: null, ref_text: null, ref_low: null, ref_high: null, flag: null, ...extra,
})

describe('escolha do conjunto', () => {
  const cao   = set([], { id: 'cao',   species: 'dog' })
  const geral = set([], { id: 'geral', species: null })
  const bio   = set([], { id: 'bio',   species: null, panel_key: 'bioquimico' })

  it('prefere a tabela da espécie do pet', () => {
    expect(pickReferenceSet([geral, cao, bio], 'hemograma', 'dog')?.id).toBe('cao')
  })

  it('cai na tabela geral quando não há uma da espécie', () => {
    expect(pickReferenceSet([geral, cao], 'hemograma', 'cat')?.id).toBe('geral')
  })

  it('sem tabela para o exame, devolve null — o laudo volta ao comportamento antigo', () => {
    expect(pickReferenceSet([cao], 'bioquimico', 'dog')).toBeNull()
    expect(pickReferenceSet([], 'hemograma', 'dog')).toBeNull()
  })

  it('não empresta a tabela de um exame para outro', () => {
    expect(pickReferenceSet([bio], 'hemograma', 'dog')).toBeNull()
  })
})

describe('a tabela da clínica manda no laudo', () => {
  it('imprime a faixa da CLÍNICA, não a que o aparelho mandou', () => {
    const r = applyReferenceSet(
      set([item({ label: 'ERITRÓCITOS', analyte_code: 'RBC', ref_text: '5,5 A 8,5 milhões/mm³', ref_low: 5.5, ref_high: 8.5 })]),
      [an('RBC', '9.4', { ref_text: '6.0-17.0', unit: '10*12/L' })],
    )
    expect(r.rows[0].ref).toBe('5,5 A 8,5 milhões/mm³')
    expect(r.rows[0].value).toBe('9.4')
  })

  it('marca H/L pela faixa da clínica', () => {
    const conj = set([item({ label: 'ERITRÓCITOS', analyte_code: 'RBC', ref_low: 5.5, ref_high: 8.5 })])
    expect(applyReferenceSet(conj, [an('RBC', '9.4')]).rows[0].flag).toBe('H')
    expect(applyReferenceSet(conj, [an('RBC', '4.0')]).rows[0].flag).toBe('L')
    expect(applyReferenceSet(conj, [an('RBC', '7.0')]).rows[0].flag).toBe('N')
  })

  it('analito que a clínica não usa NÃO entra no laudo', () => {
    const r = applyReferenceSet(
      set([item({ label: 'ERITRÓCITOS', analyte_code: 'RBC' })]),
      [an('RBC', '9.4'), an('MPV', '10.2'), an('PDW', '16.1')],
    )
    expect(r.rows.map(x => x.label)).toEqual(['ERITRÓCITOS'])
    expect(r.unused.map(u => u.code).sort()).toEqual(['MPV', 'PDW'])
  })

  it('linha marcada como invisível some do laudo sem virar "não usado"', () => {
    const r = applyReferenceSet(
      set([item({ label: 'RDW', analyte_code: 'RDW_CV', is_visible: false })]),
      [an('RDW_CV', '12.9')],
    )
    expect(r.rows).toHaveLength(0)
    expect(r.unused).toHaveLength(0)
  })

  it('respeita a ordem configurada, não a ordem do aparelho', () => {
    const r = applyReferenceSet(
      set([
        item({ label: 'LEUCÓCITOS', analyte_code: 'WBC', sort_order: 30 }),
        item({ label: 'ERITRÓCITOS', analyte_code: 'RBC', sort_order: 10 }),
        item({ label: 'HEMOGLOBINA', analyte_code: 'HGB', sort_order: 20 }),
      ]),
      [an('WBC', '6.06'), an('HGB', '18.4'), an('RBC', '9.4')],
    )
    expect(r.rows.map(x => x.label)).toEqual(['ERITRÓCITOS', 'HEMOGLOBINA', 'LEUCÓCITOS'])
  })
})

describe('o que vem da lâmina (como a Amanda descreveu)', () => {
  const diferencial = set([
    item({ label: 'LEUCÓCITOS', analyte_code: 'WBC', section: 'leukogram', input_source: 'device', sort_order: 10 }),
    item({ label: 'SEGMENTADOS', section: 'leukogram', input_source: 'slide', ref_text: '60 A 77 %', ref_low: 60, ref_high: 77, sort_order: 20 }),
    item({ label: 'MONÓCITOS',   section: 'leukogram', input_source: 'slide', ref_text: '3 A 10 %',  ref_low: 3,  ref_high: 10, sort_order: 30 }),
  ])

  it('o diferencial do APARELHO é ignorado — vale o do microscópio', () => {
    const r = applyReferenceSet(diferencial, [an('WBC', '6.06'), an('NEU%', '75.0'), an('MON%', '4.0')])
    const seg = r.rows.find(x => x.label === 'SEGMENTADOS')!
    expect(seg.value).toBeNull()        // em branco até alguém digitar
    expect(seg.editable).toBe(true)
    expect(r.rows.find(x => x.label === 'LEUCÓCITOS')!.value).toBe('6.06')
  })

  it('o valor digitado preenche a linha e marca H/L pela faixa da clínica', () => {
    const r = applyReferenceSet(diferencial, [an('WBC', '6.06')], { SEGMENTADOS: '82', MONÓCITOS: '5' })
    expect(r.rows.find(x => x.label === 'SEGMENTADOS')!.value).toBe('82')
    expect(r.rows.find(x => x.label === 'SEGMENTADOS')!.flag).toBe('H')
    expect(r.rows.find(x => x.label === 'MONÓCITOS')!.flag).toBe('N')
  })
})

describe('correção manual de valor do aparelho (plaquetas)', () => {
  const conj = set([item({
    label: 'CONTAGEM PLAQUETÁRIA', analyte_code: 'PLT', section: 'platelets',
    input_source: 'device', is_editable: true, ref_text: '200 a 500 mil/mm³', ref_low: 200, ref_high: 500,
  })])

  it('sem correção, imprime o que o aparelho contou', () => {
    const r = applyReferenceSet(conj, [an('PLT', '63')])
    expect(r.rows[0].value).toBe('63')
    expect(r.rows[0].flag).toBe('L')
    expect(r.rows[0].overridden).toBe(false)
    expect(r.rows[0].editable).toBe(true)
  })

  it('com correção, o valor do laboratório ganha e a troca fica registrada', () => {
    const r = applyReferenceSet(conj, [an('PLT', '63')], { 'CONTAGEM PLAQUETÁRIA': '310' })
    expect(r.rows[0].value).toBe('310')
    expect(r.rows[0].flag).toBe('N')
    expect(r.rows[0].overridden).toBe(true)
  })
})

describe('linhas de texto', () => {
  const conj = set([
    item({ label: 'PESQUISA DE HEMATOZOÁRIOS', section: 'platelets', input_source: 'text', default_text: 'Amostra negativa.' }),
    item({ label: 'OBSERVAÇÕES SÉRIE VERMELHA', input_source: 'text' }),
  ])

  it('traz o texto padrão quando ninguém digitou', () => {
    const r = applyReferenceSet(conj, [])
    expect(r.rows.find(x => x.label === 'PESQUISA DE HEMATOZOÁRIOS')!.value).toBe('Amostra negativa.')
    expect(r.rows.find(x => x.label === 'OBSERVAÇÕES SÉRIE VERMELHA')!.value).toBeNull()
  })

  it('o que foi digitado substitui o padrão', () => {
    const r = applyReferenceSet(conj, [], { 'PESQUISA DE HEMATOZOÁRIOS': 'Presença de Babesia sp.' })
    expect(r.rows[0].value).toBe('Presença de Babesia sp.')
  })
})

describe('par relativo/absoluto do leucograma', () => {
  it('separa % e # do mesmo analito nas duas colunas', () => {
    const r = applyReferenceSet(
      set([item({
        label: 'SEGMENTADOS', analyte_code: 'NEU', section: 'leukogram', input_source: 'device',
        ref_text: '60 A 77 %', ref_low: 60, ref_high: 77,
        ref_abs_text: '3300 A 12800', ref_abs_low: 3300, ref_abs_high: 12800,
      })]),
      [an('NEU%', '75.0', { unit: '%' }), an('NEU#', '4545', { unit: 'mm³' })],
    )
    expect(r.rows[0].value).toBe('75.0')
    expect(r.rows[0].value_abs).toBe('4545')
    expect(r.rows[0].flag).toBe('N')
    expect(r.rows[0].flag_abs).toBe('N')
    expect(r.rows[0].ref_abs).toBe('3300 A 12800')
    expect(r.unused).toHaveLength(0)
  })
})
