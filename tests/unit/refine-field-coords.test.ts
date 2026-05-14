import { refineFieldsWithPdfText } from '../../src/lib/pdf/refine-field-coords'
import type { PdfTextItem } from '../../src/lib/pdf-to-images'
import type { ExtractedField } from '../../src/types'

const makeItem = (
  str: string, page: number, x: number, y: number, w: number, h = 2,
): PdfTextItem => ({
  str, page, x_pct: x, y_pct: y, w_pct: w, h_pct: h,
  baseline_y_pct: y + h,
})

const makeField = (
  field_name: string, label: string, vision_x = 30, vision_y = 50,
): ExtractedField => ({
  field_name, label, type: 'text', description: '', required: false,
  x_percent: vision_x, y_percent: vision_y,
  width_percent: 25, height_percent: 3,
  page: 0,
})

describe('refineFieldsWithPdfText', () => {
  it('sem textItems: mantem coords originais da Vision', () => {
    const fields = [makeField('paciente', 'PACIENTE', 30, 20)]
    const r = refineFieldsWithPdfText(fields, [])
    expect(r.refined).toEqual(fields)
    expect(r.stats.refined_count).toBe(0)
    expect(r.stats.fallback_count).toBe(1)
  })

  it('match exato em uma linha: refina coords X/Y para apos o label', () => {
    const fields = [makeField('paciente', 'PACIENTE', 35, 35)]  // Vision errou — label real esta em (10,15)
    const items: PdfTextItem[] = [
      makeItem('PACIENTE', 0, 10, 15, 8, 2.5),
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(1)
    // X = end do label (10 + 8 = 18) + gap (0.8) = 18.8
    expect(r.refined[0].x_percent).toBeCloseTo(18.8, 1)
    // Y = topo do label (15)
    expect(r.refined[0].y_percent).toBeCloseTo(15, 1)
  })

  it('match case-insensitive e ignora acentos', () => {
    const fields = [makeField('especie', 'ESPÉCIE', 30, 30)]
    const items: PdfTextItem[] = [
      makeItem('Especie', 0, 10, 40, 8, 2),
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(1)
    expect(r.refined[0].y_percent).toBeCloseTo(40, 1)
  })

  it('ignora ":" no label e no texto extraido', () => {
    const fields = [makeField('peso', 'Peso:', 30, 30)]
    const items: PdfTextItem[] = [
      makeItem('PESO:', 0, 5, 50, 5, 2),
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(1)
    expect(r.refined[0].y_percent).toBeCloseTo(50, 1)
  })

  it('label multi-palavra fragmentado em items: agrupa por linha', () => {
    // PDF tem "Frequência cardíaca" quebrado em 2 items na mesma linha
    const fields = [makeField('fc', 'Frequencia cardiaca', 30, 30)]
    const items: PdfTextItem[] = [
      makeItem('Frequencia', 0, 10, 60, 15, 2.5),
      makeItem('cardiaca',   0, 26, 60, 12, 2.5),
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(1)
    // O VALOR vem apos a sequencia toda: end do segundo item (26+12=38) + gap
    expect(r.refined[0].x_percent).toBeCloseTo(38 + 0.8, 1)
    expect(r.refined[0].y_percent).toBeCloseTo(60, 1)
  })

  it('label nao encontrado: fallback para coords da Vision', () => {
    const fields = [makeField('inexistente', 'ZZZZZ INEXISTENTE', 42, 73)]
    const items: PdfTextItem[] = [
      makeItem('PACIENTE', 0, 10, 15, 8),
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(0)
    expect(r.stats.fallback_count).toBe(1)
    expect(r.refined[0].x_percent).toBe(42)
    expect(r.refined[0].y_percent).toBe(73)
  })

  it('multi-pagina: refina coords usando textItems da pagina correta', () => {
    const fields = [
      { ...makeField('paciente', 'PACIENTE', 99, 99), page: 0 },
      { ...makeField('diagnostico', 'DIAGNOSTICO', 99, 99), page: 1 },
    ]
    const items: PdfTextItem[] = [
      makeItem('PACIENTE', 0, 10, 15, 8, 2),
      makeItem('DIAGNOSTICO', 1, 5, 25, 12, 2.5),  // pagina 1
    ]
    const r = refineFieldsWithPdfText(fields, items)
    expect(r.stats.refined_count).toBe(2)
    expect(r.refined[0].y_percent).toBeCloseTo(15, 1)
    expect(r.refined[1].y_percent).toBeCloseTo(25, 1)
  })

  it('preserva width sugerido pela Vision (com minimo de 15%)', () => {
    const f1 = makeField('campo1', 'CAMPO1', 30, 30)
    f1.width_percent = 5  // muito pequeno
    const f2 = makeField('campo2', 'CAMPO2', 30, 30)
    f2.width_percent = 35
    const items: PdfTextItem[] = [
      makeItem('CAMPO1', 0, 10, 10, 8, 2),
      makeItem('CAMPO2', 0, 10, 20, 8, 2),
    ]
    const r = refineFieldsWithPdfText([f1, f2], items)
    expect(r.refined[0].width_percent).toBeGreaterThanOrEqual(15)
    expect(r.refined[1].width_percent).toBeCloseTo(35, 1)
  })

  it('height ajustado a partir do label medido (com folga de 15%)', () => {
    const f = makeField('paciente', 'PACIENTE', 30, 30)
    f.height_percent = 99  // valor maluco da Vision
    const items: PdfTextItem[] = [
      makeItem('PACIENTE', 0, 10, 15, 8, 2.0),  // altura medida = 2.0
    ]
    const r = refineFieldsWithPdfText([f], items)
    // 2.0 * 1.15 = 2.3
    expect(r.refined[0].height_percent).toBeCloseTo(2.3, 1)
  })

  it('clampa x_percent para nao ultrapassar 95% da pagina', () => {
    const f = makeField('campo', 'LABEL_AT_END', 30, 30)
    const items: PdfTextItem[] = [
      makeItem('LABEL_AT_END', 0, 80, 50, 18, 2),  // label termina em x=98
    ]
    const r = refineFieldsWithPdfText([f], items)
    expect(r.refined[0].x_percent).toBeLessThanOrEqual(95)
  })

  it('estrategia 2: primeira palavra match — usa fim da linha', () => {
    const f = makeField('endereco', 'Endereco completo', 30, 30)
    const items: PdfTextItem[] = [
      // O PDF tem so "Endereco" sem "completo"
      makeItem('Endereco', 0, 5, 70, 10, 2),
    ]
    const r = refineFieldsWithPdfText([f], items)
    expect(r.stats.refined_count).toBe(1)
    expect(r.refined[0].y_percent).toBeCloseTo(70, 1)
  })
})
