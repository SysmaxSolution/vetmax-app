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
} from './ocr-sniper'
import type { PdfTextItem, PdfPagesResult } from '../pdf-to-images'
import type { ExtractedField, LayoutOverlay, TemplateType } from '@/types'

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

// ── Pipeline principal ─────────────────────────────────────────────────

export async function runSniperPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { textItems, dimensions, doc_type, doc_name, fetchMatcher = defaultMatcher } = input

  // 1) Sniper local — coordenadas deterministicas
  const sniper: SniperResult = runOcrSniper({ textItems, dimensions })

  // 2) Coleta labels unicos para o Claude
  const labelsForMatcher = Array.from(
    new Set(sniper.candidates.map(c => c.label_text.trim()).filter(Boolean)),
  )

  if (labelsForMatcher.length === 0) {
    return {
      extracted_fields: [],
      layout_overlays: [],
      stats: { candidates: 0, matched_fields: 0, globals: sniper.globals.length, total_overlays: 0 },
    }
  }

  // 3) De-para semantico via Claude
  const matches = await fetchMatcher(labelsForMatcher, doc_type, doc_name)

  // 4) Combina: para cada match, encontra os candidates (1+ instances)
  const extracted_fields: ExtractedField[] = []
  const layout_overlays: LayoutOverlay[] = []
  const seenFieldNames = new Set<string>()

  for (const match of matches) {
    if (seenFieldNames.has(match.field_name)) continue

    // E global? (cabecalho/rodape repetido)
    const globalGroup = findGlobalsForMatch(match, sniper.globals)
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
      instances = findCandidatesForMatch(match, sniper.non_globals)
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
      globals: sniper.globals.length,
      total_overlays: layout_overlays.length,
    },
  }
}
