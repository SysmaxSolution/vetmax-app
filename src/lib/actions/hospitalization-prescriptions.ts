'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { consumeStockForApplication, type StockConsumptionResult } from '@/lib/actions/stock-consumption'
import { formatClinicTime } from '@/lib/time'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PrescriptionStatus = 'active' | 'paused' | 'finished'

/**
 * Prescrição de internação com a última administração já resolvida.
 * Forma consumida pelo useMedicationScheduler (cálculo de next_dose_at é
 * client-side: lastAppliedAt ?? startedAt + frequencyHours).
 */
export interface HospPrescription {
  id:                 string
  hospitalization_id: string
  medication_name:    string
  dose:               string | null
  route:              string | null
  frequency_hours:    number | null
  started_at:         string                 // ISO
  duration_hours:     number | null
  status:             PrescriptionStatus
  notes:              string | null
  prescribed_by:      string | null
  created_at:         string
  /** ISO da última administração (vem de hospitalization_dose_administrations). */
  last_applied_at:    string | null
  /** Número de doses já aplicadas (auditoria rápida). */
  doses_applied:      number
  /** Vínculo com stock_items — quando preenchido, applyDose baixa estoque. */
  stock_item_id:      string | null
  /** Unidades consumidas do estoque por dose aplicada. */
  quantity_per_dose:  number | null
}

export interface CreatePrescriptionPayload {
  hospitalization_id: string
  medication_name:    string
  dose?:              string | null
  route?:             string | null
  /** Vem do dropdown — 4/6/8/12/24, ou null para dose única (SOS). */
  frequency_hours?:   number | null
  duration_hours?:    number | null
  /** Quando começa o ciclo. Default = now() (banco). */
  started_at?:        string | null
  notes?:             string | null
  /** Vínculo opcional com stock_items para baixa automática. */
  stock_item_id?:     string | null
  /** Quantidade do estoque consumida por dose (obrigatório quando stock_item_id setado). */
  quantity_per_dose?: number | null
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getClinicCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * Lista prescrições da clínica com last_applied_at já resolvido.
 *
 * - Filtro por `hospitalizationId` opcional. Sem ele, retorna TODAS as
 *   prescrições active+paused de internações abertas (o Kanban precisa disso).
 * - Sempre filtra status != 'finished'.
 */
export async function listHospitalizationPrescriptions(
  hospitalizationId?: string,
): Promise<HospPrescription[] | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  let query = admin
    .from('hospitalization_prescriptions')
    .select(`
      id, hospitalization_id, medication_name, dose, route,
      frequency_hours, started_at, duration_hours, status, notes,
      prescribed_by, created_at, stock_item_id, quantity_per_dose,
      administrations:hospitalization_dose_administrations ( applied_at )
    `)
    .eq('clinic_id', ctx.clinicId)
    .neq('status', 'finished')
    .order('created_at', { ascending: false })

  if (hospitalizationId) {
    query = query.eq('hospitalization_id', hospitalizationId)
  } else {
    // Lista global (alimenta o agendador/alertas do Kanban): exclui prescrições de
    // internações já encerradas (alta/cancelamento). Sem isto, os alertas de
    // medicação persistiam mesmo após o pet receber alta.
    const { data: activeHosps } = await admin
      .from('hospitalizations')
      .select('id')
      .eq('clinic_id', ctx.clinicId)
      .not('status', 'in', '("discharged","cancelled")')
    const ids = (activeHosps ?? []).map(h => h.id as string)
    if (ids.length === 0) return []
    query = query.in('hospitalization_id', ids)
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  // Resolve last_applied_at + doses_applied no Node (uma query, dado o LEFT JOIN
  // implícito do Supabase nested select).
  return (data ?? []).map((row): HospPrescription => {
    const admins = ((row as { administrations?: { applied_at: string }[] }).administrations) ?? []
    let lastApplied: string | null = null
    for (const a of admins) {
      if (!lastApplied || a.applied_at > lastApplied) lastApplied = a.applied_at
    }
    return {
      id:                 row.id as string,
      hospitalization_id: row.hospitalization_id as string,
      medication_name:    row.medication_name as string,
      dose:               (row.dose  as string | null) ?? null,
      route:              (row.route as string | null) ?? null,
      frequency_hours:    row.frequency_hours === null ? null : Number(row.frequency_hours),
      started_at:         row.started_at as string,
      duration_hours:     row.duration_hours === null ? null : Number(row.duration_hours),
      status:             row.status as PrescriptionStatus,
      notes:              (row.notes as string | null) ?? null,
      prescribed_by:      (row.prescribed_by as string | null) ?? null,
      created_at:         row.created_at as string,
      last_applied_at:    lastApplied,
      doses_applied:      admins.length,
      stock_item_id:      (row.stock_item_id as string | null) ?? null,
      quantity_per_dose:  row.quantity_per_dose === null ? null : Number(row.quantity_per_dose),
    }
  })
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createHospitalizationPrescription(
  payload: CreatePrescriptionPayload,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  if (!payload.hospitalization_id)        return { error: 'hospitalization_id é obrigatório.' }
  if (!payload.medication_name?.trim())   return { error: 'Nome da medicação é obrigatório.' }
  if (payload.frequency_hours !== null && payload.frequency_hours !== undefined && payload.frequency_hours <= 0) {
    return { error: 'frequency_hours deve ser positivo ou null (dose única).' }
  }

  // Coerência: stock_item_id setado exige quantity_per_dose > 0.
  if (payload.stock_item_id && !(payload.quantity_per_dose && payload.quantity_per_dose > 0)) {
    return { error: 'Quando há item de estoque vinculado, informe a quantidade consumida por dose.' }
  }

  if (payload.started_at && Number.isNaN(Date.parse(payload.started_at))) {
    return { error: 'Horário de início do tratamento inválido.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_prescriptions')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: payload.hospitalization_id,
      medication_name:    payload.medication_name.trim(),
      dose:               payload.dose?.trim() || null,
      route:              payload.route?.trim() || null,
      frequency_hours:    payload.frequency_hours ?? null,
      duration_hours:     payload.duration_hours  ?? null,
      started_at:         payload.started_at || new Date().toISOString(),
      notes:              payload.notes?.trim() || null,
      prescribed_by:      ctx.userId,
      status:             'active',
      stock_item_id:      payload.stock_item_id     ?? null,
      quantity_per_dose:  payload.quantity_per_dose ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar prescrição: ' + error.message }
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
}

// ─── Apply dose (registrar administração) ────────────────────────────────────

export interface ApplyDoseOptions {
  /** Quando a dose foi aplicada. Default = now(). */
  applied_at?:    string
  /** Quando ESTAVA programada — preencher se a aplicação foi registrada atrasada. */
  scheduled_for?: string
  notes?:         string
}

export interface ApplyDoseResult {
  id:    string
  /** Resultado da baixa de estoque — null quando a prescrição não tem vínculo. */
  stock: StockConsumptionResult | { error: string } | null
}

export async function applyHospitalizationDose(
  prescriptionId: string,
  opts: ApplyDoseOptions = {},
): Promise<ApplyDoseResult | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Resolve hospitalization_id da prescription (sem confiar no client) e
  // confere clinic_id (RLS já protege, mas defesa em profundidade).
  const { data: presc } = await admin
    .from('hospitalization_prescriptions')
    .select('hospitalization_id, status, clinic_id, medication_name, dose, route, stock_item_id, quantity_per_dose')
    .eq('id', prescriptionId)
    .eq('clinic_id', ctx.clinicId)
    .single()

  if (!presc) return { error: 'Prescrição não encontrada.' }
  if (presc.status === 'finished') {
    return { error: 'Prescrição já finalizada — não é possível registrar nova dose.' }
  }

  // Lançamento retroativo: aceita applied_at custom, mas nunca no futuro
  // (tolerância de 5min para clock skew entre navegador e servidor).
  if (opts.applied_at) {
    const t = Date.parse(opts.applied_at)
    if (Number.isNaN(t)) return { error: 'Horário de aplicação inválido.' }
    if (t > Date.now() + 5 * 60_000) {
      return { error: 'O horário de aplicação não pode estar no futuro.' }
    }
  }

  const { data, error } = await admin
    .from('hospitalization_dose_administrations')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: presc.hospitalization_id as string,
      prescription_id:    prescriptionId,
      applied_at:         opts.applied_at    ?? new Date().toISOString(),
      scheduled_for:      opts.scheduled_for ?? null,
      applied_by:         ctx.userId,
      notes:              opts.notes?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao registrar dose: ' + error.message }
  const administrationId = data.id as string

  // ── Baixa automática de estoque (Bloco 3) ───────────────────────────────
  // Só dispara quando o vet vinculou um stock_item E definiu quantity_per_dose.
  // Princípio: a dose JÁ foi persistida acima — qualquer falha aqui retorna
  // como `stock: { error }` e a UI mostra toast de erro sem reverter a dose.
  let stock: StockConsumptionResult | { error: string } | null = null
  const qty = presc.quantity_per_dose === null ? null : Number(presc.quantity_per_dose)
  if (presc.stock_item_id && qty && qty > 0) {
    const consumption = await consumeStockForApplication({
      stock_item_id:   presc.stock_item_id as string,
      medication_name: (presc.medication_name as string) ?? 'Medicação',
      quantity:        qty,
      source:          'HOSPITALIZATION',
      reference_id:    administrationId,
      notes:           opts.notes?.trim() || null,
    })
    stock = consumption
  }

  // ── Timeline de Plantão à prova de erros (Internação Completa) ───────────
  // Quando a flag flow_config.internacao_completa está ativa, cada dose
  // confirmada injeta um log IMUTÁVEL na Linha do Tempo (hospitalization_records)
  // — remédio, dose, via, hora e usuário logado. A UI não oferece editar/excluir
  // esses registros. Flag off → comportamento atual (só dose_administrations).
  const { data: clinicRow } = await admin
    .from('clinics')
    .select('flow_config')
    .eq('id', ctx.clinicId)
    .single()
  const internacaoCompleta = (clinicRow?.flow_config as { internacao_completa?: boolean } | null)?.internacao_completa === true

  if (internacaoCompleta) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', ctx.userId)
      .single()
    const userName  = profile?.full_name ?? 'Enfermagem'
    const appliedAt = opts.applied_at ?? new Date().toISOString()
    // IMPORTANTE: usa o helper formatClinicTime para garantir o horário NO
    // timezone da clínica. Sem o helper, Node em UTC no Vercel renderizaria
    // 3h adiantado (ex.: "20:36" no log vs "17:36" no card cliente).
    const hora      = formatClinicTime(appliedAt)
    const medName   = (presc.medication_name as string) ?? 'Medicação'
    const doseTxt   = (presc.dose  as string | null) ?? ''
    const routeTxt  = (presc.route as string | null) ?? ''
    const detalhe   = [doseTxt, routeTxt].filter(Boolean).join(' • ')

    await admin.from('hospitalization_records').insert({
      hospitalization_id: presc.hospitalization_id as string,
      clinic_id:          ctx.clinicId,
      user_id:            ctx.userId,
      user_name:          userName,
      notes:              `💉 Dose administrada às ${hora} por ${userName}.${opts.applied_at ? ' (registro retroativo)' : ''}`,
      medications:        [{ name: medName, dose: doseTxt, route: routeTxt, notes: detalhe }],
      improvement_level:  'estavel',
    })

    // Conta da Internação (Regra 4): lança a medicação aplicada como item da
    // conta. Valor = unit_price do estoque × quantidade consumida (0 se sem
    // vínculo de estoque/preço). Itemiza a medicação para faturamento.
    let chargeAmount = 0
    if (presc.stock_item_id) {
      const { data: stk } = await admin
        .from('stock_items')
        .select('unit_price')
        .eq('id', presc.stock_item_id as string)
        .single()
      const unitPrice = Number(stk?.unit_price ?? 0)
      chargeAmount = unitPrice * (qty && qty > 0 ? qty : 1)
    }
    await admin.from('hospitalization_charges').insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: presc.hospitalization_id as string,
      kind:               'medication',
      description:        [medName, detalhe].filter(Boolean).join(' — '),
      quantity:           1,
      unit_amount:        chargeAmount,
      amount:             chargeAmount,
      status:             'open',
      source_ref:         administrationId,
      created_by:         ctx.userId,
    })
  }

  revalidatePath('/dashboard/hospitalization')
  return { id: administrationId, stock }
}

// ─── Update status (pausar/finalizar) ────────────────────────────────────────

export async function updateHospitalizationPrescriptionStatus(
  id: string,
  status: PrescriptionStatus,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_prescriptions')
    .update({ status })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}
