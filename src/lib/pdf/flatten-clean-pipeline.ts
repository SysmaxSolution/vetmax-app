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
  runOcrSniper, detectNumberedMedications, detectDocxPlaceholders,
  type LabelCandidate, type GlobalFieldGroup, type Bbox,
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
  /** Data URLs PNG dos canvases JA LIMPOS — usar como pageImages no editor. */
  cleaned_data_urls: string[]
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

/**
 * IC-18: Regex de SYSTEM FIELDS reconhecidos quando o label tem `:` mas o
 * texto eh ALTAMENTE ESPECIFICO de um campo de sistema (medico veterinario,
 * clinica veterinaria). Aceita abreviacoes comuns: "Méd. Vet.:", "Med. Vet.:",
 * "Clínica Vet.:", "Hospital Vet.:".
 *
 * Sao reconhecidos APENAS termos especificos do dominio veterinario — nao
 * abre brecha para alucinacao de campos clinicos (continua valendo a
 * regra "8 canonicos puros" no canonical-whitelist).
 */
const SYSTEM_FIELD_REGEX: { re: RegExp; field_name: string; description: string }[] = [
  {
    re: /^m[ée]d(?:ic[oa])?[\.\s]+vet(?:erin[áa]ri[oa])?\.?/i,
    field_name: 'professional_role',
    description: 'Cargo do profissional (Médico Veterinário)',
  },
  {
    re: /^cl[íi]nica[\.\s]+vet(?:erin[áa]ria?)?\.?/i,
    field_name: 'clinic_name',
    description: 'Nome da clinica veterinaria',
  },
  {
    re: /^hospital[\.\s]+vet(?:erin[áa]ri[oa])?\.?/i,
    field_name: 'clinic_name',
    description: 'Nome do hospital veterinario',
  },
]

function tryMatchSystemFieldRegex(labelText: string): FieldMatch | null {
  // Normaliza removendo pontuacao final
  const clean = labelText.replace(/[:\.\s]+$/, '').trim()
  for (const r of SYSTEM_FIELD_REGEX) {
    if (r.re.test(clean)) {
      return {
        label_original: labelText,
        field_name: r.field_name,
        type: 'text',
        description: r.description,
        required: false,
        is_system_field: true,
        is_custom: false,
      }
    }
  }
  return null
}

function resolveMatchDeterministic(labelText: string): FieldMatch {
  // 1. Whitelist canonica (paciente, raca, idade, ...)
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
  // 2. IC-18: SYSTEM FIELDS por regex (Médico Vet., Clínica Vet., etc)
  const sys = tryMatchSystemFieldRegex(labelText)
  if (sys) return sys
  // 3. Anything else -> custom_*
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

  // 1b) IC-20: detecta linhas numeradas de medicamentos em receituarios
  const medications = detectNumberedMedications(textItems)

  // 1c) IC-22: detecta placeholders nominais de DOCX (mail merge style)
  //     Ex: "Custom_nome_profissional", "Medicamento1_posologia"
  const docxPlaceholders = detectDocxPlaceholders(textItems)

  // 2) Filtra candidatos do sniper que coincidem com linhas de assinatura
  //    OU com linhas de DOCX placeholders (ja resolvidos)
  const docxPlaceholderLines = new Set(docxPlaceholders.map(c => c.existing_value_text || ''))
  const sniperCandidatesFiltered = sniper.candidates.filter(
    c => !signatures.matched_lines.has(c.label_text.trim())
      && !docxPlaceholderLines.has(c.existing_value_text || ''),
  )

  // 3) Recalcula globais sobre signatures + sniper filtrado + medicamentos + docx
  const allCandidates: LabelCandidate[] = [
    ...signatures.candidates,
    ...sniperCandidatesFiltered,
    ...medications,
    ...docxPlaceholders,
  ]
  const { globals: allGlobals, non_globals: allNonGlobals } =
    (await import('./ocr-sniper')).detectGlobalFields(allCandidates, pageCount)

  // 4) Mapeamento DETERMINISTICO — zero IA, zero alucinacao
  //    Cada label unico vira um match. Assinaturas ja vem pre-resolvidas.
  const uniqueLabels = Array.from(
    new Set(sniperCandidatesFiltered.map(c => c.label_text.trim()).filter(Boolean)),
  )
  // IC-20: medicamentos numerados — cada candidate vira UM match custom_*
  // (deduplicacao por label_normalized garante 1 match por numero, mesmo
  // que aparecam em multiplas paginas — vira global)
  const medicationFieldNames = Array.from(new Set(medications.map(m => m.label_normalized)))
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
    // IC-20: medicamentos numerados
    ...medicationFieldNames.map(fn => ({
      label_original: fn.replace('custom_medicamento_', 'Medicamento '),
      field_name: fn,
      type: 'textarea' as FieldType,
      description: `Medicamento receitado #${fn.replace('custom_medicamento_', '')}`,
      required: false,
      is_system_field: false,
      is_custom: true,
    })),
    // IC-22: DOCX placeholders nominais — cada um mapeado para field_name
    // canonico OU system_field. Customs viram is_custom=true.
    ...docxPlaceholders.map(c => {
      const fn = c.label_normalized
      const isSys = (
        fn === 'professional_name' || fn === 'professional_role' ||
        fn === 'professional_crmv' || fn === 'professional_specialty' ||
        fn === 'professional_signature' || fn === 'clinic_name' ||
        fn === 'clinic_city' || fn === 'clinic_uf' ||
        fn === 'today_dia' || fn === 'today_mes' || fn === 'today_ano' ||
        fn === 'signature_date_location' ||
        fn === 'medicamento_via_uso'
      )
      const isCanonic = (
        fn === 'paciente_nome' || fn === 'tutor_nome' || fn === 'especie' ||
        fn === 'raca' || fn === 'idade' || fn === 'sexo' || fn === 'peso' ||
        fn === 'data' || fn === 'sexo_macho' || fn === 'sexo_femea'
      )
      return {
        label_original: c.label_text,
        field_name: fn,
        type: 'text' as FieldType,
        description: 'Placeholder DOCX',
        required: false,
        is_system_field: isSys,
        is_custom: !isSys && !isCanonic,
      }
    }),
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

  // IC-16: SHRINK TOP — pdfjs reporta h_pt = fontSize (que inclui o "ascender
  // void" acima do glyph real). Linhas horizontais da tabela vivem nesse
  // espaco vazio. Encolhemos o TOP do erase em ~28% (ascender_void da
  // Helvetica) para preservar essas linhas. O glyph real (cap_top ate
  // descender_bottom) continua totalmente coberto.
  const ERASER_TOP_SHRINK = 0.28

  function shrinkBboxTop(bbox: EraseRect): EraseRect {
    return {
      x_pct: bbox.x_pct,
      y_pct: bbox.y_pct + bbox.h_pct * ERASER_TOP_SHRINK,
      w_pct: bbox.w_pct,
      h_pct: bbox.h_pct * (1 - ERASER_TOP_SHRINK),
    }
  }

  // 6a) sniper candidates (existing_value_bbox respeita regra do ":")
  for (const c of sniperCandidatesFiltered) {
    if (!c.existing_value_bbox) continue
    const shrunk = shrinkBboxTop(c.existing_value_bbox)
    console.log(`[Debug] Apagando valor apos rotulo "${c.label_text}" na pagina ${c.page} coordenada ${fmtBox(shrunk)}`)
    erasePerPage[c.page].push(shrunk)
  }

  // 6b) signatures candidates (whiteout = LINHA INTEIRA, idem shrink)
  for (const c of signatures.candidates) {
    if (!c.existing_value_bbox) continue
    const shrunk = shrinkBboxTop(c.existing_value_bbox)
    console.log(`[Debug] Apagando ASSINATURA "${c.existing_value_text}" na pagina ${c.page} coordenada ${fmtBox(shrunk)}`)
    erasePerPage[c.page].push(shrunk)
  }

  // 7) Aplica erase nos canvases — pixels DESAPARECEM da imagem de fundo.
  let pixelsApagados = 0
  for (let p = 0; p < pageCount; p++) {
    if (!canvases[p]) continue
    const painted = eraseRegions(canvases[p], erasePerPage[p])
    console.log(`[Debug] Pagina ${p}: ${painted}/${erasePerPage[p].length} regioes apagadas no canvas`)
    pixelsApagados += painted
  }

  // 8) Para cada canvas LIMPO: gera tanto PNG Blob (Storage) quanto data URL
  //    (editor preview) ANTES de liberar memoria. Setar width=0/height=0
  //    libera o backing store do canvas (~16MB de RGBA @200dpi por A4).
  const cleaned_pages: Blob[] = []
  const cleaned_data_urls: string[] = []
  for (const c of canvases) {
    cleaned_data_urls.push(c.toDataURL('image/png'))
    cleaned_pages.push(await canvasToPngBlob(c))
    c.width = 0
    c.height = 0
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

    // IC-13/14: REDUCAO VISUAL DA ALTURA DO BBOX
    //
    // O pdfjs reporta `height` igual ao fontSize (12pt em Helvetica 12pt),
    // que inclui ascender + descender da fonte. O BBOX visual desse altura
    // inteira INVADE as linhas horizontais da tabela (cell tipicamente
    // comporta ~60% disso visualmente).
    //
    // Factor 0.6 → bbox compacto, sai bem abaixo do glyph-top ascender.
    // BASELINE preservada (y_pct + h_pct = baseline_topdown), entao
    // drawText continua exatamente no mesmo lugar.
    const BBOX_VISUAL_H_FACTOR = 0.6

    for (const inst of instances) {
      const dim = dimensions[inst.page] ?? dimensions[0]
      const fontSize_pt_raw = inst.font_size_pt * (dim?.height_pt ?? 842) / 100
      const fontSize_pt = isSig
        ? Math.min(11, fontSize_pt_raw)
        : Math.max(8, Math.min(24, fontSize_pt_raw))

      // IC-13: comprime h_pct visual preservando a baseline (y + h constante)
      const orig_y = inst.value_bbox.y_pct
      const orig_h = inst.value_bbox.h_pct
      const baseline_topdown = orig_y + orig_h
      const visual_h = orig_h * BBOX_VISUAL_H_FACTOR
      const visual_y = baseline_topdown - visual_h

      layout_overlays.push({
        id: overlayId(),
        type: 'field',
        field_name: match.field_name,
        label: match.label_original,
        page: inst.page,
        x_pct: inst.value_bbox.x_pct,
        y_pct: visual_y,
        w_pct: inst.value_bbox.w_pct,
        h_pct: visual_h,
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
    cleaned_data_urls,
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
