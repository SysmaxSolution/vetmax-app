'use server'

/**
 * Operacao Pixel Perfect — F5: Engine de geracao de documentos com pdf-lib.
 *
 * Substitui jspdf (client-side) por pdf-lib (server-side), preservando o PDF
 * original byte-a-byte e adicionando apenas overlay de texto nas coordenadas
 * configuradas no editor.
 *
 * Fluxo:
 *   1. Auth + RLS check via clinic_id
 *   2. Fetch template + download PDF original do Storage
 *   3. PDFDocument.load → preserva fontes, marca d'agua, vetores
 *   4. Para cada overlay 'field', drawText nas coordenadas exatas
 *   5. Upload do PDF preenchido para patient-documents
 *   6. Insert em patient_documents com generated_pdf_path
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { randomUUID } from 'crypto'
import { type PageDimensions } from '@/lib/pdf/coordinate-system'
import { applyOverlayToPage } from '@/lib/pdf/render-overlay'
import { SYSTEM_FIELDS } from '@/lib/pdf/canonical-whitelist'
import type { InterpolationContext } from '@/lib/pdf/interpolate-vars'
import type { LayoutOverlay, ExtractedField, PageDimensionsRecord } from '@/types'
import { logAudit } from './audit'

const TEMPLATE_BUCKET = 'document-templates'
const PATIENT_DOC_BUCKET = 'patient-documents'

// ── Input/Output types ─────────────────────────────────────────────────────

export interface GenerateDocumentInput {
  template_id: string
  patient_id: string
  consultation_id?: string | null
  document_name: string
  field_values: Record<string, string | number | boolean | null>
}

export interface GenerateDocumentResult {
  document_id: string
  storage_path: string
  signed_url: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatValueForPdf(raw: unknown, fieldType?: ExtractedField['type']): string {
  if (raw === null || raw === undefined || raw === '') return ''
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Nao'
  if (fieldType === 'date' && typeof raw === 'string') {
    // ISO yyyy-MM-dd → dd/MM/yyyy
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  return String(raw)
}

/**
 * Mapeia profiles.role (enum RBAC) → string descritiva no laudo.
 * "vet" e "veterinarian" sao tratados; demais voltam display do RBAC.
 */
const ROLE_TO_DISPLAY: Record<string, string> = {
  admin: 'Administrador',
  vet: 'Médico Veterinário',
  veterinarian: 'Médico Veterinário',
  assistant: 'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist: 'Farmacêutico',
  groomer: 'Tosador',
}

/**
 * LEI 3 — monta o contexto de interpolacao a partir do usuario logado.
 *
 * Cobre as 4 linhas tipicas do cabecalho de laudos (e mais):
 *   profiles.full_name           → professional_name
 *   profiles.role (mapeada)      → cargo display (compoe role full)
 *   profiles.specialty           → professional_specialty (exposto separadamente)
 *   role+specialty combinados    → professional_role ("Médico Veterinário – Cardiologista")
 *   profiles.crmv                → professional_crmv
 *   composto                     → professional_signature ("Assinado por X – CRMV-Y")
 *   clinics.name                 → clinic_name
 */
async function buildSystemFieldsContext(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<InterpolationContext> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, crmv, role, specialty, clinic_id')
    .eq('id', userId)
    .single()
  if (!profile) return {}

  let clinicName: string | null = null
  if (profile.clinic_id) {
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('name')
      .eq('id', profile.clinic_id)
      .single()
    clinicName = clinic?.name ?? null
  }

  const name = profile.full_name ?? ''
  const crmv = profile.crmv ?? ''
  const specialty = profile.specialty ?? ''
  const roleRaw = profile.role ?? ''
  const roleDisplay = ROLE_TO_DISPLAY[roleRaw] ?? roleRaw

  // professional_role combina cargo + especialidade na MESMA string —
  // o template tipico tem "Médico Veterinário – Cardiologo" numa unica linha,
  // entao o overlay com field_name=professional_role recebe a string completa.
  const roleFull = roleDisplay
    + (specialty ? ` – ${specialty}` : '')

  // professional_signature: linha de rodape composta. Vazia se nao tem nome.
  const signature = name
    ? `Assinado eletronicamente por ${name}${crmv ? ` – ${crmv}` : ''}`
    : ''

  return {
    professional_name: name,
    professional_role: roleFull,
    professional_specialty: specialty,
    professional_crmv: crmv,
    professional_signature: signature,
    clinic_name: clinicName ?? '',
  }
}

/**
 * Operacao Zero-Touch — Carrega o PDF base para a geracao.
 *
 * Duas vias:
 *   1. Template tem `cleaned_page_paths` (Flatten & Clean): cria PDF novo do
 *      zero (`PDFDocument.create`) e desenha cada PNG limpo como fundo, na
 *      dimensao exata da pagina original. drawText subsequente carimba os
 *      textos novos em cima desse fundo imutavel.
 *
 *   2. Fallback legacy (templates pre-Zero-Touch): faz `PDFDocument.load`
 *      do PDF original e desenha texto sobre ele. Mantido apenas para
 *      compatibilidade — todos os templates novos devem usar (1).
 */
async function loadFlattenedPdf(
  template: {
    cleaned_page_paths?: string[] | null
    original_pdf_path?: string | null
    page_dimensions?: PageDimensionsRecord[] | null
  },
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<{ pdfDoc: PDFDocument; mode: 'zero-touch' | 'legacy' } | { error: string }> {
  const cleanedPaths = (template.cleaned_page_paths ?? null) as string[] | null
  const pageDims = (template.page_dimensions ?? null) as PageDimensionsRecord[] | null

  // ── ZERO-TOUCH path ────────────────────────────────────────────────────
  if (cleanedPaths && cleanedPaths.length > 0 && pageDims && pageDims.length > 0) {
    if (cleanedPaths.length !== pageDims.length) {
      return { error: `cleaned_page_paths (${cleanedPaths.length}) e page_dimensions (${pageDims.length}) desincronizados` }
    }
    const pdfDoc = await PDFDocument.create()
    for (let i = 0; i < cleanedPaths.length; i++) {
      const path = cleanedPaths[i]
      const { data: pngBlob, error: dlErr } = await supabaseAdmin.storage
        .from(TEMPLATE_BUCKET)
        .download(path)
      if (dlErr || !pngBlob) {
        return { error: `Falha ao baixar pagina limpa ${i}: ${dlErr?.message || 'blob vazio'}` }
      }
      const pngBytes = await pngBlob.arrayBuffer()
      const png = await pdfDoc.embedPng(pngBytes)
      const dim = pageDims[i]
      const page = pdfDoc.addPage([dim.width_pt, dim.height_pt])
      // Carimba o fundo cobrindo 100% da pagina (PNG ja contem o template
      // sem os valores antigos — pixel-perfect imutavel).
      page.drawImage(png, {
        x: 0, y: 0, width: dim.width_pt, height: dim.height_pt,
      })
    }
    return { pdfDoc, mode: 'zero-touch' }
  }

  // ── LEGACY path (templates antigos) ────────────────────────────────────
  if (!template.original_pdf_path) {
    return { error: 'Template sem cleaned_page_paths nem original_pdf_path — reimporte o documento' }
  }
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .download(template.original_pdf_path)
  if (dlErr || !pdfBlob) {
    return { error: 'Erro ao baixar PDF original: ' + (dlErr?.message || '') }
  }
  try {
    const pdfDoc = await PDFDocument.load(await pdfBlob.arrayBuffer())
    return { pdfDoc, mode: 'legacy' }
  } catch (e) {
    return { error: 'PDF original invalido: ' + (e instanceof Error ? e.message : '') }
  }
}

/**
 * Hidrata overlays a partir do snapshot canonico OU monta um fallback usando
 * extracted_fields (templates antigos que ainda nao tem layout_overlays).
 */
function buildOverlaysWithFallback(
  layoutOverlays: LayoutOverlay[] | null,
  extractedFields: ExtractedField[],
): LayoutOverlay[] {
  if (layoutOverlays && layoutOverlays.length > 0) return layoutOverlays

  // Fallback: cria overlays apenas para fields com coordenadas % conhecidas
  return extractedFields
    .filter(f => f.x_percent != null)
    .map(f => ({
      id: f.field_name,
      type: 'field' as const,
      field_name: f.field_name,
      label: f.label,
      page: f.page ?? 0,
      x_pct: f.x_percent ?? 30,
      y_pct: f.y_percent ?? 10,
      w_pct: f.width_percent ?? 25,
      h_pct: f.height_percent ?? 3,
      font_size: 11,
      font_weight: 'normal' as const,
      font_family: 'Helvetica' as const,
      text_align: 'left' as const,
    }))
}

// ── Main: generateFilledDocument ────────────────────────────────────────────

export async function generateFilledDocument(
  input: GenerateDocumentInput,
): Promise<GenerateDocumentResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  // 1. Fetch template (RLS isola por clinic_id) — inclui cleaned_page_paths (Zero-Touch)
  const { data: template, error: tplErr } = await supabase
    .from('document_templates')
    .select('id, name, type, original_pdf_path, cleaned_page_paths, page_dimensions, layout_overlays, extracted_fields, page_count')
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (tplErr || !template) {
    return { error: 'Template nao encontrado ou sem permissao' }
  }

  // 2. Operacao Zero-Touch: tenta usar cleaned_page_paths primeiro; fallback
  //    para PDF original em templates antigos
  const admin = createAdminClient()
  const loaded = await loadFlattenedPdf(template as any, admin)
  if ('error' in loaded) return { error: loaded.error }
  const pdfDoc = loaded.pdfDoc

  // 4. Embed fonts standard (Helvetica = default decisao Diretoria §12)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // 4b. LEI 3 — Contexto de interpolacao a partir do usuario logado.
  //     Resolve [professional_name], [professional_crmv], [clinic_name], etc.
  const systemCtx = await buildSystemFieldsContext(admin, user.id)

  // 4c. Merge: campos de sistema entram em field_values automaticamente
  //     (do contrario o overlay type='field' seria pulado por text vazio).
  const mergedFieldValues: Record<string, unknown> = { ...input.field_values }
  for (const key of SYSTEM_FIELDS) {
    if (mergedFieldValues[key] == null || mergedFieldValues[key] === '') {
      mergedFieldValues[key] = systemCtx[key] ?? ''
    }
  }

  // 5. Resolve overlays (canonicos ou fallback de extracted_fields)
  const overlays = buildOverlaysWithFallback(
    (template.layout_overlays as LayoutOverlay[] | null),
    (template.extracted_fields as ExtractedField[]) ?? [],
  )

  const pageDims = (template.page_dimensions as PageDimensionsRecord[] | null) ?? null

  // Map de fields por field_name para resolver tipo (para format de date/boolean)
  const fieldTypeMap = new Map<string, ExtractedField['type']>()
  for (const f of (template.extracted_fields as ExtractedField[]) ?? []) {
    fieldTypeMap.set(f.field_name, f.type)
  }

  // 6. Aplica overlays pagina por pagina
  const pagesInPdf = pdfDoc.getPages()
  for (const overlay of overlays) {
    const pageIdx = overlay.page ?? 0
    if (pageIdx >= pagesInPdf.length) continue
    const page = pagesInPdf[pageIdx]

    // Dimensoes reais (usa o PDF como fonte da verdade — pageDims do template
    // pode estar desincronizado se o usuario subiu PDF diferente)
    const pageSize = page.getSize()
    const pageDim: PageDimensions = { width_pt: pageSize.width, height_pt: pageSize.height }
    const storedDim = pageDims?.[pageIdx]
    if (storedDim && Math.abs(storedDim.width_pt - pageDim.width_pt) > 5) {
      console.warn(`[generateFilledDocument] page ${pageIdx} dim mismatch — armazenado=${storedDim.width_pt}x${storedDim.height_pt}, real=${pageDim.width_pt}x${pageDim.height_pt}`)
    }

    // Resolve conteudo
    let text = ''
    if (overlay.type === 'field') {
      const raw = mergedFieldValues[overlay.field_name ?? '']
      text = formatValueForPdf(raw, fieldTypeMap.get(overlay.field_name ?? ''))
      if (!text) continue
    } else if (overlay.type === 'text') {
      text = overlay.content ?? overlay.label ?? ''
      if (!text) continue
    } else {
      continue
    }

    applyOverlayToPage(page, overlay, text, { helvetica, helveticaBold, ctx: systemCtx }, pageDim)
  }

  // 7. Serializa PDF preenchido
  const filledPdfBytes = await pdfDoc.save({ useObjectStreams: false })

  // 8. Insert em patient_documents (gera id para usar no path)
  const documentId = randomUUID()
  const storagePath = `${profile.clinic_id}/${input.patient_id}/${documentId}.pdf`

  const { error: upErr } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .upload(storagePath, filledPdfBytes, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) {
    return { error: 'Erro ao salvar PDF gerado: ' + upErr.message }
  }

  const { error: insErr } = await admin
    .from('patient_documents')
    .insert({
      id: documentId,
      clinic_id: profile.clinic_id,
      patient_id: input.patient_id,
      consultation_id: input.consultation_id ?? null,
      template_id: template.id,
      template_name: template.name,
      template_type: template.type,
      template_extracted_fields: template.extracted_fields,
      document_name: input.document_name || template.name,
      content_data: input.field_values,
      generated_pdf_path: storagePath,
      overlay_values: input.field_values,
      generated_at: new Date().toISOString(),
    })

  if (insErr) {
    // rollback parcial: remove o PDF do storage
    await admin.storage.from(PATIENT_DOC_BUCKET).remove([storagePath])
    return { error: 'Erro ao registrar documento: ' + insErr.message }
  }

  // 9. Signed URL para visualizacao imediata
  const { data: signedData, error: signErr } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .createSignedUrl(storagePath, 3600)
  if (signErr || !signedData) {
    return { error: 'PDF gerado mas falha ao criar URL: ' + (signErr?.message || '') }
  }

  await logAudit({
    action: 'GENERATE_PIXEL_PERFECT_DOC',
    entity_type: 'patient_documents',
    entity_id: documentId,
    details: {
      template_id: template.id,
      template_name: template.name,
      patient_id: input.patient_id,
      bytes: filledPdfBytes.length,
      overlay_count: overlays.length,
    },
  })

  revalidatePath('/dashboard/vet')

  return {
    document_id: documentId,
    storage_path: storagePath,
    signed_url: signedData.signedUrl,
  }
}

// ── Test/debug helper: gera PDF sem inserir no banco (apenas retorna bytes) ─

export async function previewFilledPdfBytes(
  templateId: string,
  fieldValues: Record<string, any>,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  const { data: template } = await supabase
    .from('document_templates')
    .select('id, original_pdf_path, cleaned_page_paths, page_dimensions, layout_overlays, extracted_fields')
    .eq('id', templateId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!template) return { error: 'Template nao encontrado' }

  const admin = createAdminClient()
  const loaded = await loadFlattenedPdf(template as any, admin)
  if ('error' in loaded) return { error: loaded.error }
  const pdfDoc = loaded.pdfDoc
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // LEI 3 — ctx do usuario logado
  const systemCtx = await buildSystemFieldsContext(admin, user.id)
  const mergedFieldValues: Record<string, unknown> = { ...fieldValues }
  for (const key of SYSTEM_FIELDS) {
    if (mergedFieldValues[key] == null || mergedFieldValues[key] === '') {
      mergedFieldValues[key] = systemCtx[key] ?? ''
    }
  }

  const overlays = buildOverlaysWithFallback(
    template.layout_overlays as LayoutOverlay[] | null,
    (template.extracted_fields as ExtractedField[]) ?? [],
  )

  const fieldTypeMap = new Map<string, ExtractedField['type']>()
  for (const f of (template.extracted_fields as ExtractedField[]) ?? []) {
    fieldTypeMap.set(f.field_name, f.type)
  }

  const pages = pdfDoc.getPages()
  for (const overlay of overlays) {
    const pageIdx = overlay.page ?? 0
    if (pageIdx >= pages.length) continue
    const page = pages[pageIdx]
    const { width, height } = page.getSize()
    const pageDim: PageDimensions = { width_pt: width, height_pt: height }

    let text = ''
    if (overlay.type === 'field') {
      const raw = mergedFieldValues[overlay.field_name ?? '']
      text = formatValueForPdf(raw, fieldTypeMap.get(overlay.field_name ?? ''))
      if (!text) continue
    } else if (overlay.type === 'text') {
      text = overlay.content ?? overlay.label ?? ''
      if (!text) continue
    } else continue

    applyOverlayToPage(page, overlay, text, { helvetica, helveticaBold, ctx: systemCtx }, pageDim)
  }

  const bytes = await pdfDoc.save({ useObjectStreams: false })
  return { bytes }
}

/**
 * Wrapper friendly-to-client: roda previewFilledPdfBytes e devolve o PDF
 * codificado em base64 (string facil de serializar via Server Actions).
 * O caller faz atob/Uint8Array/Blob/createObjectURL para abrir em nova aba.
 */
export async function previewFilledPdfBase64(
  templateId: string,
  fieldValues: Record<string, any>,
): Promise<{ base64: string; byte_length: number } | { error: string }> {
  const r = await previewFilledPdfBytes(templateId, fieldValues)
  if ('error' in r) return r
  const base64 = Buffer.from(r.bytes).toString('base64')
  return { base64, byte_length: r.bytes.length }
}
