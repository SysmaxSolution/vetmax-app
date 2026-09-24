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
import { computeLabCost } from '@/lib/labs/commission'
import {
  planLabCostOnRejection,
  planBilledExamReversal,
  lineBilledAmount,
  type InvoiceSnapshot,
  type LabPayable,
} from '@/lib/exams/rejection-money'

// ─── Contexto + gate da flag ─────────────────────────────────────────────────

interface Ctx {
  admin:   ReturnType<typeof createAdminClient>
  clinicId: string
  userId:  string
  role:    string
  flagOn:  boolean
  clinicName: string
  /** flow_config.cancela_custo_lab_na_recusa — item 6 da Tarefa 0. */
  cancelaCustoLab: boolean
  /** flow_config.estorna_exame_faturado_na_recusa — item 7 da Tarefa 0. */
  estornaFaturado: boolean
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

  const flow = (clinic?.flow_config ?? {}) as {
    usa_fluxo_rejeicao_exame?: boolean
    cancela_custo_lab_na_recusa?: boolean
    estorna_exame_faturado_na_recusa?: boolean
  }
  return {
    admin,
    clinicId: profile.clinic_id as string,
    userId: user.id,
    role: (profile.role as string) ?? 'staff',
    flagOn: flow.usa_fluxo_rejeicao_exame === true,
    clinicName: (clinic?.name as string) ?? 'Laboratório',
    cancelaCustoLab: flow.cancela_custo_lab_na_recusa === true,
    estornaFaturado: flow.estorna_exame_faturado_na_recusa === true,
  }
}

const FLAG_OFF = 'O Fluxo de Rejeição de Exame não está ativado para esta clínica.'

/** TRUE quando a clínica do usuário logado usa o fluxo (gate de UI). */
export async function isExamRejectionFlowOn(): Promise<boolean> {
  const ctx = await getCtx()
  return 'error' in ctx ? false : ctx.flagOn
}

/**
 * TRUE quando a clínica ativou o estorno automático de exame já faturado
 * (flow_config.estorna_exame_faturado_na_recusa). Gate de UI: sem isso o botão
 * "Não realizado" continua escondido nas linhas já faturadas, como hoje.
 */
export async function isBilledReversalOn(): Promise<boolean> {
  const ctx = await getCtx()
  return 'error' in ctx ? false : (ctx.flagOn && ctx.estornaFaturado)
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

// ─── Caminho do dinheiro na rejeição (itens 6 e 7 da Tarefa 0) ──────────────

type LineRow = NonNullable<Awaited<ReturnType<typeof loadLine>>>

/**
 * Monta o plano de estorno da linha já faturada. Não escreve nada — só lê a
 * fatura e delega a decisão ao módulo puro `planBilledExamReversal`.
 */
async function prepareBilledReversal(ctx: Ctx, invoiceId: string, line: LineRow) {
  const { data: inv } = await ctx.admin
    .from('invoices')
    .select('id, status, subtotal, discount, total_amount, paid_at')
    .eq('id', invoiceId).eq('clinic_id', ctx.clinicId).maybeSingle()

  const amount = lineBilledAmount(line.price_snapshot as number | null, line.quantity as number | null)
  const plan = planBilledExamReversal(ctx.estornaFaturado, (inv as InvoiceSnapshot | null) ?? null, amount)
  return { invoiceId, amount, plan }
}

/**
 * Executa o estorno planejado na fatura EM ABERTO: remove o item correspondente,
 * baixa subtotal/total, solta a linha do vínculo de faturamento e ajusta a
 * pendência do caixa. Devolve o resumo para a trilha de auditoria.
 */
async function applyBilledReversal(
  ctx: Ctx,
  reversal: NonNullable<Awaited<ReturnType<typeof prepareBilledReversal>>>,
  line: LineRow,
): Promise<string> {
  const { invoiceId, amount, plan } = reversal
  const now = new Date().toISOString()

  // Item da fatura correspondente a esta linha (casa descrição + valor).
  const { data: items } = await ctx.admin
    .from('invoice_items')
    .select('id, description, total_price')
    .eq('invoice_id', invoiceId)
  const match = (items ?? []).find(
    (it) => it.description === line.name_snapshot && Math.abs(Number(it.total_price) - amount) < 0.005,
  )
  if (match) await ctx.admin.from('invoice_items').delete().eq('id', match.id)

  await ctx.admin.from('invoices')
    .update({ subtotal: plan.newSubtotal, total_amount: plan.newTotal, updated_at: now })
    .eq('id', invoiceId).eq('clinic_id', ctx.clinicId)

  // A linha deixa de estar faturada — volta a ser um serviço em aberto travado.
  await ctx.admin.from('consultation_services')
    .update({ billed_in_invoice_id: null, updated_at: now })
    .eq('id', line.id).eq('clinic_id', ctx.clinicId)

  // Pendência do caixa (ainda não paga) acompanha o novo valor.
  const { data: pend } = await ctx.admin
    .from('central_cashier')
    .select('id, amount, status')
    .eq('clinic_id', ctx.clinicId).eq('source_id', invoiceId).eq('status', 'pending')
  for (const p of (pend ?? [])) {
    const next = Math.round(Math.max(0, Number(p.amount) - amount) * 100) / 100
    if (next <= 0) await ctx.admin.from('central_cashier').delete().eq('id', p.id)
    else await ctx.admin.from('central_cashier').update({ amount: next }).eq('id', p.id)
  }

  await logAudit({
    action: 'EXAM_BILLING_REVERSED',
    entity_type: 'invoices',
    entity_id: invoiceId,
    details: {
      service_line_id: line.id, exam: line.name_snapshot,
      valor_estornado: amount,
      total_anterior: plan.newTotal + amount,
      total_novo: plan.newTotal,
      item_removido: match?.id ?? null,
      fatura_zerada: plan.clearsInvoice,
      autor: ctx.userId,
      origem: 'rejeicao_de_exame',
    },
  })
  return plan.message
}

/**
 * Item 6 — ajusta (ou não) o contas a PAGAR do laboratório parceiro quando a
 * linha volta rejeitada. Quem decide é `flow_config.cancela_custo_lab_na_recusa`.
 */
async function adjustPartnerLabCost(ctx: Ctx, line: LineRow): Promise<string> {
  const consultationId = line.consultation_id as string

  const { data: cons } = await ctx.admin
    .from('consultations')
    .select('id, lab_partner_clinic_id')
    .eq('id', consultationId).eq('clinic_id', ctx.clinicId).maybeSingle()
  const partnerId = (cons as { lab_partner_clinic_id?: string | null } | null)?.lab_partner_clinic_id
  if (!partnerId) {
    return ctx.cancelaCustoLab ? 'Sem laboratório parceiro neste atendimento — nada a ajustar.' : 'não aplicável'
  }

  const [{ data: rules }, { data: payables }] = await Promise.all([
    ctx.admin.from('partner_clinic_commissions')
      .select('item_id, item_type, commission_type, value')
      .eq('clinic_id', ctx.clinicId).eq('partner_clinic_id', partnerId).eq('is_active', true),
    ctx.admin.from('financial_entries')
      .select('id, amount, status')
      .eq('clinic_id', ctx.clinicId).eq('consultation_id', consultationId)
      .eq('type', 'payable').eq('category', 'Laboratório')
      .order('created_at', { ascending: false }).limit(1),
  ])

  const rejectedCost = computeLabCost(
    [{ stock_item_id: line.stock_item_id as string | null, price_snapshot: Number(line.price_snapshot ?? 0), quantity: Number(line.quantity ?? 1) }],
    (rules ?? []) as { item_id?: string | null; item_type?: string | null; commission_type: string; value: number }[],
  )
  const payable = ((payables ?? [])[0] as LabPayable | undefined) ?? null
  const plan = planLabCostOnRejection(ctx.cancelaCustoLab, payable, rejectedCost)

  if (plan.action === 'reduce' || plan.action === 'cancel') {
    const now = new Date().toISOString()
    if (plan.action === 'cancel') {
      await ctx.admin.from('financial_entries')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', payable!.id).eq('clinic_id', ctx.clinicId)
    } else {
      await ctx.admin.from('financial_entries')
        .update({ amount: plan.newAmount, updated_at: now })
        .eq('id', payable!.id).eq('clinic_id', ctx.clinicId)
    }
    await logAudit({
      action: 'EXAM_LAB_COST_ADJUSTED',
      entity_type: 'financial_entries',
      entity_id: payable!.id,
      details: {
        service_line_id: line.id, exam: line.name_snapshot,
        acao: plan.action, valor_anterior: payable!.amount, valor_novo: plan.newAmount,
        custo_do_exame: rejectedCost, autor: ctx.userId, origem: 'rejeicao_de_exame',
      },
    })
  }
  return plan.reason
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

  // ── Item 7 da Tarefa 0: exame JÁ FATURADO ──────────────────────────────────
  // Com `estorna_exame_faturado_na_recusa` DESLIGADA (padrão) o comportamento é
  // o atual: recusa + orientação. Ligada, o sistema estorna a fatura EM ABERTO
  // e registra trilha. Fatura paga/baixada é recusada de qualquer forma.
  let reversal: Awaited<ReturnType<typeof prepareBilledReversal>> = null
  if (line.billed_in_invoice_id) {
    reversal = await prepareBilledReversal(ctx, line.billed_in_invoice_id as string, line)
    if (reversal.plan.action === 'refuse') {
      await logAudit({
        action: 'EXAM_REJECT_BLOCKED_BILLED',
        entity_type: 'consultations',
        entity_id: line.consultation_id as string,
        details: {
          service_line_id: line.id, exam: line.name_snapshot,
          invoice_id: line.billed_in_invoice_id,
          auto_reversal_enabled: ctx.estornaFaturado,
          motivo: reversal.plan.message,
        },
      })
      return { error: reversal.plan.message }
    }
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

  // Item 7 — estorno da fatura em aberto (só quando a clínica ativou).
  let reversalApplied: string | null = null
  if (reversal && reversal.plan.action === 'reverse') {
    reversalApplied = await applyBilledReversal(ctx, reversal, line)
  }

  // Item 6 — custo do laboratório parceiro deixa de ser devido (configurável).
  const labAdjust = await adjustPartnerLabCost(ctx, line)

  await logAudit({
    action: 'EXAM_REJECTED',
    entity_type: 'consultations',
    entity_id: line.consultation_id as string,
    details: {
      service_line_id: line.id, exam: line.name_snapshot,
      reason_id: reason.id, reason: reason.label, note: input.note?.trim() || null,
      rejected_by: ctx.userId,
      faturamento_estornado: reversalApplied,
      custo_laboratorio: labAdjust,
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
