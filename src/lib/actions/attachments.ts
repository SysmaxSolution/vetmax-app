'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Attachment = {
  id:          string
  file_name:   string
  file_type:   string
  storage_path: string  // path no bucket: clinic_id/patient_id/timestamp_filename
  signed_url:  string   // URL com validade de 1h para exibição
  created_at:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
}

const SIGNED_URL_EXPIRY = 3600 // 1 hora

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadAttachment(
  formData: FormData,
  patientId: string,
  consultationId?: string
): Promise<Attachment | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const file = formData.get('file') as File | null
  if (!file || !file.name) return { error: 'Nenhum arquivo enviado.' }
  if (file.size === 0) return { error: 'Arquivo vazio.' }
  if (file.size > 52_428_800) return { error: 'Arquivo deve ter menos de 50 MB.' }

  const admin = createAdminClient()

  // Caminho no bucket: clinic_id/patient_id/timestamp_filename
  const safeName    = sanitizeFilename(file.name)
  const storagePath = `${profile.clinic_id}/${patientId}/${Date.now()}_${safeName}`

  // Upload para o Storage
  const arrayBuffer = await file.arrayBuffer()
  const buffer      = Buffer.from(arrayBuffer)

  const { error: uploadErr } = await admin.storage
    .from('clinic-attachments')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return { error: 'Erro no upload: ' + uploadErr.message }

  // Inserir metadados
  const { data: record, error: dbErr } = await admin
    .from('patient_attachments')
    .insert({
      clinic_id:       profile.clinic_id,
      patient_id:      patientId,
      consultation_id: consultationId ?? null,
      file_name:       file.name,
      file_type:       file.type,
      file_url:        storagePath,
      uploaded_by:     user.id,
    })
    .select('id, file_name, file_type, file_url, created_at')
    .single()

  if (dbErr || !record) {
    // Rollback do storage em caso de erro no DB
    await admin.storage.from('clinic-attachments').remove([storagePath])
    return { error: 'Erro ao salvar metadados: ' + (dbErr?.message ?? '') }
  }

  // Gerar URL assinada para exibição imediata
  const { data: signed } = await admin.storage
    .from('clinic-attachments')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

  revalidatePath(`/dashboard/vet/${consultationId ?? ''}`)
  revalidatePath(`/dashboard/exams/${consultationId ?? ''}`)

  return {
    id:           record.id,
    file_name:    record.file_name,
    file_type:    record.file_type,
    storage_path: record.file_url,
    signed_url:   signed?.signedUrl ?? '',
    created_at:   record.created_at,
  }
}

// ─── Listar Anexos (com signed URLs) ─────────────────────────────────────────

/** Retorna TODOS os anexos físicos do pet, de qualquer fase do atendimento.
 *  O parâmetro consultationId está mantido por compatibilidade mas não restringe
 *  a busca — a tela global deve exibir check-in, triagem, consulta e internação. */
export async function getAttachments(
  patientId: string,
  consultationId?: string  // mantido na assinatura por compatibilidade; não filtra
): Promise<Attachment[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Busca todos os anexos do pet na clínica, sem restringir por consultation_id.
  // Ordenação DESC garante que os mais recentes apareçam no topo.
  const { data, error } = await admin
    .from('patient_attachments')
    .select('id, file_name, file_type, file_url, created_at')
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })
  if (error) return { error: 'Erro ao buscar anexos: ' + error.message }

  const rows = data ?? []

  // Gerar signed URLs em paralelo
  const signedResults = await Promise.all(
    rows.map(r =>
      admin.storage.from('clinic-attachments').createSignedUrl(r.file_url, SIGNED_URL_EXPIRY)
    )
  )

  return rows.map((r, i) => ({
    id:           r.id,
    file_name:    r.file_name,
    file_type:    r.file_type,
    storage_path: r.file_url,
    signed_url:   signedResults[i].data?.signedUrl ?? '',
    created_at:   r.created_at,
  }))
}

// ─── Upload de PDF gerado pelo frontend (patient_document → patient_attachment) ─

export async function uploadDocumentPdf(params: {
  pdfBase64:      string   // base64 do PDF gerado pelo pdf-generator
  fileName:       string   // nome do arquivo (sem .pdf — a função adiciona)
  patientId:      string
  consultationId: string
}): Promise<Attachment | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const buffer    = Buffer.from(params.pdfBase64, 'base64')
  const baseName  = sanitizeFilename(params.fileName.replace(/\.pdf$/i, '')) + '.pdf'
  const storagePath = `${profile.clinic_id}/${params.patientId}/${Date.now()}_${baseName}`

  const { error: uploadErr } = await admin.storage
    .from('clinic-attachments')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

  if (uploadErr) return { error: 'Erro no upload do PDF: ' + uploadErr.message }

  const displayName = params.fileName.endsWith('.pdf') ? params.fileName : params.fileName + '.pdf'

  const { data: record, error: dbErr } = await admin
    .from('patient_attachments')
    .insert({
      clinic_id:       profile.clinic_id,
      patient_id:      params.patientId,
      consultation_id: params.consultationId,
      file_name:       displayName,
      file_type:       'application/pdf',
      file_url:        storagePath,
      uploaded_by:     user.id,
    })
    .select('id, file_name, file_type, file_url, created_at')
    .single()

  if (dbErr || !record) {
    await admin.storage.from('clinic-attachments').remove([storagePath])
    return { error: 'Erro ao registrar PDF: ' + (dbErr?.message ?? '') }
  }

  const { data: signed } = await admin.storage
    .from('clinic-attachments')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

  return {
    id:           record.id,
    file_name:    record.file_name,
    file_type:    record.file_type,
    storage_path: record.file_url,
    signed_url:   signed?.signedUrl ?? '',
    created_at:   record.created_at,
  }
}

// ─── Deletar Anexo ────────────────────────────────────────────────────────────

export async function deleteAttachment(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Buscar o caminho no storage antes de deletar
  const { data: record } = await admin
    .from('patient_attachments')
    .select('file_url, clinic_id, consultation_id')
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (!record) return { error: 'Anexo não encontrado.' }

  // Deletar do storage
  await admin.storage.from('clinic-attachments').remove([record.file_url])

  // Deletar da tabela
  const { error } = await admin
    .from('patient_attachments')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao deletar: ' + error.message }

  revalidatePath(`/dashboard/vet/${record.consultation_id ?? ''}`)
  revalidatePath(`/dashboard/exams/${record.consultation_id ?? ''}`)
  return { success: true }
}
