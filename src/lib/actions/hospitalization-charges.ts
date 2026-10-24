'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

import { mensagemErro } from '@/lib/errors'
import type { ChargeKind, ChargeStatus, HospCharge, HospAccount } from '@/types/hospitalization-charges'
// ─── Tipos ───────────────────────────────────────────────────────────────────

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── Diária: garante a diária do dia ao abrir a conta ────────────────────────

/** Lança a diária do dia para a internação (idempotente; respeita status ativo). */
export async function ensureDailyCharge(hospitalizationId: string): Promise<void> {
  const ctx = await getCtx()
  if ('error' in ctx) return
  const admin = createAdminClient()
  await admin.rpc('rpc_accrue_hospitalization_dailies', { p_hospitalization_id: hospitalizationId })
}

// ─── Conta + saldo ────────────────────────────────────────────────────────────

export async function getHospitalizationAccount(hospitalizationId: string): Promise<HospAccount | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  // Garante a diária do dia antes de exibir (mantém a conta sempre atual).
  await ensureDailyCharge(hospitalizationId)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_charges')
    .select('id, kind, description, quantity, unit_amount, amount, status, charged_at, central_cashier_id')
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .neq('status', 'void')
    .order('charged_at', { ascending: false })

  if (error) return { error: mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }

  const charges = (data ?? []).map((r): HospCharge => ({
    id:          r.id as string,
    kind:        r.kind as ChargeKind,
    description: r.description as string,
    quantity:    Number(r.quantity ?? 1),
    unit_amount: Number(r.unit_amount ?? 0),
    amount:      Number(r.amount ?? 0),
    status:      r.status as ChargeStatus,
    charged_at:  r.charged_at as string,
  }))

  let balance = 0, settled = 0, total = 0
  for (const c of charges) {
    total += c.amount
    if (c.status === 'open') balance += c.amount
    else settled += c.amount
  }

  // O que já foi ao caixa mas o tutor ainda não pagou: lotes parciais (0521)
  // cujo lançamento no caixa central continua pendente.
  let awaiting_cashier = 0
  const lotes = Array.from(new Set((data ?? []).map(r => r.central_cashier_id as string | null).filter((x): x is string => !!x)))
  if (lotes.length) {
    const { data: cc } = await admin.from('central_cashier').select('id, status').in('id', lotes)
    const pendentes = new Set(((cc ?? []) as { id: string; status: string }[]).filter(r => r.status === 'pending').map(r => r.id))
    for (const r of data ?? []) {
      if (r.status === 'transferred' && r.central_cashier_id && pendentes.has(r.central_cashier_id as string)) awaiting_cashier += Number(r.amount ?? 0)
    }
  }
  return { charges, balance, settled, total, awaiting_cashier }
}

/** Saldos em aberto por internação (Kanban: gate da Alta Administrativa). */
export async function getOpenBalances(hospitalizationIds: string[]): Promise<Record<string, number> | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (hospitalizationIds.length === 0) return {}

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_charges')
    .select('hospitalization_id, amount')
    .eq('clinic_id', ctx.clinicId)
    .eq('status', 'open')
    .in('hospitalization_id', hospitalizationIds)

  if (error) return { error: mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }
  const map: Record<string, number> = {}
  for (const id of hospitalizationIds) map[id] = 0
  for (const r of data ?? []) {
    const id = r.hospitalization_id as string
    map[id] = (map[id] ?? 0) + Number(r.amount ?? 0)
  }
  return map
}

// ─── Lançamento manual (procedimentos / exames / outros) ─────────────────────

export async function addManualCharge(payload: {
  hospitalization_id: string
  kind?:        ChargeKind
  description:  string
  quantity?:    number
  unit_amount:  number
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.hospitalization_id)      return { error: 'hospitalization_id é obrigatório.' }
  if (!payload.description?.trim())     return { error: 'Descrição é obrigatória.' }
  const qty  = payload.quantity && payload.quantity > 0 ? payload.quantity : 1
  const unit = Number(payload.unit_amount)
  if (!Number.isFinite(unit) || unit < 0) return { error: 'Valor unitário inválido.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_charges')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: payload.hospitalization_id,
      kind:               payload.kind ?? 'other',
      description:        payload.description.trim(),
      quantity:           qty,
      unit_amount:        unit,
      amount:             unit * qty,
      status:             'open',
      created_by:         ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao lançar item: ' + mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
}

export async function voidCharge(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_charges')
    .update({ status: 'void' })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Liquidação / transferência para o PDV ───────────────────────────────────

/**
 * Envia ao caixa o que está EM ABERTO na conta — e só isso.
 *
 * `pdv`: cada chamada cria um lançamento próprio no caixa central para o lote
 * de linhas abertas naquele momento (0521: a linha guarda em qual lançamento
 * foi). A conta continua recebendo itens; o próximo envio leva só o que
 * entrou depois. É assim que o tutor paga por etapas e, no fim, só o saldo.
 *
 * `paid`: marca as linhas abertas como pagas sem passar pelo caixa (quitação
 * registrada por fora).
 */
export async function settleHospitalizationAccount(
  hospitalizationId: string,
  method: 'pdv' | 'paid' = 'pdv',
): Promise<{ success: true; settled_count: number; amount: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // 1. O que está em aberto AGORA — é o lote deste envio.
  const { data: abertas, error: lerErr } = await admin
    .from('hospitalization_charges')
    .select('id, amount')
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .eq('status', 'open')
  if (lerErr) return { error: 'Erro ao ler a conta: ' + mensagemErro(lerErr, 'lib/actions/hospitalization-charges.ts') }

  const lote = abertas ?? []
  const totalAmount = lote.reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
  if (!lote.length) return { error: 'Não há nada em aberto para enviar.' }
  const ids = lote.map(r => r.id as string)

  if (method === 'paid') {
    const { error } = await admin.from('hospitalization_charges')
      .update({ status: 'paid' }).in('id', ids).eq('clinic_id', ctx.clinicId)
    if (error) return { error: 'Erro ao liquidar conta: ' + mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }
    await logAudit({ action: 'HOSP_SETTLE_ACCOUNT', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: { method, count: ids.length, amount: totalAmount } })
    revalidatePath('/dashboard/hospitalization')
    return { success: true, settled_count: ids.length, amount: totalAmount }
  }

  // 2. Lançamento do caixa para ESTE lote (nunca reaproveita o anterior: o
  //    anterior é de outro valor, de outro momento, talvez já recebido).
  const { data: hosp } = await admin
    .from('hospitalizations')
    .select('patients ( name, tutors ( name ) )')
    .eq('id', hospitalizationId)
    .eq('clinic_id', ctx.clinicId)
    .single()
  const patientName = (hosp?.patients as any)?.name ?? null
  const tutorName   = (hosp?.patients as any)?.tutors?.name ?? null

  const { count: enviosAnteriores } = await admin.from('central_cashier')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinicId).eq('source_module', 'hospitalization').eq('source_id', hospitalizationId)
  const numeroDoLote = (enviosAnteriores ?? 0) + 1

  const { data: cc, error: ccErr } = await admin.from('central_cashier').insert({
    clinic_id:     ctx.clinicId,
    source_module: 'hospitalization',
    source_id:     hospitalizationId,
    amount:        totalAmount,
    status:        'pending',
    reason:        `Internação — ${patientName ?? 'Paciente'}${numeroDoLote > 1 ? ` (parcial ${numeroDoLote})` : ''}`,
    patient_name:  patientName,
    tutor_name:    tutorName,
    recorded_by:   ctx.userId,
  }).select('id').single()
  if (ccErr || !cc) return { error: 'Erro ao enviar ao caixa: ' + (ccErr ? mensagemErro(ccErr, 'lib/actions/hospitalization-charges.ts') : '') }

  // 3. As linhas do lote apontam para o lançamento que as levou ao caixa.
  const { error } = await admin.from('hospitalization_charges')
    .update({ status: 'transferred', central_cashier_id: cc.id })
    .in('id', ids).eq('clinic_id', ctx.clinicId).eq('status', 'open')
  if (error) {
    await admin.from('central_cashier').delete().eq('id', cc.id)
    return { error: 'Erro ao enviar ao caixa: ' + mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }
  }

  await logAudit({ action: 'HOSP_SETTLE_ACCOUNT', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: { method, count: ids.length, amount: totalAmount, central_cashier_id: cc.id, lote: numeroDoLote } })
  revalidatePath('/dashboard/hospitalization')
  revalidatePath('/dashboard/cashier')
  return { success: true, settled_count: ids.length, amount: totalAmount }
}

// ─── Alta Médica (status → ready_for_discharge) ──────────────────────────────

/**
 * Alta Médica: cessa o acúmulo de diárias (RPC ignora ready_for_discharge) e o
 * aprazamento de novas medicações (o Kanban filtra ready_for_discharge do alarme).
 * O paciente permanece no Kanban até a Alta Administrativa.
 */
export async function giveMedicalDischarge(hospitalizationId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('hospitalizations')
    .select('status')
    .eq('id', hospitalizationId)
    .eq('clinic_id', ctx.clinicId)
    .single()

  if (!current) return { error: 'Internação não encontrada.' }
  if (current.status === 'discharged') return { error: 'Internação já encerrada.' }

  const { error } = await admin
    .from('hospitalizations')
    .update({ status: 'ready_for_discharge', updated_at: new Date().toISOString() })
    .eq('id', hospitalizationId)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Erro ao dar alta médica: ' + mensagemErro(error, 'lib/actions/hospitalization-charges.ts') }

  await admin.from('hospitalization_records').insert({
    hospitalization_id: hospitalizationId,
    clinic_id:          ctx.clinicId,
    user_id:            ctx.userId,
    user_name:          'Alta Médica',
    notes:              '🏥 Alta médica concedida — cessam diárias e aprazamento. Aguardando alta administrativa (liquidação da conta).',
    improvement_level:  'melhorou',
  })

  await logAudit({ action: 'HOSP_MEDICAL_DISCHARGE', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: {} })
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}
