'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarEventType = 'appointment' | 'grooming'

export interface UnifiedCalendarEvent {
  id:               string
  type:             CalendarEventType
  title:            string
  datetime:         string        // ISO datetime of start
  status:           string
  petId:            string
  petName:          string
  tutorName:        string
  petSpecies:       string
  sourceId:         string
  reason?:          string        // appointment reason
  services?:        string[]      // grooming services
  source?:          string        // 'manual' | 'whatsapp'
  professionalId:   string | null
  professionalName: string | null
  durationMinutes:  number        // duração do bloco na agenda (default 60 / 120 grooming)
  botConfirmationStatus?: 'confirmed' | 'rescheduled' | 'cancelled' | null
}

export interface CalendarProfessional {
  id:   string
  name: string
  role: string
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

// ─── Unified Calendar Events ──────────────────────────────────────────────────

/**
 * Returns all events for a specific date: appointments + grooming sessions.
 * Both queries explicitly filter by clinic_id (multi-tenant safety).
 */
export async function getUnifiedCalendarEvents(
  date: string, // 'YYYY-MM-DD'
): Promise<UnifiedCalendarEvent[] | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()

  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  const [appointmentsRes, groomingRes] = await Promise.all([
    supabase
      .from('appointments')
      .select(`
        id, appointment_datetime, reason, status, notes, source, professional_id, duration_minutes, bot_confirmation_status,
        patients:pet_id ( id, name, species ),
        tutors:tutor_id ( id, name ),
        professional:profiles!professional_id ( full_name, appointment_interval_minutes )
      `)
      .eq('clinic_id', auth.clinicId)
      .gte('appointment_datetime', dayStart)
      .lte('appointment_datetime', dayEnd)
      .neq('status', 'cancelled')
      .order('appointment_datetime'),

    supabase
      .from('grooming_sessions')
      .select(`
        id, scheduled_at, status, services_requested, groomer_id,
        patients:patient_id ( id, name, species ),
        tutors:tutor_id ( id, name ),
        groomer:profiles!groomer_id ( full_name )
      `)
      .eq('clinic_id', auth.clinicId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .neq('status', 'delivered')
      .neq('current_status', 'cancelled')
      .order('scheduled_at'),
  ])

  if (appointmentsRes.error) return { error: `Erro ao buscar consultas: ${appointmentsRes.error.message}` }
  if (groomingRes.error)     return { error: `Erro ao buscar tosas: ${groomingRes.error.message}` }

  const events: UnifiedCalendarEvent[] = []

  // Map appointments
  for (const a of (appointmentsRes.data ?? [])) {
    const pet   = Array.isArray(a.patients)     ? a.patients[0]     : a.patients
    const tutor = Array.isArray(a.tutors)        ? a.tutors[0]        : a.tutors
    const prof  = Array.isArray((a as any).professional) ? (a as any).professional[0] : (a as any).professional
    events.push({
      id:               a.id,
      type:             'appointment',
      title:            pet?.name ?? 'Sem nome',
      datetime:         a.appointment_datetime,
      status:           a.status,
      petId:            pet?.id ?? '',
      petName:          pet?.name ?? '',
      tutorName:        tutor?.name ?? '',
      petSpecies:       pet?.species ?? '',
      sourceId:         a.id,
      reason:           a.reason,
      source:           (a as any).source ?? 'manual',
      professionalId:   (a as any).professional_id ?? null,
      professionalName: prof?.full_name ?? null,
      durationMinutes:  (a as any).duration_minutes ?? prof?.appointment_interval_minutes ?? 60,
      botConfirmationStatus: ((a as any).bot_confirmation_status ?? null) as UnifiedCalendarEvent['botConfirmationStatus'],
    })
  }

  // Map grooming sessions
  for (const g of (groomingRes.data ?? [])) {
    const pet    = Array.isArray(g.patients)     ? g.patients[0]     : g.patients
    const tutor  = Array.isArray(g.tutors)        ? g.tutors[0]        : g.tutors
    const groomer = Array.isArray((g as any).groomer) ? (g as any).groomer[0] : (g as any).groomer
    events.push({
      id:               g.id,
      type:             'grooming',
      title:            pet?.name ?? 'Sem nome',
      datetime:         g.scheduled_at!,
      status:           g.status,
      petId:            pet?.id ?? '',
      petName:          pet?.name ?? '',
      tutorName:        tutor?.name ?? '',
      petSpecies:       pet?.species ?? '',
      sourceId:         g.id,
      services:         g.services_requested ?? [],
      professionalId:   (g as any).groomer_id ?? null,
      professionalName: groomer?.full_name ?? null,
      durationMinutes:  120,
    })
  }

  // Sort merged list chronologically
  events.sort((a, b) => a.datetime.localeCompare(b.datetime))

  return events
}

/**
 * Returns all events for a date range: appointments + grooming sessions.
 * Used by react-big-calendar for week/month navigation.
 */
export async function getUnifiedEventsForRange(
  start: string, // 'YYYY-MM-DD'
  end:   string, // 'YYYY-MM-DD'
): Promise<UnifiedCalendarEvent[] | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const rangeStart = `${start}T00:00:00`
  const rangeEnd   = `${end}T23:59:59`

  const [apptRes, groomRes] = await Promise.all([
    supabase
      .from('appointments')
      .select(`id, appointment_datetime, reason, status, source, professional_id, duration_minutes, bot_confirmation_status,
               patients:pet_id ( id, name, species ),
               tutors:tutor_id ( id, name ),
               professional:profiles!professional_id ( full_name, appointment_interval_minutes )`)
      .eq('clinic_id', auth.clinicId)
      .gte('appointment_datetime', rangeStart)
      .lte('appointment_datetime', rangeEnd)
      .neq('status', 'cancelled')
      .order('appointment_datetime'),

    supabase
      .from('grooming_sessions')
      .select(`id, scheduled_at, status, services_requested, groomer_id,
               patients:patient_id ( id, name, species ),
               tutors:tutor_id ( id, name ),
               groomer:profiles!groomer_id ( full_name )`)
      .eq('clinic_id', auth.clinicId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', rangeStart)
      .lte('scheduled_at', rangeEnd)
      .neq('status', 'delivered')
      .neq('current_status', 'cancelled')
      .order('scheduled_at'),
  ])

  if (apptRes.error) return { error: `Erro ao buscar consultas: ${apptRes.error.message}` }
  if (groomRes.error) return { error: `Erro ao buscar tosas: ${groomRes.error.message}` }

  const events: UnifiedCalendarEvent[] = []

  for (const a of (apptRes.data ?? [])) {
    const pet   = Array.isArray(a.patients)          ? a.patients[0]          : a.patients
    const tutor = Array.isArray(a.tutors)             ? a.tutors[0]             : a.tutors
    const prof  = Array.isArray((a as any).professional) ? (a as any).professional[0] : (a as any).professional
    events.push({
      id: a.id, type: 'appointment', sourceId: a.id,
      title:            pet?.name ?? 'Sem nome',
      datetime:         a.appointment_datetime,
      status:           a.status,
      petId:            pet?.id ?? '',
      petName:          pet?.name ?? '',
      tutorName:        tutor?.name ?? '',
      petSpecies:       pet?.species ?? '',
      reason:           a.reason,
      source:           (a as any).source ?? 'manual',
      professionalId:   (a as any).professional_id ?? null,
      professionalName: prof?.full_name ?? null,
      durationMinutes:  (a as any).duration_minutes ?? prof?.appointment_interval_minutes ?? 60,
      botConfirmationStatus: ((a as any).bot_confirmation_status ?? null) as UnifiedCalendarEvent['botConfirmationStatus'],
    })
  }

  for (const g of (groomRes.data ?? [])) {
    const pet    = Array.isArray(g.patients)         ? g.patients[0]         : g.patients
    const tutor  = Array.isArray(g.tutors)            ? g.tutors[0]            : g.tutors
    const groomer = Array.isArray((g as any).groomer) ? (g as any).groomer[0] : (g as any).groomer
    events.push({
      id: g.id, type: 'grooming', sourceId: g.id,
      title:            pet?.name ?? 'Sem nome',
      datetime:         g.scheduled_at!,
      status:           g.status,
      petId:            pet?.id ?? '',
      petName:          pet?.name ?? '',
      tutorName:        tutor?.name ?? '',
      petSpecies:       pet?.species ?? '',
      services:         g.services_requested ?? [],
      professionalId:   (g as any).groomer_id ?? null,
      professionalName: groomer?.full_name ?? null,
      durationMinutes:  120,
    })
  }

  events.sort((a, b) => a.datetime.localeCompare(b.datetime))
  return events
}

/**
 * Returns clinic professionals (vets, groomers, owners, managers) for resource view.
 */
export async function getClinicProfessionals(): Promise<CalendarProfessional[] | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('clinic_id', auth.clinicId)
    .in('role', ['vet', 'groomer', 'admin', 'owner', 'manager'])
    .order('full_name')

  if (error) return { error: error.message }
  return (data ?? []).map((p: any) => ({
    id:   p.id,
    name: p.full_name ?? 'Profissional',
    role: p.role ?? '',
  }))
}

/**
 * Returns event counts per day for a month (appointments + grooming sessions).
 * Used to render event dots on the monthly calendar grid.
 */
export async function getUnifiedMonthCounts(
  year: number,
  month: number,
): Promise<Record<string, number> | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
  const lastDay    = new Date(year, month, 0).getDate()
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59`

  const [appointmentsRes, groomingRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('appointment_datetime')
      .eq('clinic_id', auth.clinicId)
      .gte('appointment_datetime', monthStart)
      .lte('appointment_datetime', monthEnd)
      .neq('status', 'cancelled'),

    supabase
      .from('grooming_sessions')
      .select('scheduled_at')
      .eq('clinic_id', auth.clinicId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', monthStart)
      .lte('scheduled_at', monthEnd)
      .neq('status', 'delivered')
      .neq('current_status', 'cancelled'),
  ])

  if (appointmentsRes.error) return { error: appointmentsRes.error.message }
  if (groomingRes.error)     return { error: groomingRes.error.message }

  const counts: Record<string, number> = {}

  for (const a of (appointmentsRes.data ?? [])) {
    const day = a.appointment_datetime.substring(0, 10)
    counts[day] = (counts[day] ?? 0) + 1
  }

  for (const g of (groomingRes.data ?? [])) {
    if (!g.scheduled_at) continue
    const day = g.scheduled_at.substring(0, 10)
    counts[day] = (counts[day] ?? 0) + 1
  }

  return counts
}
