'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  professional_id?:     string
  duration_minutes?:    number   // M4 — NULL usa o intervalo do profissional
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
): Promise<{ success: true; id: string } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { data, error } = await supabase.from('appointments').insert({
    clinic_id:            auth.clinicId,
    pet_id:               payload.pet_id,
    tutor_id:             payload.tutor_id,
    appointment_datetime: payload.appointment_datetime,
    reason:               payload.reason,
    notes:                payload.notes ?? null,
    professional_id:      payload.professional_id ?? null,
    duration_minutes:     payload.duration_minutes ?? null,
    status:               'scheduled',
    created_by:           auth.userId,
  }).select('id').single()

  if (error) return { error: 'Erro ao criar agendamento: ' + error.message }
  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/reception/calendar')
  return { success: true, id: data.id }
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
      supabase.from('patients').select('id, name, species, breed').eq('clinic_id', auth.clinicId).in('id', petIds).is('deleted_at', null),
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

// ─── Full appointment (edit) ──────────────────────────────────────────────────

export interface AppointmentFull {
  id:                   string
  pet_id:               string
  tutor_id:             string
  professional_id:      string | null
  appointment_datetime: string
  reason:               string
  status:               string
  notes:                string | null
  duration_minutes:     number | null
  patient:              { id: string; name: string; species: string }
  tutor:                { id: string; name: string; phone: string }
  professional:         { id: string; full_name: string } | null
}

export async function getAppointmentById(
  id: string,
): Promise<AppointmentFull | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('appointments')
    .select(`
      id, pet_id, tutor_id, professional_id, appointment_datetime,
      reason, status, notes, duration_minutes,
      patient:patients!appointments_pet_id_fkey ( id, name, species ),
      tutor:tutors!appointments_tutor_id_fkey ( id, name, phone ),
      professional:profiles!appointments_professional_id_fkey ( id, full_name )
    `)
    .eq('id', id)
    .eq('clinic_id', auth.clinicId)
    .single()

  if (error || !data) return { error: error?.message ?? 'Agendamento não encontrado.' }

  const patient     = (Array.isArray(data.patient)     ? data.patient[0]     : data.patient)     as { id: string; name: string; species: string } | null
  const tutor       = (Array.isArray(data.tutor)       ? data.tutor[0]       : data.tutor)       as { id: string; name: string; phone: string } | null
  const professional= (Array.isArray(data.professional)? data.professional[0]: data.professional) as { id: string; full_name: string } | null

  return {
    id:                   data.id,
    pet_id:               data.pet_id,
    tutor_id:             data.tutor_id,
    professional_id:      data.professional_id,
    appointment_datetime: data.appointment_datetime,
    reason:               data.reason,
    status:               data.status,
    notes:                data.notes,
    duration_minutes:     (data as { duration_minutes?: number | null }).duration_minutes ?? null,
    patient:  patient  ?? { id: data.pet_id,   name: '—', species: 'dog' },
    tutor:    tutor    ?? { id: data.tutor_id,  name: '—', phone: '' },
    professional: professional ?? null,
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export interface UpdateAppointmentPayload {
  appointment_datetime?: string
  professional_id?:      string | null
  notes?:                string | null
  duration_minutes?:     number | null
}

export async function updateAppointment(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<{ success: true } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const patch: Record<string, unknown> = {}
  if (payload.appointment_datetime !== undefined) patch.appointment_datetime = payload.appointment_datetime
  if ('professional_id' in payload)               patch.professional_id      = payload.professional_id
  if ('notes' in payload)                         patch.notes                = payload.notes
  if ('duration_minutes' in payload)              patch.duration_minutes     = payload.duration_minutes

  const { error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/reception/calendar')
  return { success: true }
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

/**
 * markAppointmentArrived: variante de confirmArrival que APENAS marca o
 * appointment como 'arrived' — SEM criar consultation. Usado quando o
 * CheckInModal já criou a consultation pelo fluxo padrão e só falta
 * atualizar o status do agendamento original.
 */
export async function markAppointmentArrived(
  appointmentId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const auth = await getUserClinic()
    if ('error' in auth) return auth

    const supabase = await createClient()
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'arrived' })
      .eq('id', appointmentId)
      .eq('clinic_id', auth.clinicId)

    if (error) return { error: 'Erro ao marcar agendamento como atendido: ' + error.message }

    revalidatePath('/dashboard/reception')
    revalidatePath('/dashboard/reception/calendar')
    return { success: true }
  } catch (err) {
    console.error('[markAppointmentArrived]', err)
    return { error: 'Erro interno.' }
  }
}

// ─── Contagem de atendimentos por profissional (hoje) ─────────────────────────

export interface ProfessionalCount {
  vet_id: string
  vet_name: string
  count: number
}

export async function getTodayCountsByProfessional(): Promise<ProfessionalCount[] | { error: string }> {
  try {
    const auth = await getUserClinic()
    if ('error' in auth) return auth

    const supabase = await createClient()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('consultations')
      .select('vet_id')
      .eq('clinic_id', auth.clinicId)
      .not('vet_id', 'is', null)
      .gte('created_at', todayStart.toISOString())

    if (error) return { error: error.message }
    if (!data?.length) return []

    // Count by vet_id
    const countMap: Record<string, number> = {}
    for (const c of data) {
      if (c.vet_id) countMap[c.vet_id] = (countMap[c.vet_id] ?? 0) + 1
    }

    // Fetch vet names
    const vetIds = Object.keys(countMap)
    const { data: vets } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', vetIds)

    const vetNames: Record<string, string> = {}
    for (const v of vets ?? []) vetNames[v.id] = v.full_name

    return vetIds.map(id => ({
      vet_id: id,
      vet_name: vetNames[id] ?? 'MV',
      count: countMap[id],
    })).sort((a, b) => b.count - a.count)
  } catch {
    return { error: 'Erro ao buscar contagens por profissional.' }
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
