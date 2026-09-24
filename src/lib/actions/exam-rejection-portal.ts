'use server'

// Resposta do CLIENTE sobre um exame não realizado: recoletar ou não recoletar.
// Duas portas, cada uma com sua sessão própria:
//  • Portal do Parceiro (/parceiro) — clínica parceira / protetor / MV solicitante
//  • Portal do Tutor  (/portal)     — quando o encaminhamento foi do próprio tutor
//
// A autorização é feita AQUI (isolamento por clinic_id + vínculo do pet); a
// regra de negócio mora em @/lib/exams/apply-decision.

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getPartnerContext } from '@/lib/portal/partner-session'
import { getTutorContext } from '@/lib/portal/session'
import { applyExamDecision } from '@/lib/exams/apply-decision'
import type { ExamDecision } from '@/lib/exams/rejection-flow'

export interface PendingExamDecision {
  serviceLineId: string
  petId:         string
  petName:       string
  examName:      string
  reason:        string
  note:          string | null
  rejectedAt:    string
  osNumber:      string | null
}

const FLAG_OFF: PendingExamDecision[] = []

async function flagOn(admin: ReturnType<typeof createAdminClient>, clinicId: string): Promise<boolean> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).maybeSingle()
  return ((data?.flow_config ?? {}) as { usa_fluxo_rejeicao_exame?: boolean }).usa_fluxo_rejeicao_exame === true
}

/**
 * Lê as linhas rejeitadas aguardando decisão dentro de um conjunto de consultas.
 * Isolada por clinic_id — o chamador já restringiu as consultas ao cliente.
 */
async function loadPending(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  consultationIds: string[],
): Promise<PendingExamDecision[]> {
  if (consultationIds.length === 0) return []

  const { data: lines } = await admin
    .from('consultation_services')
    .select('id, consultation_id, name_snapshot, exam_rejected_at, exam_rejection_note, exam_rejection_reason_id')
    .eq('clinic_id', clinicId)
    .in('consultation_id', consultationIds)
    .eq('exam_state', 'rejected')
    .is('cancelled_at', null)
    .order('exam_rejected_at', { ascending: false })
  if (!lines || lines.length === 0) return []

  const reasonIds = [...new Set(lines.map(l => l.exam_rejection_reason_id).filter(Boolean))] as string[]
  const consIds   = [...new Set(lines.map(l => l.consultation_id as string))]

  const [reasonRes, consRes] = await Promise.all([
    reasonIds.length
      ? admin.from('exam_rejection_reasons').select('id, label').in('id', reasonIds)
      : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
    admin.from('consultations')
      .select('id, os_number, patient_id, patients!patient_id ( id, name )')
      .in('id', consIds),
  ])

  const reasonMap = new Map((reasonRes.data ?? []).map(r => [r.id as string, r.label as string]))
  const consMap = new Map<string, { os: string | null; petId: string; petName: string }>()
  for (const c of (consRes.data ?? [])) {
    const raw = (c as { patients?: unknown }).patients
    const pat = (Array.isArray(raw) ? raw[0] : raw) as { id?: string; name?: string } | undefined
    consMap.set(c.id as string, {
      os: (c.os_number as string | null) ?? null,
      petId: pat?.id ?? (c.patient_id as string),
      petName: pat?.name ?? 'Pet',
    })
  }

  return lines.map(l => {
    const c = consMap.get(l.consultation_id as string)
    return {
      serviceLineId: l.id as string,
      petId:      c?.petId ?? '',
      petName:    c?.petName ?? 'Pet',
      examName:   l.name_snapshot as string,
      reason:     l.exam_rejection_reason_id ? (reasonMap.get(l.exam_rejection_reason_id as string) ?? 'Não informado') : 'Não informado',
      note:       (l.exam_rejection_note as string | null) ?? null,
      rejectedAt: (l.exam_rejected_at as string) ?? '',
      osNumber:   c?.os ?? null,
    }
  })
}

// ─── Portal do Parceiro ──────────────────────────────────────────────────────

/** Consultas encaminhadas por este parceiro (admin vê todas; MV vê as suas). */
async function partnerConsultationIds(
  admin: ReturnType<typeof createAdminClient>,
  ctx: NonNullable<Awaited<ReturnType<typeof getPartnerContext>>>,
): Promise<string[]> {
  let q = admin
    .from('consultations')
    .select('id')
    .eq('clinic_id', ctx.clinicId)
    .eq('partner_clinic_id', ctx.partnerClinicId)
  if (ctx.kind === 'professional' && ctx.professionalId) {
    q = q.eq('referring_professional_id', ctx.professionalId)
  }
  const { data } = await q
  return (data ?? []).map(r => r.id as string)
}

export async function getPartnerPendingExamDecisions(): Promise<PendingExamDecision[]> {
  const ctx = await getPartnerContext()
  if (!ctx || ctx.routineOff) return FLAG_OFF
  const admin = createAdminClient()
  if (!await flagOn(admin, ctx.clinicId)) return FLAG_OFF
  return loadPending(admin, ctx.clinicId, await partnerConsultationIds(admin, ctx))
}

export async function submitPartnerExamDecision(
  serviceLineId: string, decision: ExamDecision,
): Promise<{ ok: true; recollect: boolean } | { error: string }> {
  const ctx = await getPartnerContext()
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' }
  if (ctx.routineOff) return { error: 'Portal do Veterinário indisponível para esta clínica.' }
  const admin = createAdminClient()
  if (!await flagOn(admin, ctx.clinicId)) return { error: 'Fluxo indisponível.' }

  // IDOR: a linha precisa pertencer a uma consulta encaminhada por este parceiro.
  const allowed = new Set(await partnerConsultationIds(admin, ctx))
  const { data: line } = await admin
    .from('consultation_services').select('id, consultation_id')
    .eq('id', serviceLineId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!line || !allowed.has(line.consultation_id as string)) return { error: 'Exame não encontrado.' }

  const res = await applyExamDecision({
    admin, clinicId: ctx.clinicId, serviceLineId,
    decision, actorKind: 'partner', actorLabel: ctx.name,
  })
  if ('error' in res) return res

  revalidatePath('/parceiro')
  return { ok: true, recollect: decision === 'recollect' }
}

// ─── Portal do Tutor ─────────────────────────────────────────────────────────

/**
 * Consultas do tutor SEM encaminhamento por parceira — nesses casos a decisão
 * é dele. Quando houve encaminhamento, quem decide é a clínica parceira / MV.
 */
async function tutorConsultationIds(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string, tutorId: string,
): Promise<string[]> {
  const { data: pets } = await admin
    .from('patients').select('id').eq('clinic_id', clinicId).eq('tutor_id', tutorId)
  const petIds = (pets ?? []).map(p => p.id as string)
  if (petIds.length === 0) return []
  const { data } = await admin
    .from('consultations').select('id, partner_clinic_id')
    .eq('clinic_id', clinicId).in('patient_id', petIds)
  return (data ?? []).filter(c => !c.partner_clinic_id).map(c => c.id as string)
}

export async function getTutorPendingExamDecisions(): Promise<PendingExamDecision[]> {
  const ctx = await getTutorContext()
  if (!ctx) return FLAG_OFF
  const admin = createAdminClient()
  const out: PendingExamDecision[] = []
  for (const link of ctx.links) {
    if (!await flagOn(admin, link.clinic_id)) continue
    out.push(...await loadPending(admin, link.clinic_id, await tutorConsultationIds(admin, link.clinic_id, link.tutor_id)))
  }
  return out
}

export async function submitTutorExamDecision(
  serviceLineId: string, decision: ExamDecision,
): Promise<{ ok: true; recollect: boolean } | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' }
  const admin = createAdminClient()

  for (const link of ctx.links) {
    if (!await flagOn(admin, link.clinic_id)) continue
    const allowed = new Set(await tutorConsultationIds(admin, link.clinic_id, link.tutor_id))
    const { data: line } = await admin
      .from('consultation_services').select('id, consultation_id')
      .eq('id', serviceLineId).eq('clinic_id', link.clinic_id).maybeSingle()
    if (!line || !allowed.has(line.consultation_id as string)) continue

    const res = await applyExamDecision({
      admin, clinicId: link.clinic_id, serviceLineId,
      decision, actorKind: 'tutor', actorLabel: ctx.fullName ?? 'Tutor',
    })
    if ('error' in res) return res
    revalidatePath('/portal')
    return { ok: true, recollect: decision === 'recollect' }
  }
  return { error: 'Exame não encontrado.' }
}
