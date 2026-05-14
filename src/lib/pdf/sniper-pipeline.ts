'use client'

/**
 * Pipeline Pixel Perfect — Operacao OCR Sniper & Masking.
 *
 * Une OCR Sniper (matematica vetorial via pdfjs) + Semantic Matcher
 * (Claude apenas para de-para de nomes) para produzir ExtractedFields +
 * LayoutOverlays prontos com coordenadas DETERMINISTICAS.
 *
 * Substitui o antigo /api/process-template-with-file (que pedia coords
 * a Claude Vision com precisao limitada).
 */

import {
  runOcrSniper, type LabelCandidate, type GlobalFieldGroup, type SniperResult,
  groupByLine, bboxFromItems,
} from './ocr-sniper'
import type { PdfTextItem, PdfPagesResult } from '../pdf-to-images'
import type { ExtractedField, LayoutOverlay, TemplateType, FieldType } from '@/types'

// ── Tipos publicos ─────────────────────────────────────────────────────

/** Match semantico vindo do Claude (route /api/match-template-fields). */
export interface FieldMatch {
  label_original: string
  field_name: string
  type: ExtractedField['type']
  description: string
  required: boolean
  is_system_field?: boolean
  is_custom?: boolean   // PM-2: parametro clinico especifico sem mapeamento canonico
}

export interface PipelineInput {
  textItems: PdfTextItem[]
  dimensions: PdfPagesResult['dimensions']
  doc_type: TemplateType
  doc_name?: string
  /** Para testes / injeção: se omitido, faz fetch para /api/match-template-fields */
  fetchMatcher?: (labels: string[], doc_type: TemplateType, doc_name?: string) => Promise<FieldMatch[]>
}

export interface PipelineResult {
  extracted_fields: ExtractedField[]
  layout_overlays: LayoutOverlay[]
  stats: {
    candidates: number
    matched_fields: number
    globals: number
    total_overlays: number
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

let overlayIdCounter = 0
const overlayId = () => `el_${Date.now()}_${++overlayIdCounter}`

async function defaultMatcher(
  labels: string[],
  doc_type: TemplateType,
  doc_name?: string,
): Promise<FieldMatch[]> {
  const resp = await fetch('/api/match-template-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels, doc_type, doc_name }),
  })
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}))
    throw new Error(errBody?.error || `Matcher API erro HTTP ${resp.status}`)
  }
  const data = await resp.json()
  return data.matches as FieldMatch[]
}

/**
 * Encontra o candidate cujo label_original casa com o label do match.
 * Match exato OU label_normalized igual.
 */
function findCandidatesForMatch(
  match: FieldMatch,
  candidates: LabelCandidate[],
): LabelCandidate[] {
  const normTarget = match.label_original
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return candidates.filter(c =>
    c.label_text === match.label_original ||
    c.label_normalized === normTarget,
  )
}

/**
 * Encontra grupos globais cujos labels batem com o match.
 */
function findGlobalsForMatch(
  match: FieldMatch,
  globals: GlobalFieldGroup[],
): GlobalFieldGroup | null {
  const normTarget = match.label_original
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return globals.find(g => g.label_normalized === normTarget) ?? null
}

// ── TZ-2: Heurística de Assinaturas (textos flutuantes sem ':') ─────────

interface SignaturePattern {
  re: RegExp
  field_name: string
  label: string
  type: FieldType
  description: string
}

/**
 * Cabeçalhos/rodapés ("Dr. Claudiney", "CRMV-SP 74.696", "Médico Veterinário")
 * são texto flutuante sem ':' — o OCR Sniper baseado em segmentação por label
 * não os detecta. Esta lista regex pré-resolve esses padrões antes do matcher
 * Claude, eliminando dependência da IA para campos de sistema.
 */
const SIGNATURE_PATTERNS: SignaturePattern[] = [
  {
    // FOOTER COMPOUND: "Assinado eletronicamente por X – CRMV/Y" — tem
    // PRIORIDADE sobre os demais. Quando bate, a linha INTEIRA do rodape
    // eh substituida pela string "Assinado por {nome} – {crmv}" interpolada.
    re: /\bassinad[oa]\s+eletronicamente\b/i,
    field_name: 'professional_signature',
    label: 'Assinatura eletronica',
    type: 'text',
    description: 'Linha de assinatura eletronica no rodape',
  },
  {
    // "CRMV-SP 74.696", "CRMV/SP 74.696", "CRMV: 74.696"
    re: /\bCRMV[\s:/\-]*[A-Z]{0,3}[\s:/\-]*[\d.\-/]+/i,
    field_name: 'professional_crmv',
    label: 'CRMV',
    type: 'text',
    description: 'Registro profissional no CRMV',
  },
  {
    // "Dr. Claudiney", "Dra. Maria", "Doutor João" (precisa pelo menos 1
    // caractere apos titulo — evita match com so "Dr.")
    re: /\b(?:Dr\.?|Dra\.?|Doutor[a]?\.?)\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ][a-zA-Záàâãéèêíïóôõöúç]+/,
    field_name: 'professional_name',
    label: 'Veterinário',
    type: 'text',
    description: 'Nome do medico veterinario responsavel',
  },
  {
    // "Médico Veterinário", "Médica Veterinária", com ou sem cargo apos (–, hifen).
    // Quando linha tambem tem especialidade ("Medico Vet – Cardiologo"), o ctx
    // ja vem preenchido com "Med. Vet. – Cardiologo" e a linha inteira eh
    // substituida por essa string.
    re: /m[ée]dic[oa]\s+veterin[áa]ri[oa]/i,
    field_name: 'professional_role',
    label: 'Cargo do profissional',
    type: 'text',
    description: 'Cargo + especialidade do veterinario',
  },
]

export interface SignatureDetectionResult {
  matches: FieldMatch[]
  candidates: LabelCandidate[]
  /** Linhas que casaram com algum padrão — para excluir do matcher Claude */
  matched_lines: Set<string>
}

/**
 * INTERVENCAO CIRURGICA — Reset de Assinatura.
 *
 * Varre o textContent buscando padroes de assinatura profissional.
 * Para cada match, gera:
 *   - 1 FieldMatch (pre-resolvido)
 *   - 1 LabelCandidate POR PAGINA (uma instancia por pagina onde a regex bate)
 *
 * Regra do usuario (Frankstein-killer):
 *   O whiteout cobre a LINHA INTEIRA onde o nome antigo aparece — nao apenas
 *   o span do match do regex. Isso garante que "Responsavel Tecnico — Dr.
 *   Velho" inteiro vire branco antes do drawText do "Dr. Novo" centralizado
 *   na faixa.
 *
 * align = 'center' — o nome do usuario logado eh centralizado na faixa
 * apagada.
 */
export function detectProfessionalSignatures(
  textItems: PdfTextItem[],
): SignatureDetectionResult {
  const lines = groupByLine(textItems)
  const candidates: LabelCandidate[] = []
  const matchesByField = new Map<string, FieldMatch>()
  const matchedLines = new Set<string>()

  for (const line of lines) {
    const lineText = line.items.map(i => i.str).join(' ').trim()
    if (!lineText) continue
    // Linhas com ':' sao labels → deixa o sniper tratar.
    // O regex de assinatura eh para TEXTO FLUTUANTE sem rotulo.
    if (lineText.includes(':')) continue

    for (const pattern of SIGNATURE_PATTERNS) {
      if (!pattern.re.test(lineText)) continue

      // INTERVENCAO CIRURGICA: bbox = linha INTEIRA (apaga "Frankstein")
      const lineBbox = bboxFromItems(line.items)
      const baseline_y_pct = line.items[0].baseline_y_pct

      candidates.push({
        page: line.page,
        label_text: pattern.field_name,
        label_normalized: pattern.field_name,
        // label_bbox sintetico (largura 0) — o motor ja sabe que o whiteout
        // a usar eh o existing_value_bbox.
        label_bbox: { x_pct: lineBbox.x_pct, y_pct: lineBbox.y_pct, w_pct: 0, h_pct: lineBbox.h_pct },
        value_bbox: lineBbox,              // drawText sobre a linha
        align: 'center',                   // nome novo centralizado
        existing_value_text: lineText,
        existing_value_bbox: lineBbox,     // whiteout LINHA INTEIRA
        font_size_pt: lineBbox.h_pct,
        baseline_y_pct,
      })
      matchedLines.add(lineText)

      // Match: 1 por field_name (precedência ao primeiro encontrado)
      if (!matchesByField.has(pattern.field_name)) {
        matchesByField.set(pattern.field_name, {
          label_original: pattern.field_name,  // identificador estável
          field_name: pattern.field_name,
          type: pattern.type,
          description: pattern.description,
          required: false,
          is_system_field: true,
          is_custom: false,
        })
      }
      break  // não testa outros padrões nesta linha
    }
  }

  return {
    matches: Array.from(matchesByField.values()),
    candidates,
    matched_lines: matchedLines,
  }
}

// ── Pipeline principal ─────────────────────────────────────────────────

export async function runSniperPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { textItems, dimensions, doc_type, doc_name, fetchMatcher = defaultMatcher } = input

  // 1) TZ-2: Detecta assinaturas profissionais (Dr./CRMV/Médico Veterinário)
  //    ANTES do Claude — pré-resolvido por regex deterministico.
  const signatures = detectProfessionalSignatures(textItems)

  // 2) Sniper local — labels com ":"
  const sniper: SniperResult = runOcrSniper({ textItems, dimensions })

  // 3) Filtra candidates do sniper que tiveram suas LINHAS casadas com regex
  //    de assinatura — evita duplo mapeamento (ex: "CRMV: 74.696" detectado
  //    como label "CRMV:" no sniper E como CRMV no regex de assinatura).
  const sniperCandidatesFiltered = sniper.candidates.filter(c => {
    // Verifica se algum item dessa linha bateu com algum padrão de assinatura
    return !signatures.matched_lines.has(c.label_text.trim())
  })

  // 4) Junta TODOS os candidates (signatures + sniper filtrado) e re-detecta globais
  const allCandidates = [...signatures.candidates, ...sniperCandidatesFiltered]
  const { globals: allGlobals, non_globals: allNonGlobals } =
    (await import('./ocr-sniper')).detectGlobalFields(allCandidates, dimensions.length)

  // 5) Coleta labels para Claude — apenas os do sniper (NÃO signatures)
  const labelsForMatcher = Array.from(
    new Set(sniperCandidatesFiltered.map(c => c.label_text.trim()).filter(Boolean)),
  )

  // 6) De-para semântico via Claude (apenas se houver labels do sniper)
  const claudeMatches = labelsForMatcher.length > 0
    ? await fetchMatcher(labelsForMatcher, doc_type, doc_name)
    : []

  // 7) Combina matches: signatures FIRST (precedência) + claudeMatches
  //    Sem conflito de field_name (signatures usam professional_*, Claude
  //    pode tentar mapear "CRMV" para professional_crmv mas já foi feito).
  const seenFieldNamesPreClaude = new Set(signatures.matches.map(m => m.field_name))
  const claudeMatchesFiltered = claudeMatches.filter(m => !seenFieldNamesPreClaude.has(m.field_name))
  const matches = [...signatures.matches, ...claudeMatchesFiltered]

  // 8) Combina: para cada match, encontra os candidates (1+ instances)
  const extracted_fields: ExtractedField[] = []
  const layout_overlays: LayoutOverlay[] = []
  const seenFieldNames = new Set<string>()

  for (const match of matches) {
    if (seenFieldNames.has(match.field_name)) continue

    // E global? (cabecalho/rodape repetido)
    const globalGroup = findGlobalsForMatch(match, allGlobals)
    const isGlobal = globalGroup !== null || match.is_system_field === true

    // Coleta candidates (instances) para este match
    let instances: LabelCandidate[] = []
    if (globalGroup) {
      // Reconstroi instances a partir das paginas do grupo global
      for (let i = 0; i < globalGroup.pages.length; i++) {
        instances.push({
          page: globalGroup.pages[i],
          label_text: match.label_original,
          label_normalized: globalGroup.label_normalized,
          label_bbox: globalGroup.label_bboxes[i],
          value_bbox: globalGroup.value_bboxes[i],
          align: globalGroup.align,
          existing_value_bbox: globalGroup.existing_value_bboxes[i],
          font_size_pt: globalGroup.font_size_pt,
          baseline_y_pct: globalGroup.baseline_y_pcts[i],
        })
      }
    } else {
      instances = findCandidatesForMatch(match, allNonGlobals)
    }

    if (instances.length === 0) continue

    // ExtractedField: usa a primeira instance para coords default (na pratica
    // o usuario nao usa essas coords — overlays controlam o pixel-perfect).
    const first = instances[0]
    extracted_fields.push({
      field_name: match.field_name,
      label: match.label_original.replace(/:\s*$/, '').trim() || match.field_name,
      type: match.type,
      description: match.description || match.label_original,
      required: match.required,
      x_percent: first.value_bbox.x_pct,
      y_percent: first.value_bbox.y_pct,
      width_percent: first.value_bbox.w_pct,
      height_percent: first.value_bbox.h_pct,
      page: first.page,
      // PM-2: propaga marca de campo customizado
      is_custom: match.is_custom === true,
    })
    seenFieldNames.add(match.field_name)

    // LayoutOverlays: um por instance (1 ou N — globais geram N)
    for (const inst of instances) {
      layout_overlays.push({
        id: overlayId(),
        type: 'field',
        field_name: match.field_name,
        label: match.label_original,
        page: inst.page,
        x_pct: inst.value_bbox.x_pct,
        y_pct: inst.value_bbox.y_pct,
        w_pct: inst.value_bbox.w_pct,
        h_pct: inst.value_bbox.h_pct,
        // Tamanho de fonte real em pt: altura do label em pt = font_size_pt
        // Conversao: h_pct e em % da altura da pagina. h_pct * height_pt / 100 = h em pt.
        font_size: Math.max(8, Math.min(24, inst.font_size_pt * (dimensions[inst.page]?.height_pt ?? 842) / 100)),
        font_weight: 'normal',
        font_family: 'Helvetica',
        text_align: inst.align,
        // WHITEOUT cirurgico: usa bbox do TEXTO ANTIGO se presente, senao bbox do valor
        whiteout: true,
        whiteout_bbox: inst.existing_value_bbox,
        is_global: isGlobal,
        // PM-3: baseline Y exata do texto original (para drawText pegar exatamente
        // a mesma linha base que o texto antigo, sem drift entre fontes)
        baseline_y_pct: inst.baseline_y_pct,
      })
    }
  }

  return {
    extracted_fields,
    layout_overlays,
    stats: {
      candidates: sniper.candidates.length,
      matched_fields: extracted_fields.length,
      globals: allGlobals.length,
      total_overlays: layout_overlays.length,
    },
  }
}
