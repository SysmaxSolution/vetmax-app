'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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
      prescribed_by, created_at,
      administrations:hospitalization_dose_administrations ( applied_at )
    `)
    .eq('clinic_id', ctx.clinicId)
    .neq('status', 'finished')
    .order('created_at', { ascending: false })

  if (hospitalizationId) query = query.eq('hospitalization_id', hospitalizationId)

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

export async function applyHospitalizationDose(
  prescriptionId: string,
  opts: ApplyDoseOptions = {},
): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Resolve hospitalization_id da prescription (sem confiar no client) e
  // confere clinic_id (RLS já protege, mas defesa em profundidade).
  const { data: presc } = await admin
    .from('hospitalization_prescriptions')
    .select('hospitalization_id, status, clinic_id')
    .eq('id', prescriptionId)
    .eq('clinic_id', ctx.clinicId)
    .single()

  if (!presc) return { error: 'Prescrição não encontrada.' }
  if (presc.status === 'finished') {
    return { error: 'Prescrição já finalizada — não é possível registrar nova dose.' }
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
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
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
