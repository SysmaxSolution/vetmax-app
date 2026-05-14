'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'
import { logAudit } from './audit'

const TEMPLATE_BUCKET = 'document-templates'
const PATIENT_DOC_BUCKET = 'patient-documents'

const MAX_TEMPLATE_PDF_BYTES = 50 * 1024 * 1024   // 50 MB

/**
 * Upload do PDF original do template para o bucket privado `document-templates`.
 *
 * Path: {clinic_id}/{uuid}/original.pdf
 * Retorna o path para persistir em document_templates.original_pdf_path.
 *
 * RLS: garantida pela policy SQL — apenas admins da clinica podem escrever.
 */
export async function uploadTemplatePdf(
  formData: FormData,
): Promise<{ path: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }
  if (profile.role !== 'admin') return { error: 'Apenas admin pode subir templates' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Arquivo nao fornecido' }
  if (file.size > MAX_TEMPLATE_PDF_BYTES) {
    return { error: `Arquivo excede o limite de ${MAX_TEMPLATE_PDF_BYTES / 1024 / 1024}MB` }
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Apenas arquivos PDF sao aceitos para template' }
  }

  // Path: {clinic_id}/{uuid}/original.pdf
  const folderId = randomUUID()
  const path = `${profile.clinic_id}/${folderId}/original.pdf`

  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, bytes, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadErr) {
    return { error: 'Erro no upload do PDF: ' + uploadErr.message }
  }

  await logAudit({
    action: 'UPLOAD_TEMPLATE_PDF',
    entity_type: 'document_templates_storage',
    entity_id: folderId,
    details: { path, size_bytes: file.size, name: file.name },
  })

  return { path }
}

/**
 * Gera signed URL temporaria para o PDF original do template.
 * Usado pelo editor para exibir o PDF como fundo, e pela engine de geracao
 * para baixar o arquivo e aplicar overlay com pdf-lib.
 */
export async function getTemplatePdfSignedUrl(
  templatePath: string,
  expiresInSeconds = 3600,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  // Sanity check: path comeca com clinic_id do usuario
  if (!templatePath.startsWith(`${profile.clinic_id}/`)) {
    return { error: 'Acesso negado a este template' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(TEMPLATE_BUCKET)
    .createSignedUrl(templatePath, expiresInSeconds)

  if (error || !data) return { error: 'Erro ao gerar URL: ' + (error?.message || '') }
  return { url: data.signedUrl }
}

/**
 * Remove o PDF original do Storage. Acionado pelo deleteTemplate.
 */
export async function deleteTemplatePdf(
  templatePath: string,
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id || profile.role !== 'admin') {
    return { error: 'Apenas admin pode deletar' }
  }
  if (!templatePath.startsWith(`${profile.clinic_id}/`)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()
  const { error } = await admin.storage.from(TEMPLATE_BUCKET).remove([templatePath])
  if (error) return { error: 'Erro ao remover: ' + error.message }
  return { success: true }
}

/**
 * Upload do PDF gerado (preenchido) ao bucket patient-documents.
 * Usado pela engine pdf-lib em F5.
 */
export async function uploadGeneratedPatientPdf(
  patientId: string,
  documentId: string,
  pdfBytes: Uint8Array,
): Promise<{ path: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  const path = `${profile.clinic_id}/${patientId}/${documentId}.pdf`
  const admin = createAdminClient()
  const { error: uploadErr } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .upload(path, pdfBytes, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadErr) return { error: 'Erro upload: ' + uploadErr.message }
  return { path }
}

export async function getPatientDocSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }
  if (!path.startsWith(`${profile.clinic_id}/`)) return { error: 'Acesso negado' }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data) return { error: 'Erro ao gerar URL: ' + (error?.message || '') }
  return { url: data.signedUrl }
}
