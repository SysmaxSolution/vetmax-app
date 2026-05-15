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

/**
 * IC-17: Gera signed upload URLs para upload DIRETO browser → Supabase.
 *
 * O fluxo antigo (uploadTemplatePdf + uploadCleanedPages) passava o arquivo
 * inteiro como FormData no payload do Server Action. Para um laudo de 3
 * paginas (PDF ~2MB + 3 PNGs limpos ~600KB cada), o Server Action chegava
 * a demorar 6+ MINUTOS por causa da serializacao + roundtrip do Next.js
 * antes do upload chegar ao Supabase.
 *
 * Esta action APENAS gera os tokens de upload (operacao rapida, <1s) e o
 * cliente faz `supabase.storage.uploadToSignedUrl(path, token, blob)`
 * DIRETO no bucket — sem passar pelo Next.js intermediario.
 *
 * RLS: a action valida auth + role admin antes de gerar os tokens.
 */
export async function getTemplateUploadUrls(input: {
  folder_id?: string
  upload_pdf?: boolean
  upload_pages_count?: number
}): Promise<{
  folder_id: string
  pdf?: { path: string; token: string }
  pages?: { path: string; token: string; idx: number }[]
} | { error: string }> {
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

  const folderId = input.folder_id && /^[0-9a-f-]{36}$/i.test(input.folder_id)
    ? input.folder_id
    : randomUUID()

  const admin = createAdminClient()
  const result: {
    folder_id: string
    pdf?: { path: string; token: string }
    pages?: { path: string; token: string; idx: number }[]
  } = { folder_id: folderId }

  if (input.upload_pdf) {
    const path = `${profile.clinic_id}/${folderId}/original.pdf`
    const { data, error } = await admin.storage
      .from(TEMPLATE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false })
    if (error || !data) return { error: 'Erro criando token PDF: ' + (error?.message || '') }
    result.pdf = { path, token: data.token }
  }

  if (input.upload_pages_count && input.upload_pages_count > 0) {
    if (input.upload_pages_count > 50) return { error: 'Excesso de paginas (max 50)' }
    result.pages = []
    for (let i = 0; i < input.upload_pages_count; i++) {
      const path = `${profile.clinic_id}/${folderId}/page-${i}.png`
      const { data, error } = await admin.storage
        .from(TEMPLATE_BUCKET)
        .createSignedUploadUrl(path, { upsert: true })
      if (error || !data) return { error: `Erro criando token pagina ${i}: ${error?.message || ''}` }
      result.pages.push({ path, token: data.token, idx: i })
    }
  }

  await logAudit({
    action: 'TEMPLATE_UPLOAD_URLS_ISSUED',
    entity_type: 'document_templates_storage',
    entity_id: folderId,
    details: {
      folder_id: folderId,
      pdf: !!input.upload_pdf,
      pages: input.upload_pages_count ?? 0,
    },
  })

  return result
}

/**
 * Operacao Zero-Touch — Upload de PNGs limpos por pagina.
 *
 * Acionado pelo ImportTemplateModal apos o pipeline runFlattenClean. Cada
 * PNG do array vira um arquivo no bucket privado document-templates, dentro
 * da pasta UUID do template:
 *
 *   {clinic_id}/{folder_id}/page-0.png
 *   {clinic_id}/{folder_id}/page-1.png
 *   ...
 *
 * O `folder_id` corresponde ao mesmo UUID usado em uploadTemplatePdf (path
 * tipo `{clinic_id}/{folder_id}/original.pdf`). Quando esse mesmo folder_id
 * eh passado, as paginas limpas ficam coabitando com o PDF original.
 *
 * Retorna a lista de paths na MESMA ORDEM das pages do PDF original — esse
 * array eh persistido em document_templates.cleaned_page_paths.
 *
 * RLS: bucket eh privado; service role grava. Validamos `folder_id` formato
 * UUID e que o usuario eh admin da clinica.
 */
export async function uploadCleanedPages(
  formData: FormData,
): Promise<{ paths: string[]; folder_id: string } | { error: string }> {
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

  // folder_id explicito (se reaproveitando o do uploadTemplatePdf) ou novo
  const reqFolder = (formData.get('folder_id') as string | null) ?? null
  const folderId = reqFolder && /^[0-9a-f-]{36}$/i.test(reqFolder) ? reqFolder : randomUUID()

  // Coleta pages: campos `page-0`, `page-1`, ...
  const pages: { idx: number; file: File }[] = []
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^page-(\d+)$/)
    if (!m || !(value instanceof File)) continue
    const idx = parseInt(m[1], 10)
    if (Number.isNaN(idx) || idx < 0 || idx > 200) continue
    if (value.size > MAX_TEMPLATE_PDF_BYTES) {
      return { error: `Pagina ${idx} excede ${MAX_TEMPLATE_PDF_BYTES / 1024 / 1024}MB` }
    }
    if (!value.type.startsWith('image/')) {
      return { error: `Pagina ${idx} nao eh imagem (${value.type})` }
    }
    pages.push({ idx, file: value })
  }
  if (pages.length === 0) return { error: 'Nenhuma pagina recebida' }

  pages.sort((a, b) => a.idx - b.idx)

  const admin = createAdminClient()
  const paths: string[] = []
  for (const { idx, file } of pages) {
    const path = `${profile.clinic_id}/${folderId}/page-${idx}.png`
    const bytes = await file.arrayBuffer()
    const { error: upErr } = await admin.storage
      .from(TEMPLATE_BUCKET)
      .upload(path, bytes, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      })
    if (upErr) return { error: `Erro upload pagina ${idx}: ${upErr.message}` }
    paths.push(path)
  }

  await logAudit({
    action: 'UPLOAD_TEMPLATE_CLEANED_PAGES',
    entity_type: 'document_templates_storage',
    entity_id: folderId,
    details: { folder_id: folderId, pages: pages.length, total_bytes: pages.reduce((a, p) => a + p.file.size, 0) },
  })

  return { paths, folder_id: folderId }
}

/**
 * Operacao Zero-Touch — devolve signed URLs em lote para um array de
 * `cleaned_page_paths`. Usado pelo editor ao reabrir um template salvo: as
 * paginas vivem no Storage e nao em base64 no banco.
 *
 * Valida que TODOS os paths comecam com o clinic_id do usuario logado.
 */
export async function getCleanedPagesSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<{ urls: string[] } | { error: string }> {
  if (paths.length === 0) return { urls: [] }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  for (const p of paths) {
    if (!p.startsWith(`${profile.clinic_id}/`)) {
      return { error: `Acesso negado: ${p}` }
    }
  }

  const admin = createAdminClient()
  const urls: string[] = []
  for (const p of paths) {
    const { data, error } = await admin.storage
      .from(TEMPLATE_BUCKET)
      .createSignedUrl(p, expiresInSeconds)
    if (error || !data) return { error: `Erro signed URL ${p}: ${error?.message || ''}` }
    urls.push(data.signedUrl)
  }
  return { urls }
}

/**
 * Remove TODAS as paginas limpas de um folder_id (cleanup ao deletar template).
 */
export async function deleteCleanedPages(
  paths: string[],
): Promise<{ success: boolean } | { error: string }> {
  if (paths.length === 0) return { success: true }
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
  for (const p of paths) {
    if (!p.startsWith(`${profile.clinic_id}/`)) {
      return { error: `Acesso negado: ${p}` }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.storage.from(TEMPLATE_BUCKET).remove(paths)
  if (error) return { error: 'Erro ao remover paginas: ' + error.message }
  return { success: true }
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
