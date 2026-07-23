'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// M9 — aba "Programações" da recepção.
// Lista as vacinas com próxima dose definida (next_due_date), separando
// ATRASADAS (vencidas) das PROGRAMADAS (futuras), com pet + tutor.

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
}

export interface VaccinationSchedule {
  overdue:  VaccinationScheduleItem[]
  upcoming: VaccinationScheduleItem[]
}

export async function getVaccinationSchedule(): Promise<VaccinationSchedule | { error: string }> {
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

  const { data, error } = await admin
    .from('patient_vaccines')
    .select(`
      id, vaccine_name, next_due_date,
      patient:patients!inner ( id, name, species, deleted_at,
        tutor:tutors ( id, name, phone ) )
    `)
    .eq('clinic_id', profile.clinic_id)
    .not('next_due_date', 'is', null)
    .order('next_due_date', { ascending: true })

  if (error) return { error: 'Erro ao buscar programações: ' + error.message }

  const today = new Date().toISOString().split('T')[0]
  const overdue: VaccinationScheduleItem[]  = []
  const upcoming: VaccinationScheduleItem[] = []

  const one = (v: unknown): Record<string, unknown> | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as Record<string, unknown> | null)

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const patient = one(row.patient)
    if (!patient || patient.deleted_at) continue            // pet arquivado some
    // tutors não tem soft-delete (deleted_at) — pedir a coluna derrubava a
    // query inteira (42703) e a aba ficava vazia para TODAS as clínicas.
    const tutorActive = one(patient.tutor)

    const nextDue = row.next_due_date as string
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
    }
    if (item.overdue) overdue.push(item)
    else upcoming.push(item)
  }

  return { overdue, upcoming }
}
