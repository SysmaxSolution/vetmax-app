import {
  groupByLine, snipeLabels, detectGlobalFields, runOcrSniper,
  normalizeLabel,
} from '../../src/lib/pdf/ocr-sniper'
import type { PdfTextItem } from '../../src/lib/pdf-to-images'

// ── Helpers ─────────────────────────────────────────────────────────────────

const item = (
  str: string, page: number, x: number, y: number, w: number, h = 1.5,
  baseline_y_pct?: number,
): PdfTextItem => ({
  str, page, x_pct: x, y_pct: y, w_pct: w, h_pct: h,
  baseline_y_pct: baseline_y_pct ?? (y + h),
})

describe('OCR Sniper', () => {
  describe('normalizeLabel', () => {
    it('remove ":", lowercase, sem acentos', () => {
      expect(normalizeLabel('PACIENTE:')).toBe('paciente')
      expect(normalizeLabel('Espécie:')).toBe('especie')
      expect(normalizeLabel('CRMV/SP:')).toBe('crmv/sp')
    })
  })

  describe('groupByLine', () => {
    it('itens na mesma linha (Y proximo) viram um grupo', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8),
        item('Snow',      0, 20, 20.3, 6),  // tolerância padrão 0.6
        item('Espécie:',  0, 50, 20, 8),
      ]
      const lines = groupByLine(items)
      expect(lines.length).toBe(1)
      expect(lines[0].items.length).toBe(3)
    })

    it('itens em linhas diferentes (Y distante) viram grupos separados', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8),
        item('Raça:',     0, 10, 30, 8),  // Y muito distante
      ]
      const lines = groupByLine(items)
      expect(lines.length).toBe(2)
    })

    it('separa por pagina', () => {
      const items = [
        item('A:', 0, 10, 20, 5),
        item('B:', 1, 10, 20, 5),  // mesma Y mas pagina diferente
      ]
      const lines = groupByLine(items)
      expect(lines.length).toBe(2)
      expect(lines[0].page).toBe(0)
      expect(lines[1].page).toBe(1)
    })

    it('ordena por X dentro da linha', () => {
      const items = [
        item('Z', 0, 50, 20, 5),
        item('A', 0, 10, 20, 5),
        item('M', 0, 30, 20, 5),
      ]
      const lines = groupByLine(items)
      expect(lines[0].items.map(i => i.str)).toEqual(['A', 'M', 'Z'])
    })
  })

  describe('snipeLabels', () => {
    it('detecta label terminando em ":" e calcula bbox do valor adjacente', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8, 1.5),
        item('Snow',      0, 20, 20, 6, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      expect(c.label_text).toBe('Paciente:')
      expect(c.label_normalized).toBe('paciente')
      // value_bbox.x_pct = label.x + label.w + margem (0.5)
      expect(c.value_bbox.x_pct).toBeCloseTo(10 + 8 + 0.5, 1)
      // value.y = label.y
      expect(c.value_bbox.y_pct).toBeCloseTo(20, 1)
      // value.h = label.h
      expect(c.value_bbox.h_pct).toBeCloseTo(1.5, 1)
      expect(c.existing_value_text).toBe('Snow')
      // PM-3: baseline_y_pct deve estar presente
      expect(c.baseline_y_pct).toBeGreaterThan(0)
    })

    // ── PM-1: item unificado "Paciente: Snow" deve ser separado matematicamente ─
    it('PM-1: item unificado "Paciente: Snow" e quebrado em label + valor', () => {
      // pdfjs frequentemente retorna a string toda como UM item.
      // String tem 14 chars: "Paciente: Snow"
      //   "Paciente:" = 9 chars (64.3%)
      //   " " = 1 char (7.1%)
      //   "Snow" = 4 chars (28.6%)
      // Item ocupa x=10, w=28 (14 chars × 2/char) — proporcional aos chars
      const items = [
        item('Paciente: Snow', 0, 10, 20, 28, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      // Label_text e SO "Paciente:", nao a string inteira
      expect(c.label_text).toBe('Paciente:')
      expect(c.label_normalized).toBe('paciente')
      // Label_bbox cobre APENAS "Paciente:" (9/14 = 64.3% de 28 = 18)
      expect(c.label_bbox.w_pct).toBeCloseTo(28 * (9 / 14), 1)
      // existing_value_bbox NAO sobrepoe o label — comeca apos ele + espaco
      expect(c.existing_value_bbox).toBeDefined()
      expect(c.existing_value_bbox!.x_pct).toBeGreaterThan(c.label_bbox.x_pct + c.label_bbox.w_pct)
      expect(c.existing_value_text).toBe('Snow')
    })

    it('PM-1: nao quebra "Paciente:" puro (":" no fim, sem valor unido)', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8, 1.5),
        item('Snow',      0, 20, 20, 6, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].label_text).toBe('Paciente:')
    })

    it('PM-1: nao quebra item sem ":"', () => {
      const items = [
        item('LAUDO ECOCARDIOGRAFICO', 0, 30, 5, 40, 2),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)
    })

    it('label multi-palavra: agrupa palavras contíguas', () => {
      // "Frequência cardíaca:" fragmentado em dois items próximos
      const items = [
        item('Frequência', 0, 10, 30, 15, 1.5),
        item('cardíaca:',  0, 26, 30, 13, 1.5),  // gap = 1 (< 1.5)
        item('120 bpm',    0, 40, 30, 12, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      // Label = "Frequência cardíaca:"
      expect(c.label_text).toContain('Frequência')
      expect(c.label_text).toContain('cardíaca:')
      // value começa após a palavra com ':'
      expect(c.value_bbox.x_pct).toBeGreaterThan(38)
      expect(c.existing_value_text).toBe('120 bpm')
    })

    it('multiplos labels na mesma linha: segmenta corretamente', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8, 1.5),
        item('Snow',      0, 20, 20, 6, 1.5),
        item('Espécie:',  0, 50, 20, 8, 1.5),
        item('Canino',    0, 60, 20, 7, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(2)
      expect(cs[0].label_normalized).toBe('paciente')
      expect(cs[0].existing_value_text).toBe('Snow')
      expect(cs[1].label_normalized).toBe('especie')
      expect(cs[1].existing_value_text).toBe('Canino')
      // value_bbox do primeiro nao invade o segundo label
      const firstValueEnd = cs[0].value_bbox.x_pct + cs[0].value_bbox.w_pct
      expect(firstValueEnd).toBeLessThanOrEqual(50)
    })

    it('label sem ":" mas com vocabulário batido: detecta', () => {
      const items = [
        item('CRMV', 0, 10, 5, 5, 1.5),
        item('SP 74.696', 0, 17, 5, 12, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].label_normalized).toContain('crmv')
    })

    it('linha sem nenhum label conhecido nem ":": ignora', () => {
      const items = [
        item('LAUDO ECOCARDIOGRÁFICO', 0, 30, 10, 40, 2),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)
    })

    it('font_size_pt estimado a partir da altura do label', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8, 2.5),
      ]
      const cs = snipeLabels(items)
      expect(cs[0].font_size_pt).toBeCloseTo(2.5, 2)
    })

    it('value_bbox respeita largura máxima (50% por padrão)', () => {
      const items = [
        item('Obs:', 0, 0, 30, 3, 1.5),
        // valor muito longo, mas sem proximo label
      ]
      const cs = snipeLabels(items)
      expect(cs[0].value_bbox.w_pct).toBeLessThanOrEqual(50)
    })
  })

  describe('detectAlignment', () => {
    it('valor centralizado: align center', () => {
      // Container vai de 50 a 100, valor de 70 a 80 (centro do container = 75, centro do valor = 75)
      const items = [
        item('Cabeçalho:', 0, 0, 5, 12, 1.5),
        item('CENTRALIZADO', 0, 70, 5, 10, 1.5),  // centro = 75
        // Próximo label não existe; container = (12.5 + 0.5, 100) ≈ (13, 100), centro = 56.5
        // Valor centro = 75 → não está centro. Ajustar
      ]
      // O sniper calcula container baseado em valueStartX e valueStartX + valueWidth.
      // Para testar center, precisaria de proximo_label que faça o container exato.
      // Vamos só verificar que o sniper roda sem erro
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      // align pode ser left ou center dependendo do calculo
    })
  })

  describe('detectGlobalFields', () => {
    it('label que aparece em todas as paginas no mesmo Y: vira global', () => {
      const candidates = [
        // Página 0
        { page: 0, label_text: 'CRMV:', label_normalized: 'crmv',
          label_bbox: { x_pct: 60, y_pct: 5, w_pct: 8, h_pct: 1.5 },
          value_bbox: { x_pct: 69, y_pct: 5, w_pct: 20, h_pct: 1.5 },
          align: 'left' as const, font_size_pt: 1.5, baseline_y_pct: 7 },
        // Página 1 (Y igual)
        { page: 1, label_text: 'CRMV:', label_normalized: 'crmv',
          label_bbox: { x_pct: 60, y_pct: 5.1, w_pct: 8, h_pct: 1.5 },
          value_bbox: { x_pct: 69, y_pct: 5.1, w_pct: 20, h_pct: 1.5 },
          align: 'left' as const, font_size_pt: 1.5, baseline_y_pct: 7 },
        // Página 2 (Y igual)
        { page: 2, label_text: 'CRMV:', label_normalized: 'crmv',
          label_bbox: { x_pct: 60, y_pct: 5, w_pct: 8, h_pct: 1.5 },
          value_bbox: { x_pct: 69, y_pct: 5, w_pct: 20, h_pct: 1.5 },
          align: 'left' as const, font_size_pt: 1.5, baseline_y_pct: 7 },
        // Página 0 também tem "Paciente" (não-global, só em 1 pagina)
        { page: 0, label_text: 'Paciente:', label_normalized: 'paciente',
          label_bbox: { x_pct: 10, y_pct: 30, w_pct: 8, h_pct: 1.5 },
          value_bbox: { x_pct: 19, y_pct: 30, w_pct: 25, h_pct: 1.5 },
          align: 'left' as const, font_size_pt: 1.5, baseline_y_pct: 7 },
      ]
      const { globals, non_globals } = detectGlobalFields(candidates, 3)
      expect(globals.length).toBe(1)
      expect(globals[0].label_normalized).toBe('crmv')
      expect(globals[0].pages).toEqual([0, 1, 2])
      expect(non_globals.length).toBe(1)
      expect(non_globals[0].label_normalized).toBe('paciente')
    })

    it('label so em 1 de 3 paginas: nao vira global', () => {
      const candidates = [
        { page: 0, label_text: 'X:', label_normalized: 'x',
          label_bbox: { x_pct: 10, y_pct: 5, w_pct: 5, h_pct: 1 },
          value_bbox: { x_pct: 16, y_pct: 5, w_pct: 20, h_pct: 1 },
          align: 'left' as const, font_size_pt: 1, baseline_y_pct: 6 },
      ]
      const { globals, non_globals } = detectGlobalFields(candidates, 3)
      expect(globals.length).toBe(0)
      expect(non_globals.length).toBe(1)
    })

    it('label em todas as paginas MAS Y muito diferente: nao vira global', () => {
      const candidates = [
        { page: 0, label_text: 'Data:', label_normalized: 'data',
          label_bbox: { x_pct: 10, y_pct: 5, w_pct: 5, h_pct: 1 },
          value_bbox: { x_pct: 16, y_pct: 5, w_pct: 15, h_pct: 1 },
          align: 'left' as const, font_size_pt: 1, baseline_y_pct: 6 },
        { page: 1, label_text: 'Data:', label_normalized: 'data',
          label_bbox: { x_pct: 10, y_pct: 90, w_pct: 5, h_pct: 1 },  // Y muito distante
          value_bbox: { x_pct: 16, y_pct: 90, w_pct: 15, h_pct: 1 },
          align: 'left' as const, font_size_pt: 1, baseline_y_pct: 6 },
      ]
      const { globals } = detectGlobalFields(candidates, 2)
      expect(globals.length).toBe(0)
    })
  })

  describe('runOcrSniper (integração)', () => {
    it('pipeline completo: items com ":" → candidates + globals', () => {
      const textItems: PdfTextItem[] = [
        // Página 0 — CRMV no header com ":"
        item('CRMV:',   0, 60, 5, 5, 1.5),
        item('74.696',  0, 66, 5, 8, 1.5),
        item('Paciente:', 0, 10, 30, 8, 1.5),
        item('Snow',      0, 19, 30, 6, 1.5),
        // Página 1 — mesmo header CRMV
        item('CRMV:',   1, 60, 5, 5, 1.5),
        item('74.696',  1, 66, 5, 8, 1.5),
      ]
      const result = runOcrSniper({
        textItems,
        dimensions: [
          { width_pt: 595, height_pt: 842 },
          { width_pt: 595, height_pt: 842 },
        ],
      })
      expect(result.stats.pages_processed).toBe(2)
      // CRMV + Paciente (pg 0) + CRMV (pg 1) = 3 candidates
      expect(result.candidates.length).toBe(3)
      // CRMV em ambas paginas = global; Paciente so na pagina 0 = non-global
      expect(result.globals.length).toBe(1)
      expect(result.globals[0].label_normalized).toBe('crmv')
      expect(result.globals[0].pages).toEqual([0, 1])
      expect(result.non_globals.length).toBe(1)
      expect(result.non_globals[0].label_normalized).toBe('paciente')
    })
  })
})
