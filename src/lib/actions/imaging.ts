'use server'

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  formatShareToken, isValidTokenFormat, canViewLink, computeExpiry,
} from '@/lib/imaging/share-token'
import {
  nextStatusOnImageUpload, nextStatusOnLaudoRelease,
  shouldSendImagesEmail, shouldSendLaudoEmail, studyVisibility,
  type StudyStatus,
} from '@/lib/imaging/study-status'
import { sendImagesReadyEmail, sendLaudoReadyEmail } from '@/lib/imaging/email'
import { notifyTutorResultReleased } from '@/lib/actions/tutor-portal'
import { signLaudoDocument } from '@/lib/actions/laudo-signature'
import type {
  ImagingStudyRow, CreateStudyInput, PublicStudyFile, PublicStudyView, StaffStudyDetail,
} from '@/lib/imaging/types'

const BUCKET = 'imaging-files'
const DOC_BUCKET = 'patient-documents'
const SIGNED_TTL = 3600
const DEFAULT_LINK_DAYS = 30

// ─── Contexto (usuário + clínica) ────────────────────────────────────────────
type Ctx = { userId: string; clinicId: string; role: string }
async function getCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { userId: user.id, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
}

function newToken(): string {
  return formatShareToken(randomBytes(24).toString('hex'))
}

function fileKind(name: string, type: string): 'image' | 'dicom' | 'preview' | 'other' {
  const n = (name ?? '').toLowerCase()
  const t = (type ?? '').toLowerCase()
  if (t.includes('dicom') || n.endsWith('.dcm') || n.endsWith('.dicom')) return 'dicom'
  if (t.startsWith('image/')) return 'image'
  return 'other'
}

function sanitize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').toLowerCase()
}

// ─── Criar estudo ─────────────────────────────────────────────────────────────
export async function createImagingStudy(
  input: CreateStudyInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!input.patientId) return { error: 'Paciente obrigatório.' }

  const admin = createAdminClient()

  // Prefill do vet a partir da clínica parceira, quando informada e sem contato manual
  let vetName = input.referringVetName?.trim() || null
  let vetEmail = input.referringVetEmail?.trim() || null
  let vetCrmv = input.referringVetCrmv?.trim() || null
  if (input.partnerClinicId && (!vetEmail || !vetName)) {
    const { data: pc } = await admin
      .from('partner_clinics')
      .select('contact_name, email, crmv, name')
      .eq('id', input.partnerClinicId).eq('clinic_id', ctx.clinicId).maybeSingle()
    if (pc) {
      vetName = vetName || (pc as any).contact_name || (pc as any).name || null
      vetEmail = vetEmail || (pc as any).email || null
      vetCrmv = vetCrmv || (pc as any).crmv || null
    }
  }

  const { data, error } = await admin
    .from('imaging_studies')
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: input.patientId,
      consultation_id: input.consultationId ?? null,
      exam_request_id: input.examRequestId ?? null,
      modality: input.modality?.trim() || null,
      title: input.title?.trim() || null,
      notes: input.notes?.trim() || null,
      referring_vet_name: vetName,
      referring_vet_email: vetEmail,
      referring_vet_crmv: vetCrmv,
      partner_clinic_id: input.partnerClinicId ?? null,
      catalog_item_id: input.catalogItemId ?? null,
      referring_professional_id: input.referringProfessionalId ?? null,
      created_by: ctx.userId,
    })
    .select('id').single()

  if (error || !data) return { error: 'Erro ao criar estudo: ' + (error?.message ?? '') }
  revalidatePath('/dashboard/exams')
  return { id: data.id as string }
}

// ─── Listar (fila da equipe) ──────────────────────────────────────────────────
export async function listImagingStudies(): Promise<ImagingStudyRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('imaging_studies')
    .select(`
      id, patient_id, modality, title, referring_vet_name, referring_vet_email,
      status, images_uploaded_at, laudo_released_at, released_to_tutor_at, created_at,
      patients!patient_id ( name ),
      consultations!consultation_id ( os_number ),
      imaging_files ( id )
    `)
    .eq('clinic_id', ctx.clinicId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { error: 'Erro ao listar: ' + error.message }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    patient_id: r.patient_id,
    patient_name: (Array.isArray(r.patients) ? r.patients[0] : r.patients)?.name ?? null,
    os_number: (Array.isArray(r.consultations) ? r.consultations[0] : r.consultations)?.os_number ?? null,
    modality: r.modality,
    title: r.title,
    referring_vet_name: r.referring_vet_name,
    referring_vet_email: r.referring_vet_email,
    status: r.status,
    images_uploaded_at: r.images_uploaded_at,
    laudo_released_at: r.laudo_released_at,
    released_to_tutor_at: r.released_to_tutor_at,
    file_count: Array.isArray(r.imaging_files) ? r.imaging_files.length : 0,
    created_at: r.created_at,
  }))
}

// ─── Garante um link de compartilhamento para um público ─────────────────────
async function ensureShareLink(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string, studyId: string, audience: 'referring_vet' | 'tutor',
  recipientEmail: string | null, createdBy: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('imaging_share_links')
    .select('token, revoked_at')
    .eq('study_id', studyId).eq('audience', audience).is('revoked_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.token) return existing.token as string

  const token = newToken()
  await admin.from('imaging_share_links').insert({
    clinic_id: clinicId, study_id: studyId, token, audience,
    recipient_email: recipientEmail,
    expires_at: computeExpiry(new Date().toISOString(), DEFAULT_LINK_DAYS),
    created_by: createdBy,
  })
  return token
}

// ─── Upload de imagem/DICOM ───────────────────────────────────────────────────
export async function uploadImagingFile(
  formData: FormData, studyId: string,
): Promise<{ ok: true; fileId: string; emailedVet: boolean } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const file = formData.get('file') as File | null
  if (!file || !file.name) return { error: 'Nenhum arquivo enviado.' }
  if (file.size === 0) return { error: 'Arquivo vazio.' }
  if (file.size > 314_572_800) return { error: 'Arquivo deve ter menos de 300 MB.' }

  const admin = createAdminClient()
  const { data: study, error: sErr } = await admin
    .from('imaging_studies').select('*').eq('id', studyId).eq('clinic_id', ctx.clinicId).single()
  if (sErr || !study) return { error: 'Estudo não encontrado.' }
  if (study.status === 'cancelled') return { error: 'Estudo cancelado.' }

  const path = `${ctx.clinicId}/${studyId}/${Date.now()}_${sanitize(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) return { error: 'Erro no upload: ' + upErr.message }

  const { data: rec, error: dbErr } = await admin.from('imaging_files').insert({
    clinic_id: ctx.clinicId, study_id: studyId, storage_path: path,
    file_name: file.name, content_type: file.type || null,
    kind: fileKind(file.name, file.type), size_bytes: file.size,
  }).select('id').single()
  if (dbErr || !rec) {
    await admin.storage.from(BUCKET).remove([path])
    return { error: 'Erro ao registrar arquivo: ' + (dbErr?.message ?? '') }
  }

  // Primeiro upload → marca images_ready e dispara e-mail ao vet solicitante
  let emailedVet = false
  const isFirst = !study.images_uploaded_at
  if (isFirst) {
    const now = new Date().toISOString()
    const nextStatus = nextStatusOnImageUpload(study.status as StudyStatus)
    await admin.from('imaging_studies').update({
      status: nextStatus, images_uploaded_at: now, updated_at: now,
    }).eq('id', studyId)

    const merged = { ...study, images_uploaded_at: now, status: nextStatus }
    if (shouldSendImagesEmail(merged as any)) {
      const token = await ensureShareLink(admin, ctx.clinicId, studyId, 'referring_vet', study.referring_vet_email, ctx.userId)
      const link = `${await getOrigin()}/public/laudo/${token}`
      const meta = await studyEmailMeta(admin, study)
      const res = await sendImagesReadyEmail({
        to: study.referring_vet_email, vetName: study.referring_vet_name,
        clinicName: meta.clinicName, petName: meta.petName,
        modality: study.modality, studyTitle: study.title, linkUrl: link,
      })
      if (!res.error) {
        emailedVet = true
        await admin.from('imaging_studies').update({ images_email_sent_at: now }).eq('id', studyId)
      }
    }
  }

  revalidatePath('/dashboard/exams')
  return { ok: true, fileId: rec.id as string, emailedVet }
}

async function studyEmailMeta(
  admin: ReturnType<typeof createAdminClient>, study: any,
): Promise<{ clinicName: string; petName: string }> {
  const [{ data: clinic }, { data: pet }] = await Promise.all([
    admin.from('clinics').select('name').eq('id', study.clinic_id).maybeSingle(),
    admin.from('patients').select('name').eq('id', study.patient_id).maybeSingle(),
  ])
  return {
    clinicName: (clinic as any)?.name ?? 'Centro de Diagnóstico',
    petName: (pet as any)?.name ?? 'Paciente',
  }
}

// ─── Anexar/liberar laudo (gate MV: vet/admin) ───────────────────────────────
export async function attachLaudoToStudy(
  studyId: string, patientDocumentId: string,
): Promise<{ ok: true; emailedVet: boolean } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['vet', 'admin'].includes(ctx.role)) return { error: 'Apenas Médico Veterinário pode liberar o laudo.' }

  const admin = createAdminClient()
  const { data: study, error: sErr } = await admin
    .from('imaging_studies').select('*').eq('id', studyId).eq('clinic_id', ctx.clinicId).single()
  if (sErr || !study) return { error: 'Estudo não encontrado.' }

  // valida que o documento pertence à mesma clínica/pet
  const { data: doc } = await admin
    .from('patient_documents').select('id, clinic_id').eq('id', patientDocumentId).maybeSingle()
  if (!doc || (doc as any).clinic_id !== ctx.clinicId) return { error: 'Laudo (documento) inválido.' }

  const now = new Date().toISOString()
  const nextStatus = nextStatusOnLaudoRelease(study.status as StudyStatus)
  await admin.from('imaging_studies').update({
    laudo_document_id: patientDocumentId, laudo_released_at: now,
    status: nextStatus, updated_at: now,
  }).eq('id', studyId)

  // Autenticidade: carimba QR + hash + assinatura do MV que liberou (best-effort).
  try {
    const { data: prof } = await admin.from('profiles').select('full_name, crmv').eq('id', ctx.userId).maybeSingle()
    await signLaudoDocument(patientDocumentId, ctx.clinicId,
      { id: ctx.userId, name: (prof as any)?.full_name ?? null, crmv: (prof as any)?.crmv ?? null },
      await getOrigin())
  } catch { /* assinatura é best-effort; não trava a liberação */ }

  let emailedVet = false
  const merged = { ...study, laudo_released_at: now, status: nextStatus }
  if (shouldSendLaudoEmail(merged as any)) {
    const token = await ensureShareLink(admin, ctx.clinicId, studyId, 'referring_vet', study.referring_vet_email, ctx.userId)
    const link = `${await getOrigin()}/public/laudo/${token}`
    const meta = await studyEmailMeta(admin, study)
    const res = await sendLaudoReadyEmail({
      to: study.referring_vet_email, vetName: study.referring_vet_name,
      clinicName: meta.clinicName, petName: meta.petName,
      modality: study.modality, studyTitle: study.title, linkUrl: link,
    })
    if (!res.error) {
      emailedVet = true
      await admin.from('imaging_studies').update({ laudo_email_sent_at: now }).eq('id', studyId)
    }
  }

  // Publicação automática no Portal do Tutor: se o serviço vinculado estiver
  // marcado como "publicar resultado no portal", libera ao tutor ao sair o laudo.
  if (study.catalog_item_id && !study.released_to_tutor_at) {
    const { data: svc } = await admin
      .from('clinic_catalog').select('publish_to_portal').eq('id', study.catalog_item_id).maybeSingle()
    if ((svc as any)?.publish_to_portal === true) {
      await admin.from('imaging_studies').update({ released_to_tutor_at: now }).eq('id', studyId)
      await ensureShareLink(admin, ctx.clinicId, studyId, 'tutor', null, ctx.userId)
      try {
        const { data: pet } = await admin.from('patients').select('tutor_id, name').eq('id', study.patient_id).maybeSingle()
        if ((pet as any)?.tutor_id) await notifyTutorResultReleased((pet as any).tutor_id, (pet as any).name ?? 'seu pet')
      } catch { /* best-effort */ }
    }
  }

  revalidatePath('/dashboard/exams')
  return { ok: true, emailedVet }
}

// ─── Liberar ao tutor (gate separado) ────────────────────────────────────────
export async function releaseStudyToTutor(
  studyId: string,
): Promise<{ ok: true; token: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data: study, error } = await admin
    .from('imaging_studies').select('*').eq('id', studyId).eq('clinic_id', ctx.clinicId).single()
  if (error || !study) return { error: 'Estudo não encontrado.' }
  const now = new Date().toISOString()
  await admin.from('imaging_studies').update({ released_to_tutor_at: now, updated_at: now }).eq('id', studyId)
  const token = await ensureShareLink(admin, ctx.clinicId, studyId, 'tutor', null, ctx.userId)

  // Avisa o tutor por WhatsApp (best-effort)
  try {
    const { data: pet } = await admin.from('patients').select('tutor_id, name').eq('id', study.patient_id).maybeSingle()
    if ((pet as any)?.tutor_id) await notifyTutorResultReleased((pet as any).tutor_id, (pet as any).name ?? 'seu pet')
  } catch { /* best-effort */ }

  revalidatePath('/dashboard/exams')
  return { ok: true, token }
}

// ─── Reenviar link ao vet solicitante ────────────────────────────────────────
export async function resendReferringVetLink(
  studyId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data: study, error } = await admin
    .from('imaging_studies').select('*').eq('id', studyId).eq('clinic_id', ctx.clinicId).single()
  if (error || !study) return { error: 'Estudo não encontrado.' }
  if (!study.referring_vet_email) return { error: 'Sem e-mail do veterinário solicitante.' }
  if (!study.images_uploaded_at) return { error: 'Ainda não há imagens para enviar.' }

  const token = await ensureShareLink(admin, ctx.clinicId, studyId, 'referring_vet', study.referring_vet_email, ctx.userId)
  const link = `${await getOrigin()}/public/laudo/${token}`
  const meta = await studyEmailMeta(admin, study)
  const send = study.laudo_released_at ? sendLaudoReadyEmail : sendImagesReadyEmail
  const res = await send({
    to: study.referring_vet_email, vetName: study.referring_vet_name,
    clinicName: meta.clinicName, petName: meta.petName,
    modality: study.modality, studyTitle: study.title, linkUrl: link,
  })
  if (res.error) return { error: res.error }
  return { ok: true }
}

// ─── Revogar link ─────────────────────────────────────────────────────────────
export async function revokeShareLink(linkId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { error } = await admin.from('imaging_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId).eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao revogar: ' + error.message }
  return { ok: true }
}

// ─── Acesso PÚBLICO por token (vet/tutor) ────────────────────────────────────
export async function getStudyByToken(
  token: string,
): Promise<PublicStudyView | { error: string; reason?: string }> {
  if (!isValidTokenFormat(token)) return { error: 'Link inválido.' }
  const admin = createAdminClient()

  const { data: link } = await admin
    .from('imaging_share_links')
    .select('id, study_id, audience, expires_at, revoked_at, view_count')
    .eq('token', token).maybeSingle()
  if (!link) return { error: 'Link não encontrado.' }

  const view = canViewLink(link as any, new Date().toISOString())
  if (!view.ok) return { error: view.reason === 'expired' ? 'Link expirado.' : 'Link revogado.', reason: view.reason }

  const { data: study } = await admin
    .from('imaging_studies').select('*').eq('id', (link as any).study_id).maybeSingle()
  if (!study) return { error: 'Estudo não encontrado.' }

  const audience = (link as any).audience as 'referring_vet' | 'tutor'
  const vis = studyVisibility(study as any, audience)

  // best-effort: registra visualização
  await admin.from('imaging_share_links').update({
    view_count: ((link as any).view_count ?? 0) + 1,
    last_viewed_at: new Date().toISOString(),
  }).eq('id', (link as any).id)

  const [{ data: clinic }, { data: pet }] = await Promise.all([
    admin.from('clinics').select('name, phone').eq('id', study.clinic_id).maybeSingle(),
    admin.from('patients').select('name').eq('id', study.patient_id).maybeSingle(),
  ])

  // Imagens (signed urls) — só se o público pode ver
  let images: PublicStudyFile[] = []
  if (vis.canSeeImages) {
    const { data: files } = await admin
      .from('imaging_files').select('storage_path, file_name, content_type, kind')
      .eq('study_id', study.id).order('created_at', { ascending: true })
    const rows = files ?? []
    const signed = await Promise.all(rows.map((f: any) =>
      admin.storage.from(BUCKET).createSignedUrl(f.storage_path, SIGNED_TTL)))
    images = rows.map((f: any, i: number) => ({
      name: f.file_name ?? 'imagem', kind: f.kind ?? 'image',
      contentType: f.content_type ?? null, url: signed[i]?.data?.signedUrl ?? '',
    })).filter(f => f.url)
  }

  // Laudo (signed url) — só se liberado e visível
  let laudoUrl: string | null = null
  if (vis.canSeeLaudo && study.laudo_document_id) {
    const { data: doc } = await admin
      .from('patient_documents').select('generated_pdf_path').eq('id', study.laudo_document_id).maybeSingle()
    const p = (doc as any)?.generated_pdf_path
    if (p) {
      const { data: s } = await admin.storage.from(DOC_BUCKET).createSignedUrl(p, SIGNED_TTL)
      laudoUrl = s?.signedUrl ?? null
    }
  }

  return {
    petName: (pet as any)?.name ?? 'Paciente',
    clinicName: (clinic as any)?.name ?? 'Centro de Diagnóstico',
    clinicPhone: (clinic as any)?.phone ?? null,
    modality: study.modality, title: study.title,
    referringVetName: study.referring_vet_name,
    audience, status: study.status as StudyStatus,
    images, laudoUrl, laudoAvailable: vis.canSeeLaudo && !!study.laudo_document_id,
    createdAt: study.created_at,
  }
}

// ─── Detalhe para a equipe (com signed urls + links) ─────────────────────────
export async function getStudyDetail(studyId: string): Promise<StaffStudyDetail | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data: s, error } = await admin
    .from('imaging_studies').select('*').eq('id', studyId).eq('clinic_id', ctx.clinicId).single()
  if (error || !s) return { error: 'Estudo não encontrado.' }

  const [{ data: pet }, { data: cons }, { data: files }, { data: links }] = await Promise.all([
    admin.from('patients').select('name').eq('id', s.patient_id).maybeSingle(),
    s.consultation_id ? admin.from('consultations').select('os_number').eq('id', s.consultation_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('imaging_files').select('storage_path, file_name, content_type, kind').eq('study_id', studyId).order('created_at', { ascending: true }),
    admin.from('imaging_share_links').select('id, audience, token, revoked_at, view_count, expires_at').eq('study_id', studyId).order('created_at', { ascending: false }),
  ])

  const signed = await Promise.all((files ?? []).map((f: any) =>
    admin.storage.from(BUCKET).createSignedUrl(f.storage_path, SIGNED_TTL)))
  const origin = await getOrigin()

  return {
    id: s.id, patient_id: s.patient_id, patient_name: (pet as any)?.name ?? null,
    os_number: (cons as any)?.os_number ?? null,
    modality: s.modality, title: s.title, notes: s.notes,
    referring_vet_name: s.referring_vet_name, referring_vet_email: s.referring_vet_email,
    referring_vet_crmv: s.referring_vet_crmv,
    status: s.status, images_uploaded_at: s.images_uploaded_at,
    laudo_released_at: s.laudo_released_at, laudo_document_id: s.laudo_document_id,
    released_to_tutor_at: s.released_to_tutor_at,
    file_count: (files ?? []).length, created_at: s.created_at,
    files: (files ?? []).map((f: any, i: number) => ({
      name: f.file_name ?? 'imagem', kind: f.kind ?? 'image',
      contentType: f.content_type ?? null, url: signed[i]?.data?.signedUrl ?? '',
    })),
    links: (links ?? []).map((l: any) => ({
      id: l.id, audience: l.audience, token: l.token,
      url: `${origin}/public/laudo/${l.token}`,
      revoked: !!l.revoked_at, views: l.view_count ?? 0, expires_at: l.expires_at,
    })),
  }
}

// ─── Documentos do pet que podem ser anexados como laudo (têm PDF gerado) ─────
export async function listLaudoCandidates(
  patientId: string,
): Promise<{ id: string; name: string; created_at: string }[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!patientId) return { error: 'Paciente obrigatório.' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('patient_documents')
    .select('id, document_name, generated_pdf_path, created_at')
    .eq('patient_id', patientId).eq('clinic_id', ctx.clinicId)
    .not('generated_pdf_path', 'is', null)
    .order('created_at', { ascending: false }).limit(50)
  if (error) return { error: 'Erro ao listar documentos: ' + error.message }
  return (data ?? []).map((d: any) => ({
    id: d.id, name: d.document_name ?? 'Documento', created_at: d.created_at,
  }))
}
