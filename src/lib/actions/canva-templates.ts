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

// ── Upload do papel timbrado de fundo ────────────────────────────────────────

export async function getBackgroundUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
  signed_read_url: string
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

  // signed read URL (1 ano) — o admin renova quando configurar o template
  const { data: read, error: readErr } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (readErr || !read) throw new Error(readErr?.message ?? 'falha ao gerar URL de leitura')

  return {
    upload_url: upload.signedUrl,
    storage_path: path,
    signed_read_url: read.signedUrl,
  }
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

// ── Canvas Editor (drag&drop) ────────────────────────────────────────────────

/** Upload de imagens internas do canvas (logo, carimbo, etc.) — bucket bg. */
export async function getCanvasImageUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
  signed_read_url: string
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

  const { data: read, error: rdErr } = await admin.storage.from(BG_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365)
  if (rdErr || !read) throw new Error(rdErr?.message ?? 'falha ao gerar URL leitura')

  return { upload_url: up.signedUrl, storage_path: path, signed_read_url: read.signedUrl }
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
