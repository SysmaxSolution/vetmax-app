// Aplica a TABELA DE REFERÊNCIA DA CLÍNICA sobre o que o analisador mandou.
// Sem I/O — testável.
//
// Até aqui o laudo era ditado pelo aparelho: ele decidia quais analitos
// apareciam e com que faixa. A Amanda (Clínica Animais) mostrou que na prática
// é o contrário — quem manda é a tabela do laboratório:
//
//   • a faixa impressa é a DELES, não a do analisador;
//   • analito que não está na tabela não entra no laudo;
//   • de MIELÓCITOS a MONÓCITOS o diferencial vem da LÂMINA e é digitado;
//   • a contagem plaquetária pode ser corrigida à mão depois da lâmina;
//   • há linhas que são só texto, algumas com um padrão já preenchido.
//
// Sem tabela cadastrada nada disto acontece: o laudo segue como antes, com as
// faixas do aparelho. É o que mantém as outras clínicas intactas.

import type { HL7Analyte } from './hl7-parser'
import { splitAnalyteCode } from './hemogram-report'

export type ReferenceSection = 'erythrogram' | 'leukogram' | 'platelets' | 'biochem' | 'other'
export type ReferenceSource  = 'device' | 'slide' | 'text'

export interface ReferenceItem {
  id:           string
  sort_order:   number
  label:        string
  analyte_code: string | null
  section:      ReferenceSection
  input_source: ReferenceSource
  unit:         string | null
  ref_text:     string | null
  ref_low:      number | null
  ref_high:     number | null
  ref_abs_text: string | null
  ref_abs_low:  number | null
  ref_abs_high: number | null
  is_visible:   boolean
  is_editable:  boolean
  default_text: string | null
}

export interface ReferenceSet {
  id:        string
  panel_key: string
  species:   string | null
  name:      string
  items:     ReferenceItem[]
}

/** Uma linha do laudo já resolvida: tabela da clínica + valor de onde couber. */
export interface ResolvedRow {
  item_id:   string
  label:     string
  section:   ReferenceSection
  source:    ReferenceSource
  /** Valor relativo/único já pronto para impressão (null = em branco). */
  value:     string | null
  unit:      string | null
  flag:      'H' | 'L' | 'N' | 'A' | null
  /** Contagem absoluta, quando o analito tem par %/#. */
  value_abs: string | null
  unit_abs:  string | null
  flag_abs:  'H' | 'L' | 'N' | 'A' | null
  ref:       string | null
  ref_abs:   string | null
  /** true quando a linha espera digitação (lâmina, texto ou correção manual). */
  editable:  boolean
  /** true quando o laboratório sobrescreveu o que o aparelho mandou. */
  overridden: boolean
}

export interface ResolvedReport {
  set_name: string
  species:  string | null
  rows:     ResolvedRow[]
  /** Analitos que o aparelho mandou e a tabela da clínica não usa. Não saem no
   *  laudo, mas continuam gravados — ficam aqui só para conferência na tela. */
  unused:   { code: string; value: string; unit: string | null }[]
}

const norm = (s: string | null | undefined) =>
  (s ?? '').trim().toUpperCase().replace(/[^A-Z0-9_%#-]/g, '')

/** Escolhe o conjunto: espécie exata primeiro, depois o geral (species null). */
export function pickReferenceSet(
  sets: ReferenceSet[],
  panelKey: string | null,
  species: string | null,
): ReferenceSet | null {
  const painel = (panelKey ?? '').trim().toLowerCase()
  const doPainel = sets.filter(s => s.panel_key.trim().toLowerCase() === painel)
  if (!doPainel.length) return null
  return doPainel.find(s => s.species && s.species === species)
      ?? doPainel.find(s => !s.species)
      ?? null
}

/** H/L a partir da faixa da CLÍNICA (a do aparelho não vale mais nesta linha). */
function flagPorFaixa(valor: string | null, low: number | null, high: number | null): 'H' | 'L' | 'N' | null {
  if (valor === null || valor === '') return null
  const n = Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (low !== null && n < low) return 'L'
  if (high !== null && n > high) return 'H'
  if (low !== null || high !== null) return 'N'
  return null
}

export function applyReferenceSet(
  set: ReferenceSet,
  analytes: HL7Analyte[],
  manual: Record<string, string> = {},
): ResolvedReport {
  // Indexa o que o aparelho mandou pelo código base, separando %/#.
  const rel = new Map<string, HL7Analyte>()
  const abs = new Map<string, HL7Analyte>()
  const unica = new Map<string, HL7Analyte>()
  for (const a of analytes) {
    const { base, kind } = splitAnalyteCode(a.code ?? a.name)
    if (!base) continue
    if (kind === 'abs') abs.set(base, a)
    else if (kind === 'rel') rel.set(base, a)
    else unica.set(base, a)
  }
  const doDispositivo = (code: string | null) => {
    const { base } = splitAnalyteCode(code)
    return { r: rel.get(base) ?? unica.get(base) ?? null, a: abs.get(base) ?? null }
  }

  const usados = new Set<string>()
  const rows: ResolvedRow[] = []

  for (const it of [...set.items].sort((x, y) => x.sort_order - y.sort_order)) {
    if (!it.is_visible) { if (it.analyte_code) usados.add(norm(splitAnalyteCode(it.analyte_code).base)); continue }

    const digitado = manual[it.label] ?? null

    if (it.input_source === 'text') {
      rows.push({
        item_id: it.id, label: it.label, section: it.section, source: 'text',
        value: digitado ?? it.default_text ?? null,
        unit: null, flag: null, value_abs: null, unit_abs: null, flag_abs: null,
        ref: null, ref_abs: null, editable: true, overridden: false,
      })
      continue
    }

    const { r, a } = doDispositivo(it.analyte_code)
    if (it.analyte_code) usados.add(norm(splitAnalyteCode(it.analyte_code).base))

    // Lâmina: o valor do aparelho NÃO entra — o diferencial é o do microscópio.
    const vindoDoAparelho = it.input_source === 'device' ? (r?.value ?? null) : null
    const valor = digitado ?? vindoDoAparelho
    const valorAbs = it.input_source === 'device' ? (a?.value ?? null) : null

    rows.push({
      item_id: it.id, label: it.label, section: it.section, source: it.input_source,
      value: valor,
      unit: it.unit ?? r?.unit ?? null,
      flag: flagPorFaixa(valor, it.ref_low, it.ref_high),
      value_abs: valorAbs,
      unit_abs: a?.unit ?? null,
      flag_abs: flagPorFaixa(valorAbs, it.ref_abs_low, it.ref_abs_high),
      ref: it.ref_text,
      ref_abs: it.ref_abs_text,
      // Lâmina sempre se digita; linha do aparelho só quando a clínica permitir.
      editable: it.input_source === 'slide' || it.is_editable,
      overridden: Boolean(digitado && vindoDoAparelho && digitado !== vindoDoAparelho),
    })
  }

  const unused: ResolvedReport['unused'] = []
  for (const a of analytes) {
    const { base } = splitAnalyteCode(a.code ?? a.name)
    if (!base || usados.has(norm(base))) continue
    unused.push({ code: a.code ?? a.name, value: a.value, unit: a.unit })
  }

  return { set_name: set.name, species: set.species, rows, unused }
}
