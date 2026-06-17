'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ChargeKind = 'daily' | 'medication' | 'kit' | 'procedure' | 'exam' | 'other'
export type ChargeStatus = 'open' | 'transferred' | 'paid' | 'void'

export interface HospCharge {
  id:          string
  kind:        ChargeKind
  description: string
  quantity:    number
  unit_amount: number
  amount:      number
  status:      ChargeStatus
  charged_at:  string
}

export interface HospAccount {
  charges:    HospCharge[]
  /** Saldo em ABERTO (status=open). Alta Administrativa só com balance <= 0. */
  balance:    number
  /** Já liquidado/transferido (paid + transferred). */
  settled:    number
  /** Total geral (exceto void). */
  total:      number
}

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
    .select('id, kind, description, quantity, unit_amount, amount, status, charged_at')
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .neq('status', 'void')
    .order('charged_at', { ascending: false })

  if (error) return { error: error.message }

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
  return { charges, balance, settled, total }
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

  if (error) return { error: error.message }
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

  if (error) return { error: 'Erro ao lançar item: ' + error.message }
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
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Liquidação / transferência para o PDV ───────────────────────────────────

/**
 * Zera o saldo em aberto: marca as linhas 'open' como 'transferred' (lançadas
 * no PDV/caixa principal) ou 'paid' (liquidadas direto). Habilita a Alta
 * Administrativa.
 *
 * Cria entrada em central_cashier para que o valor apareça no caixa:
 *   pdv  → status='pending'  (recepção recebe o pagamento no balcão)
 *   paid → status='recorded' (já pago na beira do leito, só registra)
 */
export async function settleHospitalizationAccount(
  hospitalizationId: string,
  method: 'pdv' | 'paid' = 'pdv',
): Promise<{ success: true; settled_count: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // 1. Marca as linhas abertas e captura os valores para somar
  const { data, error } = await admin
    .from('hospitalization_charges')
    .update({ status: method === 'pdv' ? 'transferred' : 'paid' })
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .eq('status', 'open')
    .select('id, amount')

  if (error) return { error: 'Erro ao liquidar conta: ' + error.message }

  const settled = data ?? []
  const totalAmount = settled.reduce((sum, r) => sum + Number(r.amount ?? 0), 0)

  // 2. Cria entrada no caixa central apenas se há valor e ainda não existe
  //    entrada para esta internação (idempotência)
  if (totalAmount > 0) {
    const { data: existing } = await admin
      .from('central_cashier')
      .select('id')
      .eq('clinic_id', ctx.clinicId)
      .eq('source_module', 'hospitalization')
      .eq('source_id', hospitalizationId)
      .maybeSingle()

    if (!existing) {
      // Busca nome do pet e tutor para exibição no caixa
      const { data: hosp } = await admin
        .from('hospitalizations')
        .select('patients ( name, tutors ( name ) )')
        .eq('id', hospitalizationId)
        .eq('clinic_id', ctx.clinicId)
        .single()

      const patientName = (hosp?.patients as any)?.name ?? null
      const tutorName   = (hosp?.patients as any)?.tutors?.name ?? null

      await admin.from('central_cashier').insert({
        clinic_id:    ctx.clinicId,
        source_module: 'hospitalization',
        source_id:    hospitalizationId,
        amount:       totalAmount,
        status:       method === 'pdv' ? 'pending' : 'recorded',
        reason:       `Internação — ${patientName ?? 'Paciente'}`,
        patient_name: patientName,
        tutor_name:   tutorName,
        recorded_by:  ctx.userId,
      })
    }
  }

  await logAudit({ action: 'HOSP_SETTLE_ACCOUNT', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: { method, count: settled.length, amount: totalAmount } })
  revalidatePath('/dashboard/hospitalization')
  revalidatePath('/dashboard/cashier')
  return { success: true, settled_count: settled.length }
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

  if (error) return { error: 'Erro ao dar alta médica: ' + error.message }

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
