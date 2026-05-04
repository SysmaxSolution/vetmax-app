'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ConsultationStatus } from '@/types'

export interface AgendaCard {
  id: string
  status: ConsultationStatus
  visit_reason: string
  created_at: string
  scheduled_date: string | null
  patient: {
    id: string
    name: string
    species: string
    photo_url: string | null
  }
  tutor: {
    name: string
  }
  vet: {
    id: string
    full_name: string
  } | null
}

export type AgendaColumn = {
  key: ConsultationStatus
  label: string
  cards: AgendaCard[]
}

const KANBAN_COLUMNS: { key: ConsultationStatus; label: string }[] = [
  { key: 'scheduled',   label: 'Agendados' },
  { key: 'reception',   label: 'Aguardando' },
  { key: 'triage',      label: 'Em Triagem' },
  { key: 'in_progress', label: 'Em Consulta' },
  { key: 'completed',   label: 'Finalizado' },
]

export async function getAgendaBoard(date?: string): Promise<AgendaColumn[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const targetDate = date ?? new Date().toISOString().split('T')[0]
  const startOfDay = `${targetDate}T00:00:00`
  const endOfDay   = `${targetDate}T23:59:59`

  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at, scheduled_date,
      patients!inner(id, name, species, photo_url),
      tutors:patients!inner(tutor:tutors(name)),
      vet:profiles(id, full_name)
    `)
    .in('status', KANBAN_COLUMNS.map(c => c.key))
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .order('created_at', { ascending: true })

  if (error) {
    // Fallback: query simpler if join fails
    const { data: fallback, error: err2 } = await supabase
      .from('consultations')
      .select(`
        id, status, visit_reason, created_at, scheduled_date,
        patients(id, name, species, photo_url, tutor_id, tutors(name)),
        profiles(id, full_name)
      `)
      .in('status', KANBAN_COLUMNS.map(c => c.key))
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: true })

    if (err2 || !fallback) return { error: err2?.message ?? 'Erro ao buscar agenda.' }

    const cards: AgendaCard[] = fallback.map((c: any) => ({
      id: c.id,
      status: c.status,
      visit_reason: c.visit_reason,
      created_at: c.created_at,
      scheduled_date: c.scheduled_date,
      patient: {
        id: c.patients?.id ?? '',
        name: c.patients?.name ?? '—',
        species: c.patients?.species ?? 'dog',
        photo_url: c.patients?.photo_url ?? null,
      },
      tutor: { name: c.patients?.tutors?.name ?? '—' },
      vet: c.profiles ? { id: c.profiles.id, full_name: c.profiles.full_name } : null,
    }))

    return KANBAN_COLUMNS.map(col => ({
      ...col,
      cards: cards.filter(c => c.status === col.key),
    }))
  }

  const cards: AgendaCard[] = (data ?? []).map((c: any) => ({
    id: c.id,
    status: c.status,
    visit_reason: c.visit_reason,
    created_at: c.created_at,
    scheduled_date: c.scheduled_date,
    patient: {
      id: c.patients?.id ?? '',
      name: c.patients?.name ?? '—',
      species: c.patients?.species ?? 'dog',
      photo_url: c.patients?.photo_url ?? null,
    },
    tutor: { name: c.tutors?.tutor?.name ?? '—' },
    vet: c.vet ? { id: c.vet.id, full_name: c.vet.full_name } : null,
  }))

  return KANBAN_COLUMNS.map(col => ({
    ...col,
    cards: cards.filter(c => c.status === col.key),
  }))
}

const VALID_TRANSITIONS: Record<string, ConsultationStatus[]> = {
  scheduled:   ['reception', 'cancelled'],
  reception:   ['triage', 'cancelled'],
  triage:      ['in_progress'],
  in_progress: ['waiting_exam', 'completed'],
  waiting_exam: ['in_progress', 'completed'],
}

export async function moveAgendaCard(
  consultationId: string,
  newStatus: ConsultationStatus
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // Check current status
  const { data: current } = await supabase
    .from('consultations')
    .select('status')
    .eq('id', consultationId)
    .single()

  if (!current) return { error: 'Consulta não encontrada.' }

  const allowed = VALID_TRANSITIONS[current.status]
  if (allowed && !allowed.includes(newStatus)) {
    return { error: `Transição de "${current.status}" para "${newStatus}" não é permitida.` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('consultations')
    .update({ status: newStatus })
    .eq('id', consultationId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/reception')
  return { success: true }
}
