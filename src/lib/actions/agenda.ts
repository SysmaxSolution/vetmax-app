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
    id: string
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

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const startIso = date ? `${date}T00:00:00` : todayStart.toISOString()
  const endIso = date ? `${date}T23:59:59` : new Date(todayStart.getTime() + 86_400_000 - 1).toISOString()

  const { data, error } = await admin
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at, scheduled_date, vet_id,
      patients ( id, name, species, photo_url, tutor_id,
        tutors ( id, name )
      ),
      vet:profiles!vet_id ( id, full_name )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', KANBAN_COLUMNS.map(c => c.key))
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar agenda: ' + error.message }

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
    tutor: {
      id: c.patients?.tutor_id ?? c.patients?.tutors?.id ?? '',
      name: c.patients?.tutors?.name ?? '—',
    },
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
