import { describe, it, expect } from '@jest/globals'
import { isReportVisible, REPORT_ROUTINE } from '@/lib/reports/visibility'

const ON = { usaBoleto: true, usesExamRejection: true }
const OFF = { usaBoleto: false, usesExamRejection: false }

describe('isReportVisible — os relatórios do antigo ALWAYS_ON agora são desligáveis', () => {
  const alwaysOnKeys = [
    'dashboard', 'smart', 'commissions', 'controlled', 'aging',
    'cashflow', 'revenue', 'stock_position', 'clients', 'dre_company',
  ]

  it.each(alwaysOnKeys)('%s some quando a clínica desliga', (key) => {
    expect(isReportVisible(key, { [key]: false }, ON)).toBe(false)
  })

  it.each(alwaysOnKeys)('%s aparece quando ligado', (key) => {
    expect(isReportVisible(key, { [key]: true }, ON)).toBe(true)
  })

  it('chave ausente conta como ligada (config antiga sem as chaves novas)', () => {
    expect(isReportVisible('dashboard', {}, ON)).toBe(true)
    expect(isReportVisible('dashboard', null, ON)).toBe(true)
  })

  it('só `false` explícito desliga — valor estranho não derruba o relatório', () => {
    expect(isReportVisible('aging', { aging: undefined }, ON)).toBe(true)
  })
})

describe('isReportVisible — relatório preso a uma rotina', () => {
  it('Movimentação de Boletos exige a rotina de Boletos', () => {
    expect(isReportVisible('boleto_movement', { boleto_movement: true }, OFF)).toBe(false)
    expect(isReportVisible('boleto_movement', { boleto_movement: true }, ON)).toBe(true)
  })
  it('Exames Não Realizados exige o Fluxo de Rejeição', () => {
    expect(isReportVisible('exam_rejections', { exam_rejections: true }, OFF)).toBe(false)
    expect(isReportVisible('exam_rejections', { exam_rejections: true }, ON)).toBe(true)
  })
  it('a rotina ligada não ressuscita relatório desligado pela clínica', () => {
    expect(isReportVisible('boleto_movement', { boleto_movement: false }, ON)).toBe(false)
  })
  it('relatório comum não depende de rotina alguma', () => {
    expect(isReportVisible('dre', { dre: true }, OFF)).toBe(true)
  })
  it('o mapa de rotinas cobre exatamente os dois casos conhecidos', () => {
    expect(Object.keys(REPORT_ROUTINE).sort()).toEqual(['boleto_movement', 'exam_rejections'])
  })
})
