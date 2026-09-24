'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTutorContext } from '@/lib/portal/session'
import { allowedTutorIds, allowedClinicIds, canAccessPatient } from '@/lib/portal/access'
import type {
  PortalPet, PortalPetDetail, PortalVaccine, PortalExamResult, PortalImaging, PortalDocument, PortalPrescription,
  PortalTrend, PortalTimelineEvent, PortalProcessing,
} from '@/lib/portal/types'
import { resolveBookingConfig, portalBookingAllowed } from '@/lib/scheduling/booking-config'
import { filterPublishedExams } from '@/lib/portal/exam-publish'
import { buildTrends } from '@/lib/portal/trend'
import { EXAM_PROCESSING_STATUSES, examStatusLabel, imagingStatusLabel } from '@/lib/portal/processing'
import { linksForClinic } from '@/lib/portal/clinic-context'
import { loadPortalBrand } from '@/lib/portal/brand-server'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
}

// Marca (white-label) para o cabeçalho do portal.
//
// A limitação antiga ("só quando o tutor tem exatamente UMA clínica") caiu: com
// o contexto de clínica na URL (`/portal/c/<slug>`) a marca é SEMPRE resolvível.
// `clinicId` é validado contra os vínculos — passar a clínica de outra pessoa
// não revela nome nem logo.
export async function getPortalBranding(
  clinicId?: string,
): Promise<{ clinicName: string | null; clinicLogo: string | null }> {
  const ctx = await getTutorContext()
  if (!ctx) return { clinicName: null, clinicLogo: null }
  const clinicIds = allowedClinicIds(ctx.links)
  const target = clinicId ?? (clinicIds.length === 1 ? clinicIds[0] : null)
  if (!target || !clinicIds.includes(target)) return { clinicName: null, clinicLogo: null }
  const brand = await loadPortalBrand(target)
  return { clinicName: brand.clinicName, clinicLogo: brand.clinicLogo }
}

// Lista os pets do tutor logado.
//
// Sem `clinicId`, em TODAS as clínicas onde ele é tutor (comportamento antigo,
// mantido para os links já enviados). Com `clinicId`, SÓ naquela clínica — é o
// que o contexto de URL usa.
//
// Isolamento em código: a consulta é restrita aos (tutor_id ∈ allowed) ∩
// (clinic_id ∈ allowed) e depois re-filtrada por canAccessPatient (par exato
// tutor_id+clinic_id) — defesa em profundidade. O `clinicId` do contexto é
// interseccionado com os vínculos ANTES da consulta: ele só consegue reduzir a
// lista, nunca ampliá-la.
export async function getPortalPets(clinicId?: string): Promise<PortalPet[] | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'auth' }

  const scoped = clinicId ? linksForClinic(ctx.links, clinicId) : ctx.links
  const tutorIds = allowedTutorIds(scoped)
  const clinicIds = allowedClinicIds(scoped)
  if (tutorIds.length === 0) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('patients')
    .select('id, name, species, photo_url, tutor_id, clinic_id, clinics!clinic_id ( name )')
    .in('tutor_id', tutorIds)
    .in('clinic_id', clinicIds)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao carregar pets.' }

  return (data ?? [])
    .filter((p: any) => canAccessPatient(p.tutor_id, p.clinic_id, scoped))
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      species: p.species ?? null,
      photoUrl: p.photo_url ?? null,
      clinicId: p.clinic_id,
      clinicName: (Array.isArray(p.clinics) ? p.clinics[0] : p.clinics)?.name ?? 'Clínica',
    }))
}

// Detalhe de UM pet — só se o tutor logado tiver acesso ao par (tutor_id, clinic_id).
export async function getPortalPetDetail(petId: string): Promise<PortalPetDetail | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'auth' }
  const admin = createAdminClient()

  const { data: pet } = await admin
    .from('patients')
    .select('id, name, species, breed, photo_url, tutor_id, clinic_id, clinics!clinic_id ( name, phone, flow_config, portal_slug )')
    .eq('id', petId).is('deleted_at', null).maybeSingle()
  if (!pet) return { error: 'not_found' }
  if (!canAccessPatient((pet as any).tutor_id, (pet as any).clinic_id, ctx.links)) return { error: 'forbidden' }

  const clinic = Array.isArray((pet as any).clinics) ? (pet as any).clinics[0] : (pet as any).clinics
  const canBook = portalBookingAllowed(resolveBookingConfig(clinic?.flow_config))

  // Vacinas
  const { data: vacc } = await admin
    .from('patient_vaccines')
    .select('id, vaccine_name, date_administered, next_due_date, vet:administered_by ( full_name )')
    .eq('patient_id', petId).order('date_administered', { ascending: false })
  const vaccines: PortalVaccine[] = (vacc ?? []).map((v: any) => ({
    id: v.id, vaccineName: v.vaccine_name, dateAdministered: v.date_administered,
    nextDueDate: v.next_due_date ?? null,
    vetName: (Array.isArray(v.vet) ? v.vet[0] : v.vet)?.full_name ?? null,
  }))

  // Exames liberados (exam_results.status='released', via consultas do pet)
  const { data: cons } = await admin.from('consultations').select('id, created_at').eq('patient_id', petId)
  const consIds = (cons ?? []).map((c: any) => c.id)
  let exams: PortalExamResult[] = []
  let trends: PortalTrend[] = []
  if (consIds.length) {
    const { data: er } = await admin
      .from('exam_results')
      .select('panel, analyte_name, value_text, unit, ref_text, flag, released_at, created_at, status')
      .in('consultation_id', consIds).eq('status', 'released')
      .order('released_at', { ascending: false }).limit(500)
    let mapped = (er ?? []).map((e: any) => ({
      panel: e.panel ?? null, analyteName: e.analyte_name, value: e.value_text,
      unit: e.unit ?? null, refText: e.ref_text ?? null, flag: e.flag ?? null,
      releasedAt: e.released_at ?? null, _date: (e.released_at ?? e.created_at) as string,
    }))
    // Filtro por serviço publicado (opt-in)
    const { data: svcs } = await admin
      .from('clinic_catalog').select('name, publish_to_portal')
      .eq('clinic_id', (pet as any).clinic_id).eq('item_type', 'exam').eq('is_active', true)
    mapped = filterPublishedExams(mapped, (svcs ?? []) as any)

    // Evolução (analito no tempo)
    trends = buildTrends(mapped.map(m => ({ analyte: m.analyteName, unit: m.unit, value: m.value, date: m._date, flag: m.flag })))

    // Exibição: valor MAIS RECENTE por (painel+analito) — mapped já vem desc por data
    const seen = new Set<string>()
    exams = mapped.filter(m => { const k = `${m.panel}|${m.analyteName}`; if (seen.has(k)) return false; seen.add(k); return true })
      .map(({ _date, ...rest }) => rest)
  }

  // Receitas assinadas pelo MV (via consultas do pet)
  let prescriptions: PortalPrescription[] = []
  if (consIds.length) {
    const { data: rx } = await admin
      .from('prescriptions')
      .select('id, medication, dose, route_of_administration, pharmaceutical_form, is_controlled, vet_signed_at')
      .in('consultation_id', consIds).not('vet_signed_at', 'is', null)
      .order('vet_signed_at', { ascending: false }).limit(100)
    prescriptions = (rx ?? []).map((r: any) => ({
      id: r.id, medication: r.medication, dose: r.dose ?? null,
      route: r.route_of_administration ?? null, form: r.pharmaceutical_form ?? null,
      isControlled: !!r.is_controlled, signedAt: r.vet_signed_at,
    }))
  }

  // Imagem liberada ao tutor (+ link do visualizador público via token do tutor)
  const origin = await getOrigin()
  const { data: studies } = await admin
    .from('imaging_studies')
    .select('id, title, modality, laudo_released_at, created_at, imaging_share_links ( token, audience, revoked_at )')
    .eq('patient_id', petId).not('released_to_tutor_at', 'is', null)
    .order('created_at', { ascending: false })
  const imaging: PortalImaging[] = (studies ?? []).map((s: any) => {
    const tutorLink = (s.imaging_share_links ?? []).find((l: any) => l.audience === 'tutor' && !l.revoked_at)
    return {
      id: s.id, title: s.title ?? null, modality: s.modality ?? null,
      laudoAvailable: !!s.laudo_released_at,
      link: tutorLink ? `${origin}/public/laudo/${tutorLink.token}` : null,
      createdAt: s.created_at,
    }
  })

  // Documentos com PDF
  const { data: docs } = await admin
    .from('patient_documents')
    .select('id, document_name, generated_pdf_path, created_at')
    .eq('patient_id', petId).not('generated_pdf_path', 'is', null)
    .order('created_at', { ascending: false }).limit(50)
  const signed = await Promise.all((docs ?? []).map((d: any) =>
    admin.storage.from('patient-documents').createSignedUrl(d.generated_pdf_path, 3600)))
  const documents: PortalDocument[] = (docs ?? []).map((d: any, i: number) => ({
    id: d.id, name: d.document_name ?? 'Documento',
    url: signed[i]?.data?.signedUrl ?? '', createdAt: d.created_at,
  })).filter((d: PortalDocument) => d.url)

  // Em processamento (coletado / aguardando laudo) — só o estágio, nunca valores
  const processing: PortalProcessing[] = []
  const { data: reqs } = await admin
    .from('exam_requests')
    .select('id, exam_type, status, requested_at')
    .eq('patient_id', petId).in('status', EXAM_PROCESSING_STATUSES as unknown as string[]).is('cancelled_at', null)
    .order('requested_at', { ascending: false }).limit(30)
  for (const r of (reqs ?? [])) processing.push({
    id: (r as any).id, kind: 'exame', title: (r as any).exam_type ?? 'Exame',
    statusLabel: examStatusLabel((r as any).status), requestedAt: (r as any).requested_at ?? null,
  })
  const { data: pend } = await admin
    .from('imaging_studies')
    .select('id, title, modality, status, laudo_released_at, created_at')
    .eq('patient_id', petId).is('released_to_tutor_at', null)
    .order('created_at', { ascending: false }).limit(30)
  for (const s of (pend ?? [])) {
    if ((s as any).status === 'cancelled') continue
    processing.push({
      id: (s as any).id, kind: 'imagem',
      title: (s as any).title || (s as any).modality || 'Exame de imagem',
      statusLabel: imagingStatusLabel((s as any).status, !!(s as any).laudo_released_at),
      requestedAt: (s as any).created_at ?? null,
    })
  }

  // Linha do tempo unificada (merge dos eventos por data, mais recentes primeiro)
  const timeline: PortalTimelineEvent[] = []
  const examDates = new Set<string>()
  for (const c of (cons ?? [])) if ((c as any).created_at) timeline.push({ date: (c as any).created_at, type: 'consulta', title: 'Consulta', subtitle: null })
  for (const e of exams) if (e.releasedAt) examDates.add(e.releasedAt.slice(0, 10))
  for (const d of examDates) timeline.push({ date: d, type: 'exame', title: 'Exames liberados', subtitle: null })
  for (const v of vaccines) timeline.push({ date: v.dateAdministered, type: 'vacina', title: v.vaccineName, subtitle: v.vetName })
  for (const s of imaging) timeline.push({ date: s.createdAt, type: 'imagem', title: s.title || s.modality || 'Exame de imagem', subtitle: s.laudoAvailable ? 'laudo disponível' : null })
  for (const rx of prescriptions) timeline.push({ date: rx.signedAt, type: 'receita', title: rx.medication, subtitle: null })
  for (const dc of documents) timeline.push({ date: dc.createdAt, type: 'documento', title: dc.name, subtitle: null })
  timeline.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return {
    id: (pet as any).id, name: (pet as any).name, species: (pet as any).species ?? null,
    breed: (pet as any).breed ?? null, photoUrl: (pet as any).photo_url ?? null,
    clinicName: clinic?.name ?? 'Clínica', clinicPhone: clinic?.phone ?? null,
    clinicId: (pet as any).clinic_id as string,
    clinicSlug: (clinic?.portal_slug ?? null) as string | null,
    canBook,
    vaccines, exams, imaging, documents, prescriptions,
    trends, timeline: timeline.slice(0, 40), processing,
  }
}
