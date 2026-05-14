import { detectProfessionalSignatures } from '../../src/lib/pdf/sniper-pipeline'
import type { PdfTextItem } from '../../src/lib/pdf-to-images'

const item = (
  str: string, page: number, x: number, y: number, w: number, h = 1.5,
): PdfTextItem => ({
  str, page, x_pct: x, y_pct: y, w_pct: w, h_pct: h,
  baseline_y_pct: y + h,
})

describe('detectProfessionalSignatures (TZ-2)', () => {
  it('detecta "Dr. Claudiney Pinto" como professional_name', () => {
    const items = [
      item('Dr.',         0, 30, 5, 5, 1.5),
      item('Claudiney',   0, 36, 5, 12, 1.5),
      item('Pinto',       0, 49, 5, 8, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    expect(r.matches[0].field_name).toBe('professional_name')
    expect(r.matches[0].is_system_field).toBe(true)
    expect(r.matches[0].is_custom).toBe(false)
    expect(r.candidates.length).toBe(1)
    // INTERVENCAO CIRURGICA: align 'center' — nome novo centralizado na faixa
    expect(r.candidates[0].align).toBe('center')
    // INTERVENCAO CIRURGICA: existing_value_bbox = LINHA INTEIRA
    expect(r.candidates[0].existing_value_bbox).toBeDefined()
  })

  // ── INTERVENCAO CIRURGICA: whiteout = LINHA INTEIRA (Frankstein-killer) ─
  it('IC-3: linha "Responsavel Tecnico Dr. Foo Bar" — whiteout cobre LINHA INTEIRA', () => {
    // Items na mesma linha. O regex de Dr. casa em "Dr. Foo".
    // Sob a Intervencao Cirurgica, o whiteout NAO eh mais cirurgico —
    // apaga "Responsavel Tecnico Dr. Foo Bar" inteiro e centraliza o nome
    // novo no espaco da linha.
    const items = [
      item('Responsavel', 0, 5,  10, 12, 1.5),
      item('Tecnico',     0, 18, 10, 8,  1.5),
      item('Dr.',         0, 28, 10, 4,  1.5),
      item('Foo',         0, 33, 10, 5,  1.5),
      item('Bar',         0, 39, 10, 5,  1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    expect(r.candidates.length).toBe(1)
    const c = r.candidates[0]
    // Whiteout COBRE A LINHA INTEIRA — comeca no x do PRIMEIRO item
    expect(c.existing_value_bbox!.x_pct).toBeCloseTo(5, 1)
    // E termina depois do ultimo item: x=39+5=44
    expect(c.existing_value_bbox!.x_pct + c.existing_value_bbox!.w_pct).toBeCloseTo(44, 1)
    // align CENTER — nome novo centralizado
    expect(c.align).toBe('center')
  })

  it('detecta "CRMV-SP 74.696" como professional_crmv', () => {
    const items = [
      item('CRMV-SP', 0, 60, 8, 10, 1.5),
      item('74.696',  0, 71, 8, 8, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    expect(r.matches[0].field_name).toBe('professional_crmv')
    expect(r.matches[0].is_system_field).toBe(true)
  })

  it('detecta "Médico Veterinário" como professional_role', () => {
    const items = [
      item('Médico',       0, 30, 12, 12, 1.5),
      item('Veterinário',  0, 43, 12, 18, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    expect(r.matches[0].field_name).toBe('professional_role')
  })

  it('detecta "Médica Veterinária" (feminino) também', () => {
    const items = [
      item('Médica',       0, 30, 12, 12, 1.5),
      item('Veterinária',  0, 43, 12, 18, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    expect(r.matches[0].field_name).toBe('professional_role')
  })

  it('IGNORA linhas com ":" — sniper trata essas', () => {
    const items = [
      item('Veterinário:', 0, 10, 20, 12, 1.5),
      item('Dr.',          0, 25, 20, 5, 1.5),
      item('Joao',         0, 31, 20, 8, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(0)
    expect(r.candidates.length).toBe(0)
  })

  it('NÃO detecta "Dr." sozinho sem nome', () => {
    const items = [
      item('Dr.', 0, 30, 5, 5, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(0)
  })

  it('múltiplas páginas com mesma assinatura: gera 1 match + N candidates', () => {
    const items = [
      // Página 0
      item('Dr.',       0, 30, 5, 5, 1.5),
      item('Claudiney', 0, 36, 5, 12, 1.5),
      // Página 1 (mesmo texto)
      item('Dr.',       1, 30, 5, 5, 1.5),
      item('Claudiney', 1, 36, 5, 12, 1.5),
      // Página 2
      item('Dr.',       2, 30, 5, 5, 1.5),
      item('Claudiney', 2, 36, 5, 12, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    // 1 match (uma vez por field_name)
    expect(r.matches.length).toBe(1)
    // 3 candidates (uma por página — detectGlobalFields agrupa)
    expect(r.candidates.length).toBe(3)
    expect(r.candidates.map(c => c.page)).toEqual([0, 1, 2])
    // Todos têm label_normalized = "professional_name" para o detectGlobal agrupar
    expect(r.candidates.every(c => c.label_normalized === 'professional_name')).toBe(true)
  })

  it('linha com CRMV E nome do médico: detecta o PRIMEIRO padrão (CRMV)', () => {
    // Cabeçalho real do laudo: "Dr. Claudiney Pinto - CRMV-SP 74.696"
    // O regex de CRMV tem prioridade na ordem da lista
    const items = [
      item('Dr.',       0, 10, 5, 5, 1.5),
      item('Claudiney', 0, 16, 5, 12, 1.5),
      item('CRMV-SP',   0, 50, 5, 10, 1.5),
      item('74.696',    0, 61, 5, 8, 1.5),
    ]
    const r = detectProfessionalSignatures(items)
    expect(r.matches.length).toBe(1)
    // CRMV vem primeiro na lista de patterns → tem precedência
    expect(r.matches[0].field_name).toBe('professional_crmv')
  })
})
