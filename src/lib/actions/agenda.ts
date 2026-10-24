'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ConsultationStatus } from '@/types'
import { byUrgencyThenTime } from '@/lib/urgency'

import { mensagemErro } from '@/lib/errors'
import type { AgendaCard, AgendaColumn } from '@/types/agenda'

/** Etapas em que o pet está DENTRO da clínica — entram no painel sem filtro de dia. */
const OPEN_STATUSES: ConsultationStatus[] = [
  'reception', 'triage', 'in_progress', 'waiting_exam', 'medication', 'awaiting_review',
]

const KANBAN_COLUMNS: { key: ConsultationStatus; label: string }[] = [
  { key: 'scheduled',    label: 'Agendados' },
  { key: 'reception',    label: 'Aguardando' },
  { key: 'triage',       label: 'Em Triagem' },
  { key: 'in_progress',  label: 'Em Consulta' },
  { key: 'waiting_exam', label: 'Aguardando Exame' },
  { key: 'medication',   label: 'Em Medicação' },
  { key: 'awaiting_review', label: 'Ag. Finalização' },
  { key: 'completed',    label: 'Finalizado' },
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
      id, status, visit_reason, created_at, scheduled_date, vet_id, urgency,
      patients ( id, name, species, photo_url, tutor_id,
        tutors ( id, name )
      ),
      vet:profiles!vet_id ( id, full_name )
    `)
    .eq('clinic_id', profile.clinic_id)
    // Quem está em atendimento não tem data: o pet que deu entrada ontem e
    // ainda aguarda exame continua no painel até sair do fluxo. O dia só
    // delimita as pontas — o que ainda vai acontecer (Agendados, pela data
    // marcada) e o que já acabou (Finalizado).
    .or([
      `status.in.(${OPEN_STATUSES.join(',')})`,
      `and(status.eq.scheduled,or(and(scheduled_date.gte.${startIso},scheduled_date.lte.${endIso}),and(scheduled_date.is.null,created_at.gte.${startIso},created_at.lte.${endIso})))`,
      `and(status.eq.completed,updated_at.gte.${startIso},updated_at.lte.${endIso})`,
    ].join(','))
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar agenda: ' + mensagemErro(error, 'lib/actions/agenda.ts') }

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
    urgency: c.urgency ?? null,
  }))

  return KANBAN_COLUMNS.map(col => ({
    ...col,
    // Emergência fura a fila dentro de cada coluna (Sprint Animais).
    cards: cards.filter(c => c.status === col.key).sort(byUrgencyThenTime),
  }))
}

const VALID_TRANSITIONS: Record<string, ConsultationStatus[]> = {
  scheduled:    ['reception', 'cancelled'],
  reception:    ['triage', 'in_progress', 'cancelled'],
  triage:       ['in_progress'],
  in_progress:  ['waiting_exam', 'medication', 'completed'],
  waiting_exam: ['in_progress', 'medication', 'completed'],
  medication:   ['in_progress', 'completed'],
  // awaiting_review = cobrado, aguardando assinatura. A finalização SÓ pode
  // ocorrer pelo fluxo "Dar Alta" do MV (que exige is_reviewed_by_vet + sweep
  // + gate de IA). Array vazio (truthy) bloqueia QUALQUER saída por drag —
  // impede arrastar para 'completed' pulando a assinatura (CFMV).
  awaiting_review: [],
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

  if (error) return { error: mensagemErro(error, 'lib/actions/agenda.ts') }
  revalidatePath('/dashboard/reception')
  return { success: true }
}
