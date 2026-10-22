/** Unit — de-para código do aparelho → analito do catálogo. */
import { resolveAnalyte, normKey, type AnalyteMapping } from '@/lib/lab/analyte-resolve'

const maps: AnalyteMapping[] = [
  { analyte_id: 'a-wbc', device_code: 'WBC', device_name: 'White Blood Cells', lab_agent_id: null },
  { analyte_id: 'a-hgb', device_code: '718-7', device_name: 'Hemoglobin', lab_agent_id: null },
  { analyte_id: 'a-crea-urit', device_code: 'CREA', device_name: null, lab_agent_id: 'agent-1' },
]

describe('normKey', () => {
  it('normaliza acento/caixa/símbolos', () => {
    expect(normKey('Hemácias %')).toBe('HEMACIAS')
    expect(normKey('718-7')).toBe('7187')
  })
})

describe('resolveAnalyte', () => {
  it('casa por código', () => expect(resolveAnalyte('WBC', 'qualquer', maps)).toBe('a-wbc'))
  it('casa por nome quando não há código', () => expect(resolveAnalyte(null, 'White Blood Cells', maps)).toBe('a-wbc'))
  it('código LOINC com hífen', () => expect(resolveAnalyte('718-7', null, maps)).toBe('a-hgb'))
  it('retorna null quando não mapeado', () => expect(resolveAnalyte('XYZ', 'desconhecido', maps)).toBeNull())
  it('mapeamento específico do aparelho só vale para o próprio agente', () => {
    expect(resolveAnalyte('CREA', null, maps, 'agent-1')).toBe('a-crea-urit')
    expect(resolveAnalyte('CREA', null, maps, 'agent-2')).toBeNull() // outro aparelho
  })
})
