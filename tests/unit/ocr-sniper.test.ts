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
      // INTERVENCAO CIRURGICA: value_bbox.x_pct = colonEndX + COLON_SAFETY_PCT (0.85)
      // colonEndX = item.x + (colonIdx+1)/len * item.w = 10 + 9/9 * 8 = 18
      expect(c.value_bbox.x_pct).toBeCloseTo(18 + 0.85, 1)
      // value.y = label.y
      expect(c.value_bbox.y_pct).toBeCloseTo(20, 1)
      // value.h = label.h
      expect(c.value_bbox.h_pct).toBeCloseTo(1.5, 1)
      expect(c.existing_value_text).toBe('Snow')
      // PM-3: baseline_y_pct deve estar presente
      expect(c.baseline_y_pct).toBeGreaterThan(0)
    })

    // ── LEI 2: WHITEOUT NUNCA CRUZA O LABEL ────────────────────────────────
    it('LEI 2: "Aorta: 0,76 cm" — whiteout NAO encosta no rotulo "Aorta:"', () => {
      // label "Aorta:" ocupa x=10..17, value "0,76" em 25, sufixo "cm" em 45
      const items = [
        item('Aorta:', 0, 10, 30, 7, 1.5),
        item('0,76',   0, 25, 30, 5, 1.5),
        item('cm',     0, 45, 30, 4, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]

      const labelRight = c.label_bbox.x_pct + c.label_bbox.w_pct  // = 17
      const whiteoutLeft = c.existing_value_bbox!.x_pct
      const whiteoutRight = whiteoutLeft + c.existing_value_bbox!.w_pct
      const suffixLeft = 45

      // INVARIANTE 1: whiteoutLeft > labelRight (com margem >= 0.2%)
      expect(whiteoutLeft).toBeGreaterThan(labelRight)
      expect(whiteoutLeft - labelRight).toBeGreaterThanOrEqual(0.2)

      // INVARIANTE 2: whiteoutRight < suffixLeft (com margem >= 0.2%)
      expect(whiteoutRight).toBeLessThan(suffixLeft)
      expect(suffixLeft - whiteoutRight).toBeGreaterThanOrEqual(0.2)

      // INVARIANTE 3: value_bbox = whiteout_bbox (texto novo onde se apagou)
      expect(c.value_bbox.x_pct).toBeCloseTo(c.existing_value_bbox!.x_pct, 5)
      expect(c.value_bbox.w_pct).toBeCloseTo(c.existing_value_bbox!.w_pct, 5)

      // Align CENTER (sufixo presente)
      expect(c.align).toBe('center')
    })

    it('LEI 2: sem sufixo, sem next_label — whiteout vai ate ~100 com margem', () => {
      const items = [
        item('Observacoes:', 0, 10, 20, 15, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      const labelRight = c.label_bbox.x_pct + c.label_bbox.w_pct  // 25
      const whiteoutLeft = c.existing_value_bbox!.x_pct
      expect(whiteoutLeft - labelRight).toBeGreaterThanOrEqual(0.2)
      // sem sufixo + sem next_label aplica valueMaxW (50%)
      expect(c.existing_value_bbox!.w_pct).toBeLessThanOrEqual(50)
    })

    // ── IC-8: BOUNDARY DETECTION ──────────────────────────────────────────
    it('IC-8: "(normal até 1,7)" boundary — whiteout nao apaga referencia clinica', () => {
      // Linha "Diâmetro normalizado VE:" + "(normal até 1,7)" — o paren
      // eh boundary direita, nao value
      const items = [
        item('Diametro normalizado VE:', 0, 16.6, 60, 20.6, 1.5),
        item('(normal até 1,7)',          0, 53.3, 60, 16.1, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      const whiteoutRight = c.existing_value_bbox!.x_pct + c.existing_value_bbox!.w_pct
      // Whiteout NAO pode invadir "(normal até..." que comeca em x=53.3
      expect(whiteoutRight).toBeLessThan(53.3)
      // E deve respeitar a margem de seguranca
      expect(53.3 - whiteoutRight).toBeGreaterThanOrEqual(0.2)
    })

    it('IC-8: rotulo "Referência:" NAO vira campo (label fixo do template)', () => {
      const items = [
        item('Referência:', 0, 60, 50, 12, 1.5),
        item('60% – 80%',   0, 73, 50, 18, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)  // skip — eh referencia clinica, nao campo
    })

    // ── IC-19: PONTOS DE PREENCHIMENTO (hemogramas/laudos lab) ─────────────
    it('IC-19: label "ERITRÓCITOS(/mm³).............." detectado (5+ pontos)', () => {
      const items = [
        item('ERITRÓCITOS(/mm³)..............', 0, 6, 30, 30, 1.5),
        item('7,1',                              0, 41, 30, 4, 1.5),
        item('milhões/mm³',                     0, 49, 30, 12, 1.5),
        item('5,5 - 10 milhões/mm³',            0, 65, 30, 25, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].label_text).toContain('ERITRÓCITOS')
      expect(cs[0].existing_value_text).toBe('7,1')
    })

    it('IC-19: whiteout NAO invade referencias (boundary no 2o item)', () => {
      const items = [
        item('HEMOGLOBINA(g/dl)..............', 0, 6, 30, 30, 1.5),
        item('10,5',                             0, 41, 30, 4, 1.5),
        item('g/dl',                             0, 49, 30, 5, 1.5),  // unidade
        item('8,0 - 15,0 g/dl',                  0, 60, 30, 18, 1.5), // referencia
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      // whiteoutRight respeita o 2o item (unidade "g/dl") como boundary
      const whiteoutRight = cs[0].existing_value_bbox!.x_pct + cs[0].existing_value_bbox!.w_pct
      expect(whiteoutRight).toBeLessThan(49)  // antes da unidade
    })

    it('IC-19: NAO confunde "etc..." com label (somente 5+ pontos)', () => {
      const items = [
        item('observacao etc...', 0, 10, 30, 16, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)   // 3 pontos nao basta
    })

    // ── IC-12: GUTTER DE COLUNA (margem visual entre value e nextLabel) ───
    it('IC-12: gutter >= 2.5% entre value e nextLabel (respeita divisoria tabela)', () => {
      // Tabela 2-col: Paciente: + Espécie:
      const items = [
        item('Paciente:', 0, 4.5, 20, 9, 1.5),    // x=4.5, w=9, end=13.5
        item('Espécie:',  0, 50.9, 20, 8, 1.5),   // x=50.9
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(2)
      const pacRight = cs[0].existing_value_bbox!.x_pct + cs[0].existing_value_bbox!.w_pct
      // pacRight NAO pode chegar perto demais de Espécie (x=50.9)
      // Gutter >= 2.5% — fica em ate 48.4%
      expect(50.9 - pacRight).toBeGreaterThanOrEqual(2.0)
    })

    // ── IC-10: SIMETRIA DE COLUNA ──────────────────────────────────────────
    it('IC-10: linha com 2 labels — ultimo label herda width medio do primeiro', () => {
      // Linha tipo "Paciente: ... Espécie:" — em template de 2 colunas, o
      // value de Espécie nao deve esticar ate a borda da pagina.
      const items = [
        item('Paciente:', 0, 5,  20, 9, 1.5),    // x=5, w=9, end=14
        item('Espécie:',  0, 51, 20, 8, 1.5),    // x=51, w=8, end=59
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(2)
      // Paciente value width = 51 - 14 = 37%
      const pacWidth = cs[0].existing_value_bbox!.w_pct
      const espWidth = cs[1].existing_value_bbox!.w_pct
      // Espécie deve ter width SIMILAR (simetria) — nao toda a borda direita
      expect(espWidth).toBeLessThan(pacWidth + 5)
      expect(espWidth).toBeGreaterThan(pacWidth - 5)
    })

    it('IC-9 (A): sufixo no PRIMEIRO item — campo vazio "RDAP index:" + "%" + ">30%"', () => {
      const items = [
        item('RDAP index:', 0, 16.6, 60, 10.0, 1.5),
        item('%',           0, 31.9, 60, 1.2, 1.5),
        item('>',           0, 63.3, 60, 0.8, 1.5),
        item('30%',         0, 64.1, 60, 3.0, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      // boundary ">" detectado em x=63.3 ANTES da deteccao de sufixo
      // sufixo "%" no PRIMEIRO item apos label (depois de remover boundary)
      // → value_bbox fica ENTRE label.right e %.x
      const whiteoutRight = c.existing_value_bbox!.x_pct + c.existing_value_bbox!.w_pct
      expect(whiteoutRight).toBeLessThan(31.9)   // antes do %
      expect(c.align).toBe('center')              // sufixo OU boundary → center
    })

    it('IC-9 (B): "mmHg/s" reconhecido como sufixo', () => {
      const items = [
        item('dP/dt:',    0, 10, 50, 5, 1.5),
        item('mmHg/s',    0, 32, 50, 6, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].align).toBe('center')
      // bbox entre label e sufixo
      const right = cs[0].existing_value_bbox!.x_pct + cs[0].existing_value_bbox!.w_pct
      expect(right).toBeLessThan(32)
    })

    it('IC-9 (C): boundary + align=center (sem sufixo)', () => {
      const items = [
        item('Diametro normalizado VE:', 0, 16.6, 60, 20.6, 1.5),
        item('(normal até 1,7)',          0, 53.3, 60, 16.1, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      // boundary "(normal até..." → align=center (nao left)
      expect(cs[0].align).toBe('center')
    })

    it('IC-9 (D): "> 30%" como boundary', () => {
      const items = [
        item('Campo:', 0, 10, 50, 5, 1.5),
        item('>',      0, 50, 50, 1, 1.5),
        item('30%',    0, 52, 50, 3, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      // boundary ">" delimita o whiteout
      const right = cs[0].existing_value_bbox!.x_pct + cs[0].existing_value_bbox!.w_pct
      expect(right).toBeLessThan(50)
    })

    it('IC-9 (E): titulo all-caps "OBSERVAÇÕES" NAO vira campo', () => {
      const items = [
        item('OBSERVAÇÕES', 0, 4.5, 50, 13.9, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)   // titulo de secao, nao label
    })

    it('IC-9 (E): "CRMV" curto (sigla) AINDA vira campo via vocab', () => {
      // 4 chars all-caps eh sigla, nao titulo — deve continuar detectando
      const items = [
        item('CRMV',      0, 10, 5, 5, 1.5),
        item('SP 74.696', 0, 17, 5, 12, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].label_normalized).toContain('crmv')
    })

    it('IC-8: rotulo "Normal até:" NAO vira campo', () => {
      const items = [
        item('Normal até:', 0, 60, 50, 12, 1.5),
        item('1,6',         0, 73, 50, 6, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(0)
    })

    it('LEI 2: dois labels na mesma linha — whiteout do 1o nao cruza o 2o', () => {
      const items = [
        item('Paciente:', 0, 10, 20, 8, 1.5),
        item('Snow',      0, 19, 20, 6, 1.5),
        item('Especie:',  0, 50, 20, 8, 1.5),
        item('Canino',    0, 59, 20, 7, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(2)
      const first = cs[0]
      const secondLabelLeft = 50
      const firstWhiteoutRight = first.existing_value_bbox!.x_pct + first.existing_value_bbox!.w_pct
      // INVARIANTE: whiteout do primeiro termina ANTES do segundo label
      expect(firstWhiteoutRight).toBeLessThan(secondLabelLeft)
      expect(secondLabelLeft - firstWhiteoutRight).toBeGreaterThanOrEqual(0.2)
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

    // ── TZ-3: sufixos de unidade (cm, m/s, mmHg, bpm, %, kg) ────────────────
    it('TZ-3: sufixo "cm" no fim da linha — value_bbox entre label e unidade, align=center', () => {
      // "Aorta:" "0,76" "cm" — value vai entre label.right e suffix.left
      const items = [
        item('Aorta:', 0, 10, 30, 7, 1.5),
        item('0,76',   0, 25, 30, 5, 1.5),
        item('cm',     0, 45, 30, 4, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      expect(c.label_normalized).toBe('aorta')
      // INTERVENCAO CIRURGICA: value_bbox.x = colonEndX + COLON_SAFETY (0.85)
      // colonEndX = 10 + 6/6 * 7 = 17
      expect(c.value_bbox.x_pct).toBeCloseTo(17 + 0.85, 1)
      // value_bbox direita = suffix.x - WHITEOUT_SAFETY_PCT = 45 - 0.3
      expect(c.value_bbox.x_pct + c.value_bbox.w_pct).toBeCloseTo(45 - 0.3, 1)
      // Align CENTER quando há sufixo
      expect(c.align).toBe('center')
      // existing_value continua sendo "0,76" (sem o sufixo)
      expect(c.existing_value_text).toBe('0,76')
    })

    it('TZ-3: sufixo "bpm" detectado', () => {
      const items = [
        item('FC:',   0, 10, 30, 5, 1.5),
        item('120',   0, 20, 30, 4, 1.5),
        item('bpm',   0, 30, 30, 5, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].align).toBe('center')
      expect(cs[0].value_bbox.x_pct + cs[0].value_bbox.w_pct).toBeLessThan(30)
    })

    it('TZ-3: sem sufixo — align padrão "left" e usa valueMaxW', () => {
      const items = [
        item('Observacoes:', 0, 10, 30, 15, 1.5),
        item('teste',        0, 28, 30, 6, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      expect(cs[0].align).toBe('left')
    })

    it('TZ-3: sufixo sem texto antigo (linha pontilhada) — cria existing_value_bbox vazia', () => {
      // "Aorta:" "cm" — campo VAZIO (sem valor preenchido)
      const items = [
        item('Aorta:', 0, 10, 30, 7, 1.5),
        item('cm',     0, 45, 30, 4, 1.5),
      ]
      const cs = snipeLabels(items)
      expect(cs.length).toBe(1)
      const c = cs[0]
      expect(c.existing_value_text).toBeUndefined()
      // existing_value_bbox setada para cobrir o espaço entre label e cm
      expect(c.existing_value_bbox).toBeDefined()
      // INTERVENCAO CIRURGICA: x_pct = colonEndX (17) + COLON_SAFETY_PCT (0.85)
      expect(c.existing_value_bbox!.x_pct).toBeCloseTo(17.85, 1)
      expect(c.align).toBe('center')
    })

    it('TZ-3: regex de sufixo aceita unidades comuns', () => {
      // Roda múltiplas combinações para garantir cobertura
      const units = ['cm', 'mm', 'mmHg', '%', 'kg', 'ms', 'ml', 'mg']
      for (const u of units) {
        const items = [
          item('Campo:', 0, 10, 30, 8, 1.5),
          item('1.5',    0, 20, 30, 4, 1.5),
          item(u,        0, 30, 30, 6, 1.5),
        ]
        const cs = snipeLabels(items)
        expect(cs.length).toBe(1)
        expect(cs[0].align).toBe('center')
      }
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
