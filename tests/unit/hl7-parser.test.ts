/**
 * Unit — Parser HL7 (ORU) dos aparelhos de laboratório (Fase 2).
 */
import { parseHL7ORU, flagFromValue } from '@/lib/lab/hl7-parser'

const MSG = [
  'MSH|^~\\&|URIT|LAB|SYSVETMAX|CLINICA|20260907||ORU^R01|1|P|2.3.1',
  'PID|1||PET123||Rex',
  'OBR|1|||HEM^Hemograma^L',
  'OBX|1|NM|718-7^Hemoglobina^LN||13.5|g/dL|12.0-16.0|N|||F',
  'OBX|2|NM|4544-3^Hematocrito^LN||55|%|37-55|H|||F',
  'OBX|3|NM|CREA^Creatinina||0.3|mg/dL|0.5-1.5||||F',
].join('\r')

describe('flagFromValue', () => {
  it('L abaixo, H acima, N dentro', () => {
    expect(flagFromValue('0.3', 0.5, 1.5)).toBe('L')
    expect(flagFromValue('2.0', 0.5, 1.5)).toBe('H')
    expect(flagFromValue('1.0', 0.5, 1.5)).toBe('N')
  })
  it('null quando não numérico ou sem faixa', () => {
    expect(flagFromValue('Positivo', 0, 1)).toBeNull()
    expect(flagFromValue('1.0', null, null)).toBeNull()
  })
})

describe('parseHL7ORU', () => {
  const res = parseHL7ORU(MSG)

  it('extrai o painel do OBR', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.panel).toBe('Hemograma')
  })
  it('extrai um analito por OBX com valor', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes).toHaveLength(3)
    expect(res.analytes[0].name).toBe('Hemoglobina')
    expect(res.analytes[0].value).toBe('13.5')
    expect(res.analytes[0].unit).toBe('g/dL')
  })
  it('usa a flag explícita do OBX quando presente', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes[1].flag).toBe('H')   // Hematocrito 55, flag H no campo
  })
  it('deriva a flag da faixa quando o OBX não traz', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes[2].flag).toBe('L')   // Creatinina 0.3 < 0.5
    expect(res.analytes[2].ref_low).toBe(0.5)
    expect(res.analytes[2].ref_high).toBe(1.5)
  })
  it('ignora OBX sem valor', () => {
    const r = parseHL7ORU('MSH|^~\\&|A|B|C|D\rOBX|1|NM|X^Vazio||\rOBX|2|NM|Y^Cheio||9|u|')
    if ('error' in r) throw new Error(r.error)
    expect(r.analytes).toHaveLength(1)
    expect(r.analytes[0].name).toBe('Cheio')
  })
  it('rejeita mensagem sem MSH', () => {
    expect(parseHL7ORU('não é hl7')).toHaveProperty('error')
  })
})
