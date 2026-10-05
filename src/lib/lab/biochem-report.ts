// Montagem PURA do laudo de BIOQUÍMICA a partir dos analitos do HL7.
// Sem I/O — testável. NÃO interpreta e NÃO diagnostica: organiza em blocos o
// que o PRÓPRIO APARELHO enviou (valor, unidade, faixa). A conclusão clínica é
// do Médico Veterinário.
//
// O laudo da Clínica Animais imprime bioquímica de um jeito diferente do
// hemograma: cada exame é um BLOCO com título, "Material", "Metodologia",
// linha(s) de resultado e a coluna "Valores de Referência" à direita — e não
// uma tabela única. Este módulo produz esses blocos.

import type { HL7Analyte } from './hl7-parser'

export interface BiochemRow {
  label: string
  value: string
  unit:  string | null
  flag:  string | null
  /** Faixa de referência JÁ resolvida (aparelho > catálogo da clínica > null). */
  ref:   string | null
  /** De onde veio a faixa — o laudo precisa ser honesto sobre isso. */
  ref_source: 'device' | 'clinic' | null
}

export interface BiochemBlock {
  key:      string
  title:    string
  material: string | null
  method:   string | null
  rows:     BiochemRow[]
}

export interface BiochemReport {
  blocks: BiochemBlock[]
}

interface Def {
  /** Chave do bloco: analitos com a mesma chave caem no mesmo bloco (bilirrubinas). */
  block:    string
  title:    string
  /** Rótulo da linha dentro do bloco. "Resultado" quando o bloco tem uma só. */
  row:      string
  material: string | null
  method:   string | null
  /** Faixa impressa pela Animais nos laudos deles. null = não temos; só o aparelho dita. */
  ref:      string | null
  order:    number
}

// Catálogo tirado dos laudos REAIS da Clínica Animais (anexos/Animais_Layouts).
// Onde o documento deles não traz material/metodologia/faixa, fica `null` de
// propósito: faixa de referência veterinária não se inventa — ou vem do
// aparelho (OBX-7), ou vem do catálogo da clínica, ou simplesmente não é
// impressa.
const D = (
  block: string, title: string, row: string,
  material: string | null, method: string | null, ref: string | null, order: number,
): Def => ({ block, title, row, material, method, ref, order })

const SORO_PLASMA = 'SORO OU PLASMA'
const SORO        = 'SORO SANGUÍNEO'
const ENZIMATICO  = 'COLORIMÉTRICO ENZIMÁTICO'

export const BIOCHEM_DEFS: Record<string, Def> = {
  // ── Função hepática ───────────────────────────────────────────────────────
  ALT:      D('ALT', 'ALT (T.G.P.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', '10 a 88 U/L', 10),
  TGP:      D('ALT', 'ALT (T.G.P.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', '10 a 88 U/L', 10),
  'TGP-EB': D('ALT', 'ALT (T.G.P.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', '10 a 88 U/L', 10),
  AST:      D('AST', 'AST (T.G.O.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', null, 20),
  TGO:      D('AST', 'AST (T.G.O.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', null, 20),
  'TGO-EB': D('AST', 'AST (T.G.O.)', 'Resultado', SORO_PLASMA, 'CINÉTICO', null, 20),
  FA:       D('FA',  'FOSFATASE ALCALINA', 'Resultado', SORO, 'CINÉTICO / ENZIMÁTICO', '10,0 a 96,0 U/L', 30),
  ALP:      D('FA',  'FOSFATASE ALCALINA', 'Resultado', SORO, 'CINÉTICO / ENZIMÁTICO', '10,0 a 96,0 U/L', 30),
  // Como o Sérium 200 escreve de verdade (visto nos resultados de 03/10/2026).
  FALIFCC:  D('FA',  'FOSFATASE ALCALINA', 'Resultado', SORO, 'CINÉTICO / ENZIMÁTICO', '10,0 a 96,0 U/L', 30),
  GGT:      D('GGT', 'GAMA-GLUTAMIL TRANSFERASE (GGT)', 'Resultado', SORO_PLASMA, ENZIMATICO, '0 a 6,4 U/L', 40),

  // ── Bilirrubinas (um bloco, três linhas — como no laudo da Animais) ────────
  BILT: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina total',    SORO, null, '0,1 a 0,7 mg/dL',   50),
  TBIL: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina total',    SORO, null, '0,1 a 0,7 mg/dL',   50),
  BILD: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina direta',   SORO, null, '0,06 a 0,30 mg/dL', 51),
  DBIL: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina direta',   SORO, null, '0,06 a 0,30 mg/dL', 51),
  BILI: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina indireta', SORO, null, '0,01 a 0,50 mg/dL', 52),
  IBIL: D('BIL', 'BILIRRUBINAS TOTAL E FRAÇÕES (D + I)', 'Bilirrubina indireta', SORO, null, '0,01 a 0,50 mg/dL', 52),

  // ── Função renal ──────────────────────────────────────────────────────────
  CREA:  D('CREA',  'CREATININA', 'Resultado', SORO_PLASMA, ENZIMATICO, '0,7 a 1,8 mg/dL', 60),
  CREAT: D('CREA',  'CREATININA', 'Resultado', SORO_PLASMA, ENZIMATICO, '0,7 a 1,8 mg/dL', 60),
  CRE:   D('CREA',  'CREATININA', 'Resultado', SORO_PLASMA, ENZIMATICO, '0,7 a 1,8 mg/dL', 60),
  UREIA:      D('UREIA', 'UREIA', 'Resultado', SORO_PLASMA, null, null, 70),
  'UREIA-EB': D('UREIA', 'UREIA', 'Resultado', SORO_PLASMA, null, null, 70),
  UREA:  D('UREIA', 'UREIA', 'Resultado', SORO_PLASMA, null, null, 70),
  BUN:   D('UREIA', 'UREIA', 'Resultado', SORO_PLASMA, null, null, 70),

  // ── Proteínas ─────────────────────────────────────────────────────────────
  ALB:      D('ALB', 'ALBUMINA', 'Resultado', SORO, null, null, 80),
  ALBU:     D('ALB', 'ALBUMINA', 'Resultado', SORO, null, null, 80),
  ALBUMINA: D('ALB', 'ALBUMINA', 'Resultado', SORO, null, null, 80),
  PT:   D('PT',  'PROTEÍNA TOTAL', 'Resultado', SORO, null, '6,0 a 8,0 g/dL', 85),
  TP:   D('PT',  'PROTEÍNA TOTAL', 'Resultado', SORO, null, '6,0 a 8,0 g/dL', 85),

  // ── Lipídios e glicemia ───────────────────────────────────────────────────
  COL:        D('COL',  'COLESTEROL TOTAL', 'Resultado', SORO, ENZIMATICO, '135 a 270 mg/dL', 90),
  CHOL:       D('COL',  'COLESTEROL TOTAL', 'Resultado', SORO, ENZIMATICO, '135 a 270 mg/dL', 90),
  COLESTEROL: D('COL',  'COLESTEROL TOTAL', 'Resultado', SORO, ENZIMATICO, '135 a 270 mg/dL', 90),
  TRIG: D('TRIG', 'TRIGLICERIDES', 'Resultado', SORO, ENZIMATICO, '20 a 112 mg/dL', 95),
  TG:   D('TRIG', 'TRIGLICERIDES', 'Resultado', SORO, ENZIMATICO, '20 a 112 mg/dL', 95),
  TRI:  D('TRIG', 'TRIGLICERIDES', 'Resultado', SORO, ENZIMATICO, '20 a 112 mg/dL', 95),
  GLI:     D('GLI',  'GLICOSE', 'Resultado', 'SORO OU PLASMA FLUORETADO', ENZIMATICO, null, 100),
  GLU:     D('GLI',  'GLICOSE', 'Resultado', 'SORO OU PLASMA FLUORETADO', ENZIMATICO, null, 100),
  GLICOSE: D('GLI',  'GLICOSE', 'Resultado', 'SORO OU PLASMA FLUORETADO', ENZIMATICO, null, 100),

  // ── Urina ─────────────────────────────────────────────────────────────────
  // "PROT. UR" no Sérium. Material é URINA, não soro — por isso bloco próprio.
  PROTUR: D('PROTUR', 'PROTEÍNAS URINÁRIAS', 'Resultado', 'URINA', ENZIMATICO, null, 110),
}

/** Normaliza o código do aparelho: `TGP-EB` e `tgp_eb` caem na mesma chave. */
export function normBiochemCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

/** Procura a definição pelo código e, se não achar, pelo nome do analito. */
export function biochemDef(code: string | null | undefined, name?: string | null): Def | null {
  return BIOCHEM_DEFS[normBiochemCode(code)] ?? BIOCHEM_DEFS[normBiochemCode(name)] ?? null
}

/** Usado para separar os analitos de bioquímica dos de hemograma. */
export const isBiochemAnalyte = (code: string | null | undefined, name?: string | null): boolean =>
  biochemDef(code, name) !== null

/** Faixa que o APARELHO mandou: OBX-7 cru, ou o par low–high. */
function deviceRef(a: HL7Analyte): string | null {
  const t = (a.ref_text ?? '').trim()
  if (t) return t
  if (a.ref_low != null && a.ref_high != null) {
    // Deixa no formato cru `low~high` para a formatação final tratar os dois
    // caminhos (OBX-7 textual e par estruturado) do mesmo jeito.
    return `${a.ref_low}~${a.ref_high}${a.unit ? ' ' + a.unit : ''}`
  }
  return null
}

/**
 * Valor como a Animais imprime: duas casas e vírgula decimal.
 * O Sérium 200 manda 15 casas (`0.736809636395488`) — a própria tela dele
 * mostra `0.74`. O número cru continua intacto em `exam_results.value_text`;
 * aqui só se decide como ele aparece no papel.
 */
export function formatBiochemValue(raw: string): string {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n)) return String(raw ?? '')
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Faixa como a Animais imprime: `0,5 a 1,5` em vez de `0.5~1.5`. */
export function formatBiochemRange(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[-~]\s*(-?\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (!m) return raw
  const num = (v: string) => v.replace('.', ',')
  return `${num(m[1])} a ${num(m[2])}${m[3] ? ' ' + m[3].trim() : ''}`.trim()
}

export function buildBiochemReport(analytes: HL7Analyte[]): BiochemReport {
  const blocks = new Map<string, BiochemBlock & { order: number }>()

  for (const a of analytes) {
    const def = biochemDef(a.code, a.name)
    if (!def) continue

    let b = blocks.get(def.block)
    if (!b) {
      b = { key: def.block, title: def.title, material: def.material, method: def.method, rows: [], order: def.order }
      blocks.set(def.block, b)
    }

    // O aparelho tem a palavra final sobre a faixa; o catálogo da clínica só
    // preenche quando ele não mandou nada.
    const dev = deviceRef(a)
    b.rows.push({
      label: def.row,
      value: formatBiochemValue(a.value),
      unit:  a.unit,
      flag:  a.flag ?? null,
      ref:        formatBiochemRange(dev) ?? def.ref,
      ref_source: dev ? 'device' : (def.ref ? 'clinic' : null),
    })
  }

  return {
    blocks: [...blocks.values()]
      .sort((x, y) => x.order - y.order)
      .map(({ order: _order, ...b }) => b),
  }
}
