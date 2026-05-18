'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { DocumentTemplate, SaveTemplatePayload } from '@/types'
import { logAudit } from './audit'

/**
 * Obter todos os templates de documentos da clínica
 * Filtra por clinic_id automaticamente via RLS
 */
export async function getTemplates(): Promise<DocumentTemplate[] | { error: string }> {
  const supabase = await createClient()

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // 2. Obter clinic_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }

  // 3. Buscar templates (RLS ativo = filtra por clinic_id automaticamente)
  const { data, error } = await supabase
    .from('document_templates')
    .select(`
      id, clinic_id, name, type, file_url, extracted_fields, template_html,
      page_images, original_pdf_path, original_pdf_size_bytes, page_count,
      page_dimensions, layout_overlays, page_images_storage_paths,
      cleaned_page_paths,
      engine, background_image_url,
      margin_top, margin_bottom, margin_left, margin_right, block_style,
      canvas_state,
      created_at, updated_at
    `)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar templates: ' + error.message }

  return (data || []) as DocumentTemplate[]
}

/**
 * Salvar novo template de documento após review da IA
 * Criado pelo admin após processar com IA
 */
export async function saveTemplate(
  payload: SaveTemplatePayload
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // 2. Verificar se é admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  if (profile.role !== 'admin') return { error: 'Apenas admin pode criar templates.' }

  // 3. Validar payload
  if (!payload.name || !payload.type) {
    return { error: 'Nome e tipo são obrigatórios.' }
  }
  if (!Array.isArray(payload.extracted_fields)) {
    return { error: 'extracted_fields deve ser um array.' }
  }
  if (payload.extracted_fields.length === 0) {
    return { error: 'Adicione pelo menos um campo ao template.' }
  }

  // 4. Validar campos
  const validFieldTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
  for (const field of payload.extracted_fields) {
    if (!field.field_name || !field.label || !field.description) {
      return { error: `Campo incompleto: ${field.label || 'sem label'}` }
    }
    if (!validFieldTypes.includes(field.type)) {
      return { error: `Tipo de campo inválido: ${field.type}` }
    }
  }

  // 5. Inserir via admin client (bypass RLS)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('document_templates')
    .insert({
      clinic_id: profile.clinic_id,
      name: payload.name,
      type: payload.type,
      file_url: null,
      extracted_fields: payload.extracted_fields,
      template_html: payload.template_html || null,
      page_images: payload.page_images || null,
      original_pdf_path: payload.original_pdf_path || null,
      original_pdf_size_bytes: payload.original_pdf_size_bytes ?? null,
      page_count: payload.page_count ?? null,
      page_dimensions: payload.page_dimensions || null,
      layout_overlays: payload.layout_overlays || null,
      cleaned_page_paths: payload.cleaned_page_paths || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: 'Erro ao salvar template: ' + (error?.message || 'desconhecido') }
  }

  await logAudit({ action: 'CREATE_TEMPLATE', entity_type: 'document_templates', entity_id: data.id, details: { name: payload.name, type: payload.type } })

  // 6. Revalidar cache
  revalidatePath('/dashboard/management')

  return { id: data.id }
}

/**
 * Deletar template de documento
 * Apenas admin pode deletar
 */
export async function deleteTemplate(id: string): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // 2. Verificar se é admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return { error: 'Apenas admin pode deletar templates.' }

  // 3. Deletar via admin client
  const admin = createAdminClient()
  const { error } = await admin
    .from('document_templates')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao deletar template: ' + error.message }

  await logAudit({ action: 'DELETE_TEMPLATE', entity_type: 'document_templates', entity_id: id })

  // 4. Revalidar cache
  revalidatePath('/dashboard/management')

  return { success: true }
}

/**
 * Atualizar template de documento existente
 * Apenas admin pode atualizar
 */
export async function updateTemplate(
  id: string,
  payload: SaveTemplatePayload
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  if (profile.role !== 'admin') return { error: 'Apenas admin pode editar templates.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('document_templates')
    .update({
      name: payload.name,
      type: payload.type,
      extracted_fields: payload.extracted_fields,
      template_html: payload.template_html || null,
      page_images: payload.page_images || null,
      original_pdf_path: payload.original_pdf_path ?? undefined,
      original_pdf_size_bytes: payload.original_pdf_size_bytes ?? undefined,
      page_count: payload.page_count ?? undefined,
      page_dimensions: payload.page_dimensions ?? undefined,
      layout_overlays: payload.layout_overlays ?? undefined,
      cleaned_page_paths: payload.cleaned_page_paths ?? undefined,
    })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select('id')
    .single()

  if (error || !data) {
    return { error: 'Erro ao atualizar template: ' + (error?.message || 'desconhecido') }
  }

  await logAudit({ action: 'UPDATE_TEMPLATE', entity_type: 'document_templates', entity_id: data.id, details: { name: payload.name, type: payload.type } })

  revalidatePath('/dashboard/management')
  return { id: data.id }
}
