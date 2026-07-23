'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// M9 — aba "Programações" da recepção.
// Lista as vacinas com próxima dose definida (next_due_date), separando
// ATRASADAS (vencidas) das PROGRAMADAS (futuras), com pet + tutor.
// Workflow por item (0417): pending → contacted (tutor avisado) | dismissed
// (descartada da fila), com ação individual ou em massa por período.

export type VaccineScheduleStatus = 'pending' | 'contacted' | 'dismissed'

export interface VaccinationScheduleItem {
  id:           string
  vaccine_name: string
  next_due_date: string
  patient_id:   string
  patient_name: string
  species:      string | null
  tutor_id:     string | null
  tutor_name:   string | null
  tutor_phone:  string | null
  overdue:      boolean
  schedule_status: VaccineScheduleStatus
  schedule_status_at: string | null
}

export interface VaccinationSchedule {
  overdue:   VaccinationScheduleItem[]  // pending + contacted, vencidas
  upcoming:  VaccinationScheduleItem[]  // pending + contacted, futuras
  dismissed: VaccinationScheduleItem[]  // descartadas (restauráveis)
}

async function requireClinicId(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

export async function getVaccinationSchedule(): Promise<VaccinationSchedule | { error: string }> {
  const ctx = await requireClinicId()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('patient_vaccines')
    .select(`
      id, vaccine_name, next_due_date, schedule_status, schedule_status_at,
      patient:patients!inner ( id, name, species, deleted_at,
        tutor:tutors ( id, name, phone ) )
    `)
    .eq('clinic_id', ctx.clinicId)
    .not('next_due_date', 'is', null)
    .order('next_due_date', { ascending: true })

  if (error) return { error: 'Erro ao buscar programações: ' + error.message }

  const today = new Date().toISOString().split('T')[0]
  const overdue: VaccinationScheduleItem[]   = []
  const upcoming: VaccinationScheduleItem[]  = []
  const dismissed: VaccinationScheduleItem[] = []

  const one = (v: unknown): Record<string, unknown> | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as Record<string, unknown> | null)

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const patient = one(row.patient)
    if (!patient || patient.deleted_at) continue            // pet arquivado some
    // tutors não tem soft-delete (deleted_at) — pedir a coluna derrubava a
    // query inteira (42703) e a aba ficava vazia para TODAS as clínicas.
    const tutorActive = one(patient.tutor)

    const nextDue = row.next_due_date as string
    const status  = (row.schedule_status as VaccineScheduleStatus | null) ?? 'pending'
    const item: VaccinationScheduleItem = {
      id:           row.id as string,
      vaccine_name: row.vaccine_name as string,
      next_due_date: nextDue,
      patient_id:   patient.id as string,
      patient_name: patient.name as string,
      species:      (patient.species as string | null) ?? null,
      tutor_id:     (tutorActive?.id as string | null) ?? null,
      tutor_name:   (tutorActive?.name as string | null) ?? null,
      tutor_phone:  (tutorActive?.phone as string | null) ?? null,
      overdue:      nextDue < today,
      schedule_status: status,
      schedule_status_at: (row.schedule_status_at as string | null) ?? null,
    }
    if (status === 'dismissed') dismissed.push(item)
    else if (item.overdue) overdue.push(item)
    else upcoming.push(item)
  }

  return { overdue, upcoming, dismissed }
}

/** Atualiza o status de workflow de 1..N programações de vacina da clínica.
 *  Serve tanto a ação individual quanto a seleção em massa por período. */
export async function setVaccineScheduleStatus(
  ids: string[],
  status: VaccineScheduleStatus,
): Promise<{ ok: true; updated: number } | { error: string }> {
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'Nenhuma vacina selecionada.' }
  if (ids.length > 2000) return { error: 'Seleção grande demais (máx. 2000).' }
  if (!['pending', 'contacted', 'dismissed'].includes(status)) return { error: 'Status inválido.' }

  const ctx = await requireClinicId()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('patient_vaccines')
    .update({
      schedule_status: status,
      schedule_status_at: status === 'pending' ? null : new Date().toISOString(),
      schedule_status_by: status === 'pending' ? null : ctx.userId,
    })
    .in('id', ids)
    .eq('clinic_id', ctx.clinicId)   // isolamento: nunca toca vacina de outra clínica
    .select('id')

  if (error) return { error: 'Erro ao atualizar: ' + error.message }
  return { ok: true, updated: (data ?? []).length }
}
