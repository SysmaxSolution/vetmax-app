/** Unit — parser genérico de demonstrativo de convênio (prepara 1.9 AVA). */
import { parseConvenioCsv, splitCsvLine, detectSeparator, parseMoney, parseDateISO } from '@/lib/finance/convenio-csv'

describe('helpers', () => {
  it('detecta separador ;', () => expect(detectSeparator('a;b;c')).toBe(';'))
  it('split respeita aspas', () => expect(splitCsvLine('"a;b";c', ';')).toEqual(['a;b', 'c']))
  it('valor BR', () => expect(parseMoney('R$ 1.234,56')).toBe(1234.56))
  it('valor US', () => expect(parseMoney('1234.56')).toBe(1234.56))
  it('data dd/mm/yyyy', () => expect(parseDateISO('20/09/2026')).toBe('2026-09-20'))
})

describe('parseConvenioCsv', () => {
  const csv = 'Guia;Data;Tutor;Pet;Procedimento;Repasse;Copart\n123;20/09/2026;Maria;Rex;Consulta;R$ 80,00;R$ 20,00\n124;21/09/2026;João;Bela;Vacina;50,00;0'
  it('lê cabeçalhos sem mapping', () => {
    const r = parseConvenioCsv(csv) as any
    expect(r.headers).toContain('Repasse')
    expect(r.lines).toHaveLength(0)
  })
  it('aplica mapping e converte', () => {
    const r = parseConvenioCsv(csv, { externalId: 'Guia', serviceDate: 'Data', tutorName: 'Tutor', petName: 'Pet', procedureName: 'Procedimento', repassValue: 'Repasse', coparticipationValue: 'Copart' }) as any
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0]).toMatchObject({ external_appointment_id: '123', service_date: '2026-09-20', tutor_name_raw: 'Maria', repass_value: 80, coparticipation_value: 20 })
    expect(r.lines[1].repass_value).toBe(50)
  })
  it('exige coluna de repasse', () => {
    const r = parseConvenioCsv(csv, { tutorName: 'Tutor' }) as any
    expect(r.error).toBeTruthy()
  })
})
