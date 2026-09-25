// Montagem PURA do laudo de hemograma a partir dos analitos/gráficos do HL7.
// Sem I/O — testável. NÃO interpreta e NÃO diagnostica: apenas organiza os
// valores, unidades e faixas de referência que o PRÓPRIO APARELHO enviou nas
// seções do laudo (Eritrograma / Leucograma / Plaquetas), no formato visual
// usado pela Clínica Animais. A conclusão clínica é do Médico Veterinário.

import type { HL7Analyte, HL7Graph } from './hl7-parser'
import { graphDataUri } from './hl7-parser'

export type HemogramSection = 'erythrogram' | 'leukogram' | 'platelets' | 'other'

export interface HemogramRow {
  /** Código base do aparelho (NEU, RBC, ...) — sem o sufixo % / #. */
  code:      string
  label:     string
  /** Valor relativo (%) quando o analito tem par %/#; senão é o valor único. */
  value:     string | null
  unit:      string | null
  flag:      string | null
  /** Valor absoluto (contagem) quando existe o par `#`. */
  value_abs: string | null
  unit_abs:  string | null
  flag_abs:  string | null
  /** Faixa de referência da contagem absoluta (coluna "Vlr Ref. Absoluto"). */
  ref_abs:   string | null
  /** Faixa de referência relativa/única (coluna "Vlr Ref. Relativo"). */
  ref_rel:   string | null
}

export interface HemogramGraph {
  code:  string
  title: string
  /** `data:` URI pronto para <img>; null quando o payload não é imagem utilizável. */
  src:   string | null
}

export interface HemogramReport {
  erythrogram: HemogramRow[]
  leukogram:   HemogramRow[]
  platelets:   HemogramRow[]
  other:       HemogramRow[]
  graphs:      HemogramGraph[]
  /** Analitos que chegaram do aparelho e não estão no de-para — nada se perde. */
  unmapped:    HemogramRow[]
}

interface Def { label: string; section: HemogramSection; order: number }

/** De-para código do aparelho → rótulo em PT-BR + seção do laudo. */
export const HEMOGRAM_DEFS: Record<string, Def> = {
  // Eritrograma
  RBC:    { label: 'Hemácias (eritrócitos)',            section: 'erythrogram', order: 10 },
  HGB:    { label: 'Hemoglobina',                       section: 'erythrogram', order: 20 },
  HCT:    { label: 'Hematócrito',                       section: 'erythrogram', order: 30 },
  MCV:    { label: 'V.C.M. (volume corpuscular médio)', section: 'erythrogram', order: 40 },
  MCH:    { label: 'H.C.M. (hemoglobina corp. média)',  section: 'erythrogram', order: 50 },
  MCHC:   { label: 'C.H.C.M.',                          section: 'erythrogram', order: 60 },
  RDW_CV: { label: 'RDW-CV',                            section: 'erythrogram', order: 70 },
  RDW_SD: { label: 'RDW-SD',                            section: 'erythrogram', order: 75 },
  NRBC:   { label: 'Eritroblastos (hemácias nucleadas)', section: 'erythrogram', order: 80 },
  // Leucograma
  WBC:    { label: 'Leucócitos totais',                 section: 'leukogram',  order: 10 },
  NEU:    { label: 'Neutrófilos',                       section: 'leukogram',  order: 20 },
  LYM:    { label: 'Linfócitos',                        section: 'leukogram',  order: 30 },
  MON:    { label: 'Monócitos',                         section: 'leukogram',  order: 40 },
  EOS:    { label: 'Eosinófilos',                       section: 'leukogram',  order: 50 },
  BASO:   { label: 'Basófilos',                         section: 'leukogram',  order: 60 },
  ALY:    { label: 'Linfócitos atípicos',               section: 'leukogram',  order: 70 },
  LIC:    { label: 'Células grandes imaturas (LIC)',    section: 'leukogram',  order: 80 },
  // Plaquetas
  PLT:    { label: 'Contagem plaquetária',              section: 'platelets',  order: 10 },
  MPV:    { label: 'V.P.M. (volume plaquetário médio)', section: 'platelets',  order: 20 },
  PDW:    { label: 'PDW',                               section: 'platelets',  order: 30 },
  PCT:    { label: 'Plaquetócrito (PCT)',               section: 'platelets',  order: 40 },
}

/** Títulos das curvas (ED) do URIT BH-5100. */
export const GRAPH_TITLES: Record<string, string> = {
  WBCHISTO:                'Histograma de leucócitos (WBC)',
  RBCHISTO:                'Histograma de hemácias (RBC)',
  PLTHISTO:                'Histograma de plaquetas (PLT)',
  S0HISTO:                 'Histograma S0 (dispersão frontal)',
  S0S10DIFFSCATTERGRAM:    'Scattergrama diferencial S0 × S10',
  S90S90DDIFFSCATTERGRAM:  'Scattergrama diferencial S90 × S90D',
  S0S90SCATTERGRAM:        'Scattergrama S0 × S90',
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '')

/**
 * Separa o código do aparelho em base + tipo.
 * `NEU%` → { base: 'NEU', kind: 'rel' } · `NEU#` → { base: 'NEU', kind: 'abs' }
 * `RDW_CV` → { base: 'RDW_CV', kind: 'single' }
 */
export function splitAnalyteCode(raw: string | null | undefined): { base: string; kind: 'rel' | 'abs' | 'single' } {
  const s = (raw ?? '').trim().toUpperCase()
  if (s.endsWith('%')) return { base: norm(s.slice(0, -1)), kind: 'rel' }
  if (s.endsWith('#')) return { base: norm(s.slice(0, -1)), kind: 'abs' }
  return { base: norm(s), kind: 'single' }
}

/** Título legível da curva; cai no próprio código quando desconhecido. */
export function graphTitle(code: string | null | undefined): string {
  const key = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return GRAPH_TITLES[key] ?? (code || 'Gráfico do aparelho')
}

export function buildHemogramReport(analytes: HL7Analyte[], graphs: HL7Graph[] = []): HemogramReport {
  const byBase = new Map<string, HemogramRow>()
  const order = new Map<string, number>()
  const section = new Map<string, HemogramSection>()

  for (const a of analytes) {
    const { base, kind } = splitAnalyteCode(a.code ?? a.name)
    if (!base) continue
    const def = HEMOGRAM_DEFS[base]

    let row = byBase.get(base)
    if (!row) {
      row = {
        code: base, label: def?.label ?? (a.name || base),
        value: null, unit: null, flag: null,
        value_abs: null, unit_abs: null, flag_abs: null,
        ref_abs: null, ref_rel: null,
      }
      byBase.set(base, row)
      order.set(base, def?.order ?? 900)
      section.set(base, def?.section ?? 'other')
    }

    if (kind === 'abs') {
      row.value_abs = a.value
      row.unit_abs  = a.unit
      row.flag_abs  = a.flag
      row.ref_abs   = a.ref_text
    } else {
      row.value   = a.value
      row.unit    = a.unit
      row.flag    = a.flag
      // % vai na coluna relativa; valor único também (é como a Animais imprime).
      row.ref_rel = a.ref_text
    }
  }

  const pick = (s: HemogramSection) =>
    [...byBase.values()]
      .filter(r => section.get(r.code) === s)
      .sort((a, b) => (order.get(a.code) ?? 900) - (order.get(b.code) ?? 900) || a.label.localeCompare(b.label, 'pt-BR'))

  const known = new Set(Object.keys(HEMOGRAM_DEFS))
  return {
    erythrogram: pick('erythrogram'),
    leukogram:   pick('leukogram'),
    platelets:   pick('platelets'),
    other:       pick('other'),
    unmapped:    [...byBase.values()].filter(r => !known.has(r.code)),
    graphs: graphs.map(g => ({
      code: g.code ?? '',
      title: graphTitle(g.code),
      src: graphDataUri(g),
    })),
  }
}

/** Marca H/L para a coluna do valor (rótulo curto usado no laudo). */
export function flagLabel(flag: string | null | undefined): string {
  const f = (flag ?? '').toUpperCase()
  if (f === 'H') return 'H'
  if (f === 'L') return 'L'
  if (f === 'A') return 'A'
  return ''
}
