'use client'

/**
 * Operacao Zero-Touch — Pipeline Flatten & Clean.
 *
 * Substitui o sniper-pipeline.ts anterior. Difere em TRES pontos cruciais:
 *
 *   1. ZERO IA: nao chama Claude. Mapeamento e 100% deterministico via
 *      canonical-whitelist. Qualquer label fora da whitelist vira custom_*
 *      automaticamente — fim das alucinacoes.
 *
 *   2. WHITEOUT PIXEL: em vez de marcar overlay.whiteout=true (que pintaria
 *      um retangulo branco no PDF original), apaga os pixels DIRETAMENTE no
 *      canvas via canvas-eraser. O resultado e um PNG "limpo" que serve
 *      como fundo imutavel.
 *
 *   3. OUTPUT: alem dos overlays e extracted_fields, retorna `cleaned_pages`
 *      — array de Blob PNG por pagina, prontos para upload.
 *
 * Restricoes:
 *   - Client-side apenas (precisa de HTMLCanvasElement + DOM).
 *   - Requer canvases brutos vindos de `pdfToImages({ keepCanvases: true })`.
 */

import {
  runOcrSniper, type LabelCandidate, type GlobalFieldGroup, type Bbox,
} from './ocr-sniper'
import {
  detectProfessionalSignatures, type SignatureDetectionResult,
} from './sniper-pipeline'
import { eraseRegions, canvasToPngBlob, type EraseRect } from './canvas-eraser'
import {
  matchCanonicalLocal, buildCustomFieldName, guessCustomType,
  SYSTEM_FIELDS,
} from './canonical-whitelist'
import type { PdfTextItem, PdfPagesResult } from '../pdf-to-images'
import type {
  ExtractedField, LayoutOverlay, TemplateType, FieldType,
} from '@/types'

// ── Tipos publicos ─────────────────────────────────────────────────────

export interface FlattenCleanInput {
  textItems: PdfTextItem[]
  dimensions: PdfPagesResult['dimensions']
  canvases: HTMLCanvasElement[]
  doc_type: TemplateType
}

export interface FlattenCleanResult {
  /** PNG limpo por pagina (mesmo indice que `canvases`/`dimensions`). */
  cleaned_pages: Blob[]
  extracted_fields: ExtractedField[]
  layout_overlays: LayoutOverlay[]
  stats: {
    candidates: number
    signatures: number
    globals: number
    canonicos: number
    customs: number
    pixels_apagados: number
    total_overlays: number
  }
}

interface FieldMatch {
  label_original: string
  field_name: string
  type: FieldType
  description: string
  required: boolean
  is_system_field: boolean
  is_custom: boolean
}

// ── Helpers de matching deterministico ─────────────────────────────────

function resolveMatchDeterministic(labelText: string): FieldMatch {
  const local = matchCanonicalLocal(labelText)
  if (local) {
    return {
      label_original: labelText,
      field_name: local.field_name,
      type: local.type,
      description: `Campo ${local.field_name}`,
      required: local.required,
      is_system_field: local.is_system,
      is_custom: false,
    }
  }
  // Anything not in whitelist -> custom_*
  return {
    label_original: labelText,
    field_name: buildCustomFieldName(labelText),
    type: guessCustomType(labelText),
    description: 'Parametro especifico — preencher manualmente',
    required: false,
    is_system_field: false,
    is_custom: true,
  }
}

function findGlobalForLabel(
  labelOriginal: string,
  candidates: LabelCandidate[],
  globals: GlobalFieldGroup[],
): GlobalFieldGroup | null {
  const normTarget = labelOriginal
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return globals.find(g => g.label_normalized === normTarget) ?? null
}

function findCandidatesForLabel(
  labelOriginal: string,
  candidates: LabelCandidate[],
): LabelCandidate[] {
  const normTarget = labelOriginal
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return candidates.filter(c =>
    c.label_text === labelOriginal || c.label_normalized === normTarget,
  )
}

let overlayIdCounter = 0
const overlayId = () => `ov_${Date.now()}_${++overlayIdCounter}`

// ── Pipeline principal ─────────────────────────────────────────────────

export async function runFlattenClean(
  input: FlattenCleanInput,
): Promise<FlattenCleanResult> {
  const { textItems, dimensions, canvases, doc_type } = input
  const pageCount = dimensions.length

  // 1) Detectar candidatos clinicos (labels com ":") e assinaturas (Dr/CRMV)
  const sniper = runOcrSniper({ textItems, dimensions })
  const signatures: SignatureDetectionResult = detectProfessionalSignatures(textItems)

  // 2) Filtra candidatos do sniper que coincidem com linhas de assinatura
  const sniperCandidatesFiltered = sniper.candidates.filter(
    c => !signatures.matched_lines.has(c.label_text.trim()),
  )

  // 3) Recalcula globais sobre signatures + sniper filtrado
  const allCandidates: LabelCandidate[] = [
    ...signatures.candidates,
    ...sniperCandidatesFiltered,
  ]
  const { globals: allGlobals, non_globals: allNonGlobals } =
    (await import('./ocr-sniper')).detectGlobalFields(allCandidates, pageCount)

  // 4) Mapeamento DETERMINISTICO — zero IA, zero alucinacao
  //    Cada label unico vira um match. Assinaturas ja vem pre-resolvidas.
  const uniqueLabels = Array.from(
    new Set(sniperCandidatesFiltered.map(c => c.label_text.trim()).filter(Boolean)),
  )
  const matches: FieldMatch[] = [
    // Signatures: cada uma ja sabe seu field_name canonico (professional_name, etc)
    ...signatures.matches.map(m => ({
      label_original: m.label_original,
      field_name: m.field_name,
      type: m.type as FieldType,
      description: m.description,
      required: false,
      is_system_field: m.is_system_field === true,
      is_custom: false,
    })),
    // Sniper labels: cada label resolve via canonical-whitelist
    ...uniqueLabels.map(resolveMatchDeterministic),
  ]

  // 5) Dedup matches por field_name. Para custom_ colidente, sufixa _2, _3...
  const seenFn = new Set<string>()
  const dedupedMatches: FieldMatch[] = []
  for (const m of matches) {
    if (!seenFn.has(m.field_name)) {
      seenFn.add(m.field_name)
      dedupedMatches.push(m)
      continue
    }
    if (m.field_name.startsWith('custom_')) {
      let i = 2
      let cand = `${m.field_name}_${i}`
      while (seenFn.has(cand)) { i++; cand = `${m.field_name}_${i}` }
      seenFn.add(cand)
      dedupedMatches.push({ ...m, field_name: cand })
    }
    // Senao, descarta duplicata canonica
  }

  // 6) Junta erase regions por pagina (whiteout em pixel ANTES do PNG)
  const erasePerPage: EraseRect[][] = Array.from({ length: pageCount }, () => [])

  // Helper de debug — formata bbox % com 2 casas
  const fmtBox = (b: EraseRect) =>
    `x:${b.x_pct.toFixed(2)}% y:${b.y_pct.toFixed(2)}% w:${b.w_pct.toFixed(2)}% h:${b.h_pct.toFixed(2)}%`

  // 6a) sniper candidates (existing_value_bbox respeita regra do ":")
  for (const c of sniperCandidatesFiltered) {
    if (!c.existing_value_bbox) continue
    console.log(`[Debug] Apagando valor apos rotulo "${c.label_text}" na pagina ${c.page} coordenada ${fmtBox(c.existing_value_bbox)}`)
    erasePerPage[c.page].push(c.existing_value_bbox)
  }

  // 6b) signatures candidates (whiteout = LINHA INTEIRA)
  for (const c of signatures.candidates) {
    if (!c.existing_value_bbox) continue
    console.log(`[Debug] Apagando ASSINATURA "${c.existing_value_text}" na pagina ${c.page} coordenada ${fmtBox(c.existing_value_bbox)}`)
    erasePerPage[c.page].push(c.existing_value_bbox)
  }

  // 7) Aplica erase nos canvases — pixels DESAPARECEM da imagem de fundo.
  let pixelsApagados = 0
  for (let p = 0; p < pageCount; p++) {
    if (!canvases[p]) continue
    const painted = eraseRegions(canvases[p], erasePerPage[p])
    console.log(`[Debug] Pagina ${p}: ${painted}/${erasePerPage[p].length} regioes apagadas no canvas`)
    pixelsApagados += painted
  }

  // 8) Converte cada canvas LIMPO em PNG Blob (paralelo)
  const cleaned_pages: Blob[] = []
  for (const c of canvases) {
    cleaned_pages.push(await canvasToPngBlob(c))
  }

  // 9) Gera extracted_fields + layout_overlays
  //    Overlays NAO levam whiteout (whiteout virou pixel). Apenas drawText.
  const extracted_fields: ExtractedField[] = []
  const layout_overlays: LayoutOverlay[] = []
  const seenFields = new Set<string>()
  let canonicos = 0
  let customs = 0

  for (const match of dedupedMatches) {
    if (seenFields.has(match.field_name)) continue

    // Resolve as instances (1 ou N pagina-paginas para campos globais)
    let instances: LabelCandidate[] = []
    const isSignature = signatures.matches.some(s => s.field_name === match.field_name)
    if (isSignature) {
      // Signatures: pega os candidates ja sintetizados
      instances = signatures.candidates.filter(c => c.label_normalized === match.field_name)
    } else {
      const globalGroup = findGlobalForLabel(match.label_original, allCandidates, allGlobals)
      if (globalGroup) {
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
        instances = findCandidatesForLabel(match.label_original, allNonGlobals)
      }
    }

    if (instances.length === 0) continue

    const first = instances[0]
    extracted_fields.push({
      field_name: match.field_name,
      label: match.label_original.replace(/:\s*$/, '').trim() || match.field_name,
      type: match.type,
      description: match.description,
      required: match.required,
      x_percent: first.value_bbox.x_pct,
      y_percent: first.value_bbox.y_pct,
      width_percent: first.value_bbox.w_pct,
      height_percent: first.value_bbox.h_pct,
      page: first.page,
      is_custom: match.is_custom,
    })
    seenFields.add(match.field_name)
    if (match.is_custom) customs++; else canonicos++

    const isGlobal = instances.length > 1 || match.is_system_field
    const isSig = match.is_system_field === true
    for (const inst of instances) {
      const dim = dimensions[inst.page] ?? dimensions[0]
      const fontSize_pt_raw = inst.font_size_pt * (dim?.height_pt ?? 842) / 100
      // INTERVENCAO CIRURGICA: signatures usam font_size cap em 11pt para
      // evitar wrap. O pdfjs reporta height>=12.96 para a Helvetica
      // original do template, mas Helvetica padrao do pdf-lib eh ~5% mais
      // larga — "CRMV-SP 74.696" em 13pt estoura a w_pct disponivel da
      // linha e quebra em 2 linhas. 11pt cabe com folga.
      const fontSize_pt = isSig
        ? Math.min(11, fontSize_pt_raw)
        : Math.max(8, Math.min(24, fontSize_pt_raw))
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
        font_size: Math.max(8, fontSize_pt),
        font_weight: 'normal',
        font_family: 'Helvetica',
        text_align: inst.align,
        // ZERO-TOUCH: whiteout virou pixel. Overlay nao precisa apagar nada.
        whiteout: false,
        is_global: isGlobal,
        baseline_y_pct: inst.baseline_y_pct,
      })
    }
  }

  return {
    cleaned_pages,
    extracted_fields,
    layout_overlays,
    stats: {
      candidates: sniperCandidatesFiltered.length,
      signatures: signatures.matches.length,
      globals: allGlobals.length,
      canonicos,
      customs,
      pixels_apagados: pixelsApagados,
      total_overlays: layout_overlays.length,
    },
  }
}

// Re-export para conveniencia de consumers (UI)
export { SYSTEM_FIELDS }
