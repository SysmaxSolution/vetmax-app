'use server'

// Fluxo de Rejeição de Exame — ações da EQUIPE (laboratório + gestão).
// Tudo gateado por clinics.flow_config.usa_fluxo_rejeicao_exame: com a flag
// desligada nenhuma destas ações escreve coluna nova e nada muda no fluxo atual.
//
// NÃO re-exportar tipos aqui (Turbopack/Next 16 quebra as actions da rota):
// os tipos compartilhados vivem em @/lib/exams/rejection-flow.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { logAudit } from './audit'
import {
  nextExamState,
  resolveRejectionRecipients,
  DEFAULT_REJECTION_REASONS,
  type ExamState,
  type ExamDecision,
} from '@/lib/exams/rejection-flow'
import { applyExamDecision } from '@/lib/exams/apply-decision'
import { notifyExamRejection } from '@/lib/exams/rejection-notify'

// ─── Contexto + gate da flag ─────────────────────────────────────────────────

interface Ctx {
  admin:   ReturnType<typeof createAdminClient>
  clinicId: string
  userId:  string
  role:    string
  flagOn:  boolean
  clinicName: string
}

async function getCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics').select('name, flow_config').eq('id', profile.clinic_id).single()

  const flow = (clinic?.flow_config ?? {}) as { usa_fluxo_rejeicao_exame?: boolean }
  return {
    admin,
    clinicId: profile.clinic_id as string,
    userId: user.id,
    role: (profile.role as string) ?? 'staff',
    flagOn: flow.usa_fluxo_rejeicao_exame === true,
    clinicName: (clinic?.name as string) ?? 'Laboratório',
  }
}

const FLAG_OFF = 'O Fluxo de Rejeição de Exame não está ativado para esta clínica.'

/** TRUE quando a clínica do usuário logado usa o fluxo (gate de UI). */
export async function isExamRejectionFlowOn(): Promise<boolean> {
  const ctx = await getCtx()
  return 'error' in ctx ? false : ctx.flagOn
}

// ─── Catálogo de motivos ─────────────────────────────────────────────────────

export interface RejectionReason {
  id: string; code: string; label: string
  description: string | null; sort_order: number; is_active: boolean
}

export async function listRejectionReasons(
  includeInactive = false,
): Promise<RejectionReason[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  let q = ctx.admin
    .from('exam_rejection_reasons')
    .select('id, code, label, description, sort_order, is_active')
    .eq('clinic_id', ctx.clinicId)
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q.order('sort_order', { ascending: true }).order('label', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []) as RejectionReason[]
}

export async function saveRejectionReason(input: {
  id?: string; code?: string; label: string
  description?: string | null; sort_order?: number; is_active?: boolean
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager', 'vet'].includes(ctx.role)) {
    return { error: 'Sem permissão para editar o catálogo de motivos.' }
  }
  const label = input.label?.trim()
  if (!label) return { error: 'Informe o motivo.' }

  // Código estável derivado do rótulo quando não informado (slug simples).
  const code = (input.code?.trim() || label)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'motivo'

  if (input.id) {
    const { error } = await ctx.admin
      .from('exam_rejection_reasons')
      .update({
        label, description: input.description?.trim() || null,
        sort_order: input.sort_order ?? 0, is_active: input.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id).eq('clinic_id', ctx.clinicId)
    if (error) return { error: error.message }
    revalidatePath('/dashboard/management')
    return { id: input.id }
  }

  const { data, error } = await ctx.admin
    .from('exam_rejection_reasons')
    .insert({
      clinic_id: ctx.clinicId, code, label,
      description: input.description?.trim() || null,
      sort_order: input.sort_order ?? 0, is_active: input.is_active ?? true,
    })
    .select('id').single()
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um motivo com este código.' }
    return { error: error.message }
  }
  revalidatePath('/dashboard/management')
  return { id: data.id as string }
}

export async function deleteRejectionReason(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão.' }
  // Desativa em vez de apagar: exames antigos apontam para o motivo (auditoria).
  const { error } = await ctx.admin
    .from('exam_rejection_reasons')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

/**
 * Semeia os motivos comuns de rejeição de amostra. Idempotente (ON CONFLICT por
 * clinic_id+code é tratado com upsert). A lista definitiva da clínica continua
 * sendo editável pela UI — este é só o ponto de partida.
 */
export async function seedDefaultRejectionReasons(): Promise<{ inserted: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão.' }

  const { data: existing } = await ctx.admin
    .from('exam_rejection_reasons').select('code').eq('clinic_id', ctx.clinicId)
  const have = new Set((existing ?? []).map(r => r.code as string))

  const rows = DEFAULT_REJECTION_REASONS
    .filter(r => !have.has(r.code))
    .map((r, i) => ({
      clinic_id: ctx.clinicId, code: r.code, label: r.label,
      description: r.description, sort_order: i * 10, is_active: true,
    }))
  if (rows.length === 0) return { inserted: 0 }

  const { error } = await ctx.admin.from('exam_rejection_reasons').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { inserted: rows.length }
}

// ─── Linhas de exame da OS ───────────────────────────────────────────────────

export interface ExamLine {
  id:              string
  name:            string
  quantity:        number
  price:           number
  exam_state:      ExamState | null
  rejected_at:     string | null
  rejected_by_name: string | null
  reason_label:    string | null
  rejection_note:  string | null
  client_decision: ExamDecision | null
  decided_at:      string | null
  decided_by_label: string | null
  attempt_no:      number | null
  recollect_of_id: string | null
  billing_on_hold: boolean
  billed:          boolean
}

/**
 * Linhas de EXAME da OS (stock_items.category='exam'), com o estado do fluxo.
 * Com a flag desligada devolve lista vazia — a UI nem aparece.
 */
export async function listExamLines(consultationId: string): Promise<ExamLine[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ctx.flagOn) return []

  const { data, error } = await ctx.admin
    .from('consultation_services')
    .select(`id, name_snapshot, quantity, price_snapshot, billed_in_invoice_id,
             exam_state, exam_rejected_at, exam_rejected_by, exam_rejection_note,
             exam_rejection_reason_id, exam_client_decision, exam_decided_at,
             exam_decided_by_label, exam_attempt_no, exam_recollect_of_id,
             exam_billing_hold_at, stock_items ( category )`)
    .eq('clinic_id', ctx.clinicId)
    .eq('consultation_id', consultationId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message }

  const rows = (data ?? []).filter(r => {
    const si = (r as { stock_items?: { category?: string } | Array<{ category?: string }> }).stock_items
    const cat = Array.isArray(si) ? si[0]?.category : si?.category
    return cat === 'exam'
  })
  if (rows.length === 0) return []

  // Rótulos de motivo e nomes de quem rejeitou (2 lookups, sem SELECT *).
  const reasonIds = [...new Set(rows.map(r => r.exam_rejection_reason_id).filter(Boolean))] as string[]
  const userIds   = [...new Set(rows.map(r => r.exam_rejected_by).filter(Boolean))] as string[]
  const [reasons, users] = await Promise.all([
    reasonIds.length
      ? ctx.admin.from('exam_rejection_reasons').select('id, label').in('id', reasonIds)
      : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
    userIds.length
      ? ctx.admin.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ])
  const reasonMap = new Map((reasons.data ?? []).map(r => [r.id as string, r.label as string]))
  const userMap   = new Map((users.data ?? []).map(u => [u.id as string, (u.full_name as string | null) ?? null]))

  return rows.map(r => ({
    id:               r.id as string,
    name:             r.name_snapshot as string,
    quantity:         Number(r.quantity ?? 1),
    price:            Number(r.price_snapshot ?? 0),
    exam_state:       (r.exam_state as ExamState | null) ?? null,
    rejected_at:      (r.exam_rejected_at as string | null) ?? null,
    rejected_by_name: r.exam_rejected_by ? (userMap.get(r.exam_rejected_by as string) ?? null) : null,
    reason_label:     r.exam_rejection_reason_id ? (reasonMap.get(r.exam_rejection_reason_id as string) ?? null) : null,
    rejection_note:   (r.exam_rejection_note as string | null) ?? null,
    client_decision:  (r.exam_client_decision as ExamDecision | null) ?? null,
    decided_at:       (r.exam_decided_at as string | null) ?? null,
    decided_by_label: (r.exam_decided_by_label as string | null) ?? null,
    attempt_no:       r.exam_attempt_no === null ? null : Number(r.exam_attempt_no),
    recollect_of_id:  (r.exam_recollect_of_id as string | null) ?? null,
    billing_on_hold:  r.exam_billing_hold_at !== null,
    billed:           r.billed_in_invoice_id !== null,
  }))
}

// ─── Rejeitar / marcar realizado ─────────────────────────────────────────────

async function loadLine(ctx: Ctx, serviceLineId: string) {
  const { data } = await ctx.admin
    .from('consultation_services')
    .select('id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, company_id, exam_state, exam_attempt_no, billed_in_invoice_id, exam_billing_hold_at')
    .eq('id', serviceLineId).eq('clinic_id', ctx.clinicId).maybeSingle()
  return data
}

/**
 * O laboratório marca o exame como NÃO REALIZADO, com motivo obrigatório.
 * Efeitos: estado 'rejected', trava de cobrança, notificação automática de quem
 * encaminhou (+ tutor) e trilha de auditoria.
 */
export async function rejectExamLine(input: {
  serviceLineId: string
  reasonId:      string
  note?:         string | null
}): Promise<{ ok: true; notified: number; unreachable: string[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ctx.flagOn) return { error: FLAG_OFF }
  if (!input.reasonId) return { error: 'Selecione o motivo da não realização.' }

  const line = await loadLine(ctx, input.serviceLineId)
  if (!line) return { error: 'Exame não encontrado.' }
  if (line.billed_in_invoice_id) {
    return { error: 'Este exame já foi faturado. Faça o estorno no Financeiro antes de marcar como não realizado.' }
  }

  const step = nextExamState((line.exam_state as ExamState | null) ?? null, { type: 'reject' })
  if (!step.ok) return { error: step.error }

  const { data: reason } = await ctx.admin
    .from('exam_rejection_reasons').select('id, label')
    .eq('id', input.reasonId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!reason) return { error: 'Motivo inválido.' }

  const now = new Date().toISOString()
  const { error } = await ctx.admin
    .from('consultation_services')
    .update({
      exam_state:               step.state,
      exam_rejected_at:         now,
      exam_rejected_by:         ctx.userId,
      exam_rejection_reason_id: reason.id,
      exam_rejection_note:      input.note?.trim() || null,
      exam_billing_hold_at:     now,   // sai da cobrança na mesma operação
      updated_at:               now,
    })
    .eq('id', line.id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao registrar a não realização: ' + error.message }

  await logAudit({
    action: 'EXAM_REJECTED',
    entity_type: 'consultations',
    entity_id: line.consultation_id as string,
    details: {
      service_line_id: line.id, exam: line.name_snapshot,
      reason_id: reason.id, reason: reason.label, note: input.note?.trim() || null,
    },
  })

  const outcome = await notifyRejection(ctx, line.consultation_id as string, {
    examName: line.name_snapshot as string, reason: reason.label as string, note: input.note ?? null,
  })
  if (outcome.notified > 0) {
    await ctx.admin.from('consultation_services')
      .update({ exam_notified_at: new Date().toISOString() })
      .eq('id', line.id).eq('clinic_id', ctx.clinicId)
  }

  revalidatePath(`/dashboard/exams/${line.consultation_id}`)
  revalidatePath('/dashboard/exams')
  return { ok: true, notified: outcome.notified, unreachable: outcome.unreachable }
}

/** O laboratório confirma que o exame FOI realizado — libera a cobrança. */
export async function markExamPerformed(
  serviceLineId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ctx.flagOn) return { error: FLAG_OFF }

  const line = await loadLine(ctx, serviceLineId)
  if (!line) return { error: 'Exame não encontrado.' }

  const step = nextExamState((line.exam_state as ExamState | null) ?? null, { type: 'perform' })
  if (!step.ok) return { error: step.error }

  const now = new Date().toISOString()
  const { error } = await ctx.admin
    .from('consultation_services')
    .update({ exam_state: step.state, exam_billing_hold_at: null, updated_at: now })
    .eq('id', line.id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }

  await logAudit({
    action: 'EXAM_PERFORMED', entity_type: 'consultations',
    entity_id: line.consultation_id as string,
    details: { service_line_id: line.id, exam: line.name_snapshot },
  })
  revalidatePath(`/dashboard/exams/${line.consultation_id}`)
  return { ok: true }
}

// ─── Decisão do cliente (recoletar / não recoletar) ──────────────────────────

/** Decisão registrada pela EQUIPE (o cliente respondeu por WhatsApp/telefone). */
export async function recordExamDecisionByStaff(input: {
  serviceLineId:   string
  decision:        ExamDecision
  respondentName?: string | null
  returnDeadline?: string | null
}): Promise<{ ok: true; newLineId: string | null } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ctx.flagOn) return { error: FLAG_OFF }

  const res = await applyExamDecision({
    admin: ctx.admin, clinicId: ctx.clinicId, serviceLineId: input.serviceLineId,
    decision: input.decision, actorKind: 'staff',
    actorLabel: input.respondentName?.trim() || 'Equipe do laboratório',
    returnDeadline: input.returnDeadline ?? null,
  })
  if ('error' in res) return res

  await logAudit({
    action: 'EXAM_DECISION', entity_type: 'consultation_services',
    entity_id: input.serviceLineId,
    details: { decision: input.decision, by: 'staff', respondent: input.respondentName ?? null },
  })
  revalidatePath(`/dashboard/exams/${res.consultationId}`)
  revalidatePath('/dashboard/exams')
  return { ok: true, newLineId: res.newLineId }
}

// ─── Notificação ─────────────────────────────────────────────────────────────

async function notifyRejection(
  ctx: Ctx, consultationId: string,
  info: { examName: string; reason: string; note: string | null },
): Promise<{ notified: number; unreachable: string[] }> {
  try {
    const { data: cons } = await ctx.admin
      .from('consultations')
      .select('id, partner_clinic_id, referring_professional_id, patients!patient_id ( id, name, tutor_id )')
      .eq('id', consultationId).maybeSingle()
    if (!cons) return { notified: 0, unreachable: [] }

    const patRaw = (cons as { patients?: unknown }).patients
    const pat = (Array.isArray(patRaw) ? patRaw[0] : patRaw) as { name?: string; tutor_id?: string } | undefined

    const [partnerRes, profRes, tutorRes] = await Promise.all([
      cons.partner_clinic_id
        ? ctx.admin.from('partner_clinics').select('id, name, phone, email').eq('id', cons.partner_clinic_id).maybeSingle()
        : Promise.resolve({ data: null }),
      cons.referring_professional_id
        ? ctx.admin.from('partner_clinic_professionals').select('id, name, phone, email').eq('id', cons.referring_professional_id).maybeSingle()
        : Promise.resolve({ data: null }),
      pat?.tutor_id
        ? ctx.admin.from('tutors').select('id, name, phone').eq('id', pat.tutor_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const recipients = resolveRejectionRecipients({
      partner: partnerRes.data as { id: string; name: string; phone?: string | null; email?: string | null } | null,
      referringProfessional: profRes.data as { id: string; name: string; phone?: string | null; email?: string | null } | null,
      tutor: tutorRes.data as { id: string; name: string | null; phone?: string | null } | null,
    })
    if (recipients.length === 0) return { notified: 0, unreachable: [] }

    let origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
    try {
      const h = await headers()
      const host = h.get('x-forwarded-host') ?? h.get('host')
      if (host) origin = `${h.get('x-forwarded-proto') ?? 'https'}://${host}`
    } catch { /* fora de request */ }

    const outcome = await notifyExamRejection({
      clinicId: ctx.clinicId, clinicName: ctx.clinicName,
      petName: pat?.name ?? 'o pet', examName: info.examName,
      reason: info.reason, note: info.note,
      partnerLink: `${origin}/parceiro`,
    }, recipients)

    return { notified: outcome.sent.length, unreachable: outcome.failed.map(f => f.name) }
  } catch {
    return { notified: 0, unreachable: [] }
  }
}

// ─── Relatório de exames não realizados / refeitos ───────────────────────────

export interface RejectionReportRow {
  service_line_id: string
  consultation_id: string
  os_number:       string | null
  date:            string
  pet_name:        string
  client_name:     string          // clínica parceira / protetor, ou o tutor
  client_kind:     'partner' | 'tutor'
  exam_name:       string
  amount:          number          // valor que NÃO foi cobrado
  reason:          string
  note:            string | null
  state:           ExamState
  decision:        ExamDecision | null
  decided_by:      string | null
  attempt_no:      number
  redone:          boolean         // houve recoleta gerada a partir desta linha
}

export interface RejectionReportSummary {
  total_rejected:   number
  total_redone:     number
  total_closed:     number
  total_amount_not_charged: number
  by_reason:        Array<{ reason: string; count: number; amount: number }>
  by_client:        Array<{ client: string; count: number; amount: number }>
}

export async function getExamRejectionReport(params: {
  from: string; to: string; partnerClinicId?: string | null
}): Promise<{ rows: RejectionReportRow[]; summary: RejectionReportSummary } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ctx.flagOn) return { error: FLAG_OFF }

  const fromIso = `${params.from}T00:00:00.000Z`
  const toIso   = `${params.to}T23:59:59.999Z`

  const { data, error } = await ctx.admin
    .from('consultation_services')
    .select(`id, consultation_id, name_snapshot, price_snapshot, quantity,
             exam_state, exam_rejected_at, exam_rejection_note, exam_rejection_reason_id,
             exam_client_decision, exam_decided_by_label, exam_attempt_no, exam_recollect_of_id`)
    .eq('clinic_id', ctx.clinicId)
    .not('exam_rejected_at', 'is', null)
    .gte('exam_rejected_at', fromIso)
    .lte('exam_rejected_at', toIso)
    .order('exam_rejected_at', { ascending: false })
  if (error) return { error: error.message }

  const lines = data ?? []
  if (lines.length === 0) {
    return { rows: [], summary: { total_rejected: 0, total_redone: 0, total_closed: 0, total_amount_not_charged: 0, by_reason: [], by_client: [] } }
  }

  const consultIds = [...new Set(lines.map(l => l.consultation_id as string))]
  const reasonIds  = [...new Set(lines.map(l => l.exam_rejection_reason_id).filter(Boolean))] as string[]
  const lineIds    = lines.map(l => l.id as string)

  const [consRes, reasonRes, recollectRes] = await Promise.all([
    ctx.admin.from('consultations')
      .select('id, os_number, created_at, partner_clinic_id, patients!patient_id ( name, tutors!tutor_id ( name ) ), partner_clinics!partner_clinic_id ( name )')
      .in('id', consultIds),
    reasonIds.length
      ? ctx.admin.from('exam_rejection_reasons').select('id, label').in('id', reasonIds)
      : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
    ctx.admin.from('consultation_services')
      .select('exam_recollect_of_id').in('exam_recollect_of_id', lineIds),
  ])

  const reasonMap = new Map((reasonRes.data ?? []).map(r => [r.id as string, r.label as string]))
  const redone    = new Set((recollectRes.data ?? []).map(r => r.exam_recollect_of_id as string))
  const consMap   = new Map<string, { os: string | null; date: string; pet: string; client: string; kind: 'partner' | 'tutor' }>()
  for (const c of (consRes.data ?? [])) {
    const patRaw = (c as { patients?: unknown }).patients
    const pat = (Array.isArray(patRaw) ? patRaw[0] : patRaw) as { name?: string; tutors?: unknown } | undefined
    const tutRaw = pat?.tutors
    const tut = (Array.isArray(tutRaw) ? tutRaw[0] : tutRaw) as { name?: string } | undefined
    const pcRaw = (c as { partner_clinics?: unknown }).partner_clinics
    const pc = (Array.isArray(pcRaw) ? pcRaw[0] : pcRaw) as { name?: string } | undefined
    consMap.set(c.id as string, {
      os: (c.os_number as string | null) ?? null,
      date: c.created_at as string,
      pet: pat?.name ?? '—',
      client: pc?.name ?? tut?.name ?? '—',
      kind: pc?.name ? 'partner' : 'tutor',
    })
  }

  const filterPartner = params.partnerClinicId?.trim() || null
  const partnerNameById = new Map<string, string>()
  for (const c of (consRes.data ?? [])) {
    if (c.partner_clinic_id) partnerNameById.set(c.id as string, c.partner_clinic_id as string)
  }

  const rows: RejectionReportRow[] = []
  for (const l of lines) {
    const cid = l.consultation_id as string
    if (filterPartner && partnerNameById.get(cid) !== filterPartner) continue
    const c = consMap.get(cid)
    rows.push({
      service_line_id: l.id as string,
      consultation_id: cid,
      os_number:  c?.os ?? null,
      date:       (l.exam_rejected_at as string) ?? c?.date ?? '',
      pet_name:   c?.pet ?? '—',
      client_name: c?.client ?? '—',
      client_kind: c?.kind ?? 'tutor',
      exam_name:  l.name_snapshot as string,
      amount:     Number(l.price_snapshot ?? 0) * Number(l.quantity ?? 1),
      reason:     l.exam_rejection_reason_id ? (reasonMap.get(l.exam_rejection_reason_id as string) ?? '—') : '—',
      note:       (l.exam_rejection_note as string | null) ?? null,
      state:      (l.exam_state as ExamState) ?? 'rejected',
      decision:   (l.exam_client_decision as ExamDecision | null) ?? null,
      decided_by: (l.exam_decided_by_label as string | null) ?? null,
      attempt_no: Number(l.exam_attempt_no ?? 1),
      redone:     redone.has(l.id as string),
    })
  }

  const byReason = new Map<string, { count: number; amount: number }>()
  const byClient = new Map<string, { count: number; amount: number }>()
  let amount = 0, closed = 0, redoneCount = 0
  for (const r of rows) {
    amount += r.amount
    if (r.state === 'closed_no_recollect') closed++
    if (r.redone) redoneCount++
    const a = byReason.get(r.reason) ?? { count: 0, amount: 0 }
    byReason.set(r.reason, { count: a.count + 1, amount: a.amount + r.amount })
    const b = byClient.get(r.client_name) ?? { count: 0, amount: 0 }
    byClient.set(r.client_name, { count: b.count + 1, amount: b.amount + r.amount })
  }

  return {
    rows,
    summary: {
      total_rejected: rows.length,
      total_redone:   redoneCount,
      total_closed:   closed,
      total_amount_not_charged: amount,
      by_reason: [...byReason.entries()].map(([reason, v]) => ({ reason, ...v })).sort((x, y) => y.count - x.count),
      by_client: [...byClient.entries()].map(([client, v]) => ({ client, ...v })).sort((x, y) => y.count - x.count),
    },
  }
}
