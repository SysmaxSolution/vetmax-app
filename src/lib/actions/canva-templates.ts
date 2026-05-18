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
}> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('patient_documents')
    .select('document_name, content_json, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'documento não encontrado')

  return {
    document_name: data.document_name,
    content: (data.content_json as CanvaContentJson) ?? { static_fields: {}, dynamic_fields: [] },
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
