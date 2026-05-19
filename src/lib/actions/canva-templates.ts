'use server'

/**
 * Canva Nativo — server actions (CRUD + signed URL de upload do papel timbrado).
 *
 * RLS por clinic_id já garantido pelas policies do bucket patient-documents-bg
 * e pela tabela document_templates / patient_documents.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CanvaContentJson, CanvaTemplateConfig, CanvaBlockStyle, CanvaDynamicField,
} from '@/lib/canva/types'
import { CANVA_DEFAULT_MARGINS, validateContent } from '@/lib/canva/types'
import type { CanvasState } from '@/lib/canva/canvas-state'
import { isCanvasState } from '@/lib/canva/canvas-state'

const BG_BUCKET = 'patient-documents-bg'

async function requireClinic() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()

  if (error || !profile?.clinic_id) throw new Error('no clinic')
  return { supabase, user, profile }
}

/** Guard: apenas usuários is_sysmax = true podem executar a ação.
 *  Usado para operações cross-clinic (replicação de templates). */
async function requireSysmaxSupport() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role, is_sysmax')
    .eq('id', user.id)
    .single()

  if (error || !profile) throw new Error('profile not found')
  if (!profile.is_sysmax) throw new Error('apenas Sysmax Suporte pode executar esta ação')
  return { supabase, user, profile }
}

// ── Upload do papel timbrado de fundo ────────────────────────────────────────

/**
 * Etapa 1: assina o PUT do papel timbrado de fundo.
 * Browser sobe o arquivo direto pro Supabase Storage usando upload_url.
 * Para obter a URL de leitura, chame getBackgroundReadUrl(storage_path)
 * APÓS o PUT completar — gerar antes resulta em "Object not found".
 */
export async function getBackgroundUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode trocar papel timbrado')

  const admin = createAdminClient()
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    throw new Error('formato inválido — use PNG, JPG ou WEBP')
  }

  const path = `${profile.clinic_id}/bg_${Date.now()}.${ext}`

  const { data: upload, error: upErr } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUploadUrl(path)
  if (upErr || !upload) throw new Error(upErr?.message ?? 'falha ao gerar URL de upload')

  return { upload_url: upload.signedUrl, storage_path: path }
}

/** Etapa 2: gera signed read URL (1 ano) APÓS o objeto existir no bucket. */
export async function getBackgroundReadUrl(storagePath: string): Promise<{
  signed_read_url: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode acessar papel timbrado')

  // Tenant guard: caminho começa com clinic_id?
  if (!storagePath.startsWith(`${profile.clinic_id}/`)) {
    throw new Error('caminho fora do escopo da clínica')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (error || !data) throw new Error(error?.message ?? 'falha ao gerar URL de leitura')

  return { signed_read_url: data.signedUrl }
}

// ── Atualizar configuração do template (canva-native) ────────────────────────

export interface UpdateTemplateCanvaConfigInput {
  template_id: string
  background_image_url: string | null
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  block_style: CanvaBlockStyle
}

export async function updateTemplateCanvaConfig(
  input: UpdateTemplateCanvaConfigInput,
): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode configurar modelo')

  const margins = [
    input.margin_top, input.margin_bottom, input.margin_left, input.margin_right,
  ]
  if (margins.some(m => m < 0 || m > 10)) throw new Error('margens devem estar entre 0 e 10cm')
  if (!['solid', 'transparent'].includes(input.block_style)) throw new Error('block_style inválido')

  const { error } = await supabase
    .from('document_templates')
    .update({
      background_image_url: input.background_image_url,
      margin_top: input.margin_top,
      margin_bottom: input.margin_bottom,
      margin_left: input.margin_left,
      margin_right: input.margin_right,
      block_style: input.block_style,
      engine: 'canva-native',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/management')
  return { ok: true }
}

// ── Sysmax Suporte: replicação cross-clinic de templates ────────────────────

export interface ClinicSummary {
  id: string
  name: string
  business_type: string
  status: string
}

export async function listClinicsForSupport(): Promise<ClinicSummary[]> {
  await requireSysmaxSupport()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinics')
    .select('id, name, business_type, status')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as ClinicSummary[]
}

export interface DuplicateTemplateInput {
  template_id: string
  target_clinic_ids: string[]
  new_name?: string
}

export async function duplicateTemplateToClinics(
  input: DuplicateTemplateInput,
): Promise<{ created_ids: string[]; skipped: Array<{ clinic_id: string; reason: string }> }> {
  const { profile } = await requireSysmaxSupport()
  if (input.target_clinic_ids.length === 0) throw new Error('escolha ao menos uma clínica de destino')

  const admin = createAdminClient()

  // 1. Lê template original — admin bypassa RLS (sysmax suporta cross-clinic)
  const { data: original, error: readErr } = await admin
    .from('document_templates')
    .select(`
      name, type, file_url, extracted_fields, template_html, page_images,
      original_pdf_path, original_pdf_size_bytes, page_count, page_dimensions,
      layout_overlays, page_images_storage_paths, cleaned_page_paths,
      engine, background_image_url, margin_top, margin_bottom, margin_left, margin_right,
      block_style, canvas_state
    `)
    .eq('id', input.template_id)
    .single()
  if (readErr || !original) throw new Error(readErr?.message ?? 'template original não encontrado')

  const finalName = (input.new_name?.trim() || original.name)

  // 2. Insere uma cópia por clínica (idempotência via nome — pula clínicas que
  //    já tenham um template com o mesmo nome e tipo)
  const created_ids: string[] = []
  const skipped: Array<{ clinic_id: string; reason: string }> = []

  for (const clinicId of input.target_clinic_ids) {
    const { data: existing } = await admin
      .from('document_templates')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', finalName)
      .eq('type', original.type)
      .maybeSingle()

    if (existing) {
      skipped.push({ clinic_id: clinicId, reason: `Já existe template "${finalName}" do tipo ${original.type}` })
      continue
    }

    const { data: inserted, error: insErr } = await admin
      .from('document_templates')
      .insert({
        clinic_id: clinicId,
        name: finalName,
        type: original.type,
        file_url: original.file_url,
        extracted_fields: original.extracted_fields ?? [],
        template_html: original.template_html,
        page_images: original.page_images,
        original_pdf_path: null,   // cada clínica precisa subir o próprio PDF
        original_pdf_size_bytes: original.original_pdf_size_bytes,
        page_count: original.page_count,
        page_dimensions: original.page_dimensions,
        layout_overlays: original.layout_overlays,
        page_images_storage_paths: null,
        cleaned_page_paths: null,
        engine: original.engine,
        // canvas_state preserva a estrutura mas a URL do papel timbrado vira
        // null — cada clínica precisa enviar o seu próprio asset
        background_image_url: null,
        margin_top: original.margin_top,
        margin_bottom: original.margin_bottom,
        margin_left: original.margin_left,
        margin_right: original.margin_right,
        block_style: original.block_style,
        canvas_state: stripClinicAssets(original.canvas_state),
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      skipped.push({ clinic_id: clinicId, reason: insErr?.message ?? 'falha ao inserir' })
      continue
    }
    created_ids.push(inserted.id)
  }

  revalidatePath('/dashboard/management')

  // Log de auditoria simples — facilita rastrear replicações feitas pelo suporte
  console.log(`[sysmax-support] ${profile.id} duplicou template ${input.template_id} para ${created_ids.length} clínica(s) (skipped: ${skipped.length})`)

  return { created_ids, skipped }
}

/** Remove URLs de assets específicos de clínica do canvas_state copiado.
 *  Cada clínica deve subir seu próprio papel timbrado / imagens.
 *  Estrutura preservada — só as URLs viram null. */
function stripClinicAssets(canvasState: unknown): unknown {
  if (!canvasState || typeof canvasState !== 'object') return canvasState
  const cs = canvasState as Record<string, unknown>
  const page = (cs.page as Record<string, unknown> | undefined) ?? null
  const elements = (cs.elements as Array<Record<string, unknown>> | undefined) ?? []

  return {
    ...cs,
    page: page ? { ...page, backgroundImageUrl: null } : page,
    elements: elements.map(el => {
      // Image element (URL própria) → limpa
      if (el.kind === 'image') return { ...el, url: '', storagePath: undefined }
      return el
    }),
  }
}

// ── Criação de modelo em branco (entrada do Canvas Editor) ──────────────────

export interface CreateBlankCanvasTemplateInput {
  name: string
  type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
}

export async function createBlankCanvasTemplate(
  input: CreateBlankCanvasTemplateInput,
): Promise<{ id: string }> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode criar modelos')

  const name = input.name.trim()
  if (!name) throw new Error('informe um nome para o modelo')

  const admin = createAdminClient()

  const blankCanvasState = {
    version: 1,
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 2, bottom: 2, left: 2, right: 2 },
      backgroundImageUrl: null,
    },
    elements: [],
  }

  const { data, error } = await admin
    .from('document_templates')
    .insert({
      clinic_id: profile.clinic_id,
      name,
      type: input.type,
      file_url: null,
      extracted_fields: [],
      canvas_state: blankCanvasState,
      engine: 'canva-native',
      margin_top: 2.0,
      margin_bottom: 2.0,
      margin_left: 2.0,
      margin_right: 2.0,
      block_style: 'solid',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao criar modelo')

  revalidatePath('/dashboard/management')
  return { id: data.id }
}

// ── Canvas Editor (drag&drop) ────────────────────────────────────────────────

/**
 * Etapa 1: assina o PUT de uma imagem interna do canvas (logo, carimbo).
 * Browser faz o PUT; depois chama getCanvasImageReadUrl(storage_path)
 * para obter a URL de leitura. Gerar read URL antes do PUT falha com
 * "Object not found" no Supabase Storage.
 */
export async function getCanvasImageUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode subir imagens do canvas')

  const admin = createAdminClient()
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
    throw new Error('formato inválido — use PNG, JPG, WEBP ou SVG')
  }

  const path = `${profile.clinic_id}/canvas/img_${Date.now()}.${ext}`

  const { data: up, error: upErr } = await admin.storage.from(BG_BUCKET).createSignedUploadUrl(path)
  if (upErr || !up) throw new Error(upErr?.message ?? 'falha ao gerar URL upload')

  return { upload_url: up.signedUrl, storage_path: path }
}

/** Etapa 2: gera signed read URL após o PUT da imagem do canvas. */
export async function getCanvasImageReadUrl(storagePath: string): Promise<{
  signed_read_url: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode acessar imagens do canvas')

  if (!storagePath.startsWith(`${profile.clinic_id}/`)) {
    throw new Error('caminho fora do escopo da clínica')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BG_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (error || !data) throw new Error(error?.message ?? 'falha ao gerar URL leitura')

  return { signed_read_url: data.signedUrl }
}

export interface UpdateTemplateCanvasStateInput {
  template_id: string
  canvas_state: CanvasState
}

export async function updateTemplateCanvasState(
  input: UpdateTemplateCanvasStateInput,
): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode configurar modelo')

  if (!isCanvasState(input.canvas_state)) {
    throw new Error('canvas_state inválido (esperado {version:1, page, elements})')
  }

  const { error } = await supabase
    .from('document_templates')
    .update({
      canvas_state: input.canvas_state,
      // Sincroniza espelhos legados para que o motor Canva básico siga
      // funcionando se o admin recuar para o editor simples.
      background_image_url: input.canvas_state.page.backgroundImageUrl ?? null,
      margin_top:    input.canvas_state.page.margins.top,
      margin_bottom: input.canvas_state.page.margins.bottom,
      margin_left:   input.canvas_state.page.margins.left,
      margin_right:  input.canvas_state.page.margins.right,
      engine: 'canva-native',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function loadTemplateCanvasState(templateId: string): Promise<CanvasState | null> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('document_templates')
    .select('canvas_state')
    .eq('id', templateId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) return null
  return isCanvasState(data.canvas_state) ? (data.canvas_state as CanvasState) : null
}

// ── Persistir patient_document gerado ────────────────────────────────────────

export interface CreateCanvaPatientDocumentInput {
  template_id: string
  patient_id: string
  consultation_id: string
  document_name: string
  content_json: CanvaContentJson
}

export async function createCanvaPatientDocument(
  input: CreateCanvaPatientDocumentInput,
): Promise<{ id: string }> {
  const { supabase, profile } = await requireClinic()

  if (!validateContent(input.content_json)) {
    throw new Error('content_json inválido (esperado static_fields + dynamic_fields[])')
  }

  // Lê config do template para snapshot (vet pode imprimir histórico anos depois
  // mesmo se o admin trocar o papel timbrado no meio do caminho)
  const { data: tpl, error: tplErr } = await supabase
    .from('document_templates')
    .select('background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (tplErr || !tpl) throw new Error(tplErr?.message ?? 'template não encontrado')

  const { data, error } = await supabase
    .from('patient_documents')
    .insert({
      clinic_id: profile.clinic_id,
      patient_id: input.patient_id,
      consultation_id: input.consultation_id,
      template_id: input.template_id,
      document_name: input.document_name,
      content_json: input.content_json,
      background_image_url: tpl.background_image_url,
      margin_top: tpl.margin_top ?? CANVA_DEFAULT_MARGINS.top,
      margin_bottom: tpl.margin_bottom ?? CANVA_DEFAULT_MARGINS.bottom,
      margin_left: tpl.margin_left ?? CANVA_DEFAULT_MARGINS.left,
      margin_right: tpl.margin_right ?? CANVA_DEFAULT_MARGINS.right,
      block_style: tpl.block_style ?? 'solid',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao salvar laudo')
  revalidatePath('/dashboard/consultation')
  return { id: data.id }
}

export async function loadCanvaPatientDocument(documentId: string): Promise<{
  config: CanvaTemplateConfig
  content: CanvaContentJson
  document_name: string
  canvas_state: CanvasState | null
}> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('patient_documents')
    .select('document_name, content_json, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style, template_id')
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'documento não encontrado')

  // Busca canvas_state do template (motor visual). Snapshot por documento
  // ainda não é persistido — para histórico fiel, copiar canvas_state em
  // patient_documents é uma melhoria futura.
  let canvas_state: CanvasState | null = null
  if (data.template_id) {
    const { data: tpl } = await supabase
      .from('document_templates')
      .select('canvas_state')
      .eq('id', data.template_id)
      .eq('clinic_id', profile.clinic_id)
      .single()
    if (tpl && isCanvasState(tpl.canvas_state)) {
      canvas_state = tpl.canvas_state as CanvasState
    }
  }

  return {
    document_name: data.document_name,
    content: (data.content_json as CanvaContentJson) ?? { static_fields: {}, dynamic_fields: [] },
    canvas_state,
    config: {
      background_image_url: data.background_image_url ?? null,
      margins: {
        top: Number(data.margin_top ?? 2),
        bottom: Number(data.margin_bottom ?? 2),
        left: Number(data.margin_left ?? 2),
        right: Number(data.margin_right ?? 2),
      },
      block_style: (data.block_style as CanvaBlockStyle) ?? 'solid',
    },
  }
}
