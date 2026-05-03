'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'arrived'

export interface AppointmentItem {
  id: string
  pet_id: string
  tutor_id: string
  appointment_datetime: string
  reason: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  patient: { id: string; name: string; species: string; breed: string | null }
  tutor:   { id: string; name: string; phone: string }
}

export interface CreateAppointmentPayload {
  pet_id:               string
  tutor_id:             string
  appointment_datetime: string   // 'YYYY-MM-DDTHH:MM:00' — naive local time
  reason:               string
  notes?:               string
}

export interface UpcomingAppointment {
  id:                   string
  appointment_datetime: string
  reason:               string
  status:               AppointmentStatus
  notes:                string | null
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserClinic(): Promise<{ clinicId: string; userId: string } | { error: string }> {
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

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createAppointment(
  payload: CreateAppointmentPayload
): Promise<{ success: true } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { error } = await supabase.from('appointments').insert({
    clinic_id:            auth.clinicId,
    pet_id:               payload.pet_id,
    tutor_id:             payload.tutor_id,
    appointment_datetime: payload.appointment_datetime,
    reason:               payload.reason,
    notes:                payload.notes ?? null,
    status:               'scheduled',
    created_by:           auth.userId,
  })

  if (error) return { error: 'Erro ao criar agendamento: ' + error.message }
  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/reception/calendar')
  return { success: true }
}

// ─── List for a specific date ─────────────────────────────────────────────────

export async function getAppointmentsForDate(
  date: string  // 'YYYY-MM-DD'
): Promise<AppointmentItem[] | { error: string }> {
  try {
    const auth = await getUserClinic()
    if ('error' in auth) return auth

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('appointments')
      .select('id, pet_id, tutor_id, appointment_datetime, reason, status, notes, created_at')
      .eq('clinic_id', auth.clinicId)
      .gte('appointment_datetime', `${date}T00:00:00`)
      .lte('appointment_datetime', `${date}T23:59:59`)
      .neq('status', 'cancelled')
      .order('appointment_datetime', { ascending: true })

    if (error) return { error: error.message }
    if (!data?.length) return []

    const petIds   = [...new Set(data.map(a => a.pet_id))]
    const tutorIds = [...new Set(data.map(a => a.tutor_id))]

    const [petsRes, tutorsRes] = await Promise.all([
      supabase.from('patients').select('id, name, species, breed').eq('clinic_id', auth.clinicId).in('id', petIds),
      supabase.from('tutors').select('id, name, phone').eq('clinic_id', auth.clinicId).in('id', tutorIds),
    ])

    const petsMap:   Record<string, { id: string; name: string; species: string; breed: string | null }> = {}
    const tutorsMap: Record<string, { id: string; name: string; phone: string }> = {}
    for (const p of petsRes.data   ?? []) petsMap[p.id]   = p
    for (const t of tutorsRes.data ?? []) tutorsMap[t.id] = t

    return data.map(a => ({
      ...a,
      patient: petsMap[a.pet_id]     ?? { id: a.pet_id,   name: '—', species: 'dog', breed: null },
      tutor:   tutorsMap[a.tutor_id] ?? { id: a.tutor_id, name: '—', phone: '' },
    }))
  } catch (err) {
    console.error('[getAppointmentsForDate]', err)
    return { error: 'Erro ao buscar agendamentos.' }
  }
}

// ─── Month counts (calendar dots) ─────────────────────────────────────────────

export async function getMonthAppointmentCounts(
  year: number,
  month: number  // 1-12
): Promise<Record<string, number> | { error: string }> {
  try {
    const auth = await getUserClinic()
    if ('error' in auth) return auth

    const supabase = await createClient()
    const mp  = String(month).padStart(2, '0')
    const ny  = month === 12 ? year + 1 : year
    const nm  = month === 12 ? 1 : month + 1
    const nmp = String(nm).padStart(2, '0')

    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_datetime')
      .eq('clinic_id', auth.clinicId)
      .gte('appointment_datetime', `${year}-${mp}-01T00:00:00`)
      .lt('appointment_datetime',  `${ny}-${nmp}-01T00:00:00`)
      .neq('status', 'cancelled')

    if (error) return { error: error.message }

    const counts: Record<string, number> = {}
    for (const a of data ?? []) {
      const day = a.appointment_datetime.substring(0, 10)
      counts[day] = (counts[day] ?? 0) + 1
    }
    return counts
  } catch {
    return { error: 'Erro ao buscar contagens do mês.' }
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelAppointment(
  appointmentId: string
): Promise<{ success: true } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/reception/calendar')
  return { success: true }
}

// ─── Confirm Arrival → creates consultation in reception queue ─────────────────

export async function confirmArrival(
  appointmentId: string
): Promise<{ success: true; petName: string } | { error: string }> {
  try {
    const auth = await getUserClinic()
    if ('error' in auth) return auth

    const supabase = await createClient()

    // 1. Fetch appointment
    const { data: appt, error: aErr } = await supabase
      .from('appointments')
      .select('id, pet_id, tutor_id, reason, status')
      .eq('id', appointmentId)
      .eq('clinic_id', auth.clinicId)
      .single()

    if (aErr || !appt)             return { error: 'Agendamento não encontrado.' }
    if (appt.status === 'arrived') return { error: 'Chegada já confirmada.' }
    if (appt.status === 'cancelled') return { error: 'Agendamento cancelado.' }

    // 2. Pet name for success message (scoped to clinic for multi-tenant safety)
    const { data: pet } = await supabase
      .from('patients').select('name').eq('id', appt.pet_id).eq('clinic_id', auth.clinicId).single()

    // 3. Mark arrived
    await supabase
      .from('appointments')
      .update({ status: 'arrived' })
      .eq('id', appointmentId)

    // 4. Create consultation in reception queue
    const { error: cErr } = await supabase
      .from('consultations')
      .insert({
        clinic_id:      auth.clinicId,
        patient_id:     appt.pet_id,
        visit_reason:   appt.reason,
        payment_status: 'pending',
        status:         'reception',
      })

    if (cErr) return { error: 'Chegada marcada, mas erro ao criar consulta: ' + cErr.message }

    revalidatePath('/dashboard/reception')
    revalidatePath('/dashboard/reception/calendar')
    return { success: true, petName: pet?.name ?? 'Pet' }
  } catch (err) {
    console.error('[confirmArrival]', err)
    return { error: 'Erro interno ao confirmar chegada.' }
  }
}

// ─── Upcoming appointments for pet feed ───────────────────────────────────────

export async function getPetUpcomingAppointments(
  petId: string,
  clinicId: string
): Promise<UpcomingAppointment[]> {
  try {
    const supabase = await createClient()
    const todayStr = new Date().toISOString().substring(0, 10)

    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_datetime, reason, status, notes')
      .eq('pet_id', petId)
      .eq('clinic_id', clinicId)
      .gte('appointment_datetime', `${todayStr}T00:00:00`)
      .in('status', ['scheduled', 'confirmed'])
      .order('appointment_datetime', { ascending: true })
      .limit(5)

    return data ?? []
  } catch {
    return []
  }
}
