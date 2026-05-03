'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MentorPetResult =
  | { found: false }
  | {
      found: true
      petName: string
      tutorName: string
      status: string
      statusLabel: string
      statusLocation: string
      consultationId: string
      suggestedTour: string
      href: string
    }

// ─── Maps ─────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  reception:               'na Recepção',
  scheduled:               'na Sala de Espera',
  triage:                  'em Triagem',
  in_progress:             'em Consulta',
  waiting_exam:            'aguardando Exame',
  medication:              'na Sala de Medicação',
  revisao_pos_internacao:  'em Revisão Pós-Internação',
  completed:               'com Alta liberada',
  cancelled:               'com consulta cancelada',
  scheduled_future:        'com consulta agendada',
}

const STATUS_LOCATION: Record<string, string> = {
  reception:               'Recepção',
  scheduled:               'Sala de Espera',
  triage:                  'Triagem',
  in_progress:             'Consultório',
  waiting_exam:            'Setor de Exames',
  medication:              'Sala de Medicação',
  revisao_pos_internacao:  'Consultório (pós-internação)',
  completed:               'Alta',
}

const STATUS_TOUR: Record<string, string> = {
  reception:               'recepcao',
  scheduled:               'sala-espera',
  triage:                  'triagem',
  in_progress:             'consulta',
  waiting_exam:            'exames',
  medication:              'consulta',
  revisao_pos_internacao:  'alta',
  completed:               'alta',
}

const STATUS_HREF: Record<string, string> = {
  reception:               '/dashboard/reception',
  scheduled:               '/dashboard/reception',
  triage:                  '/dashboard/triage',
  in_progress:             '/dashboard/vet',
  waiting_exam:            '/dashboard/exams',
  medication:              '/dashboard/vet',
  revisao_pos_internacao:  '/dashboard/vet',
  completed:               '/dashboard/management',
}

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Searches for an active today-consultation by partial pet name.
 * Scoped to the authenticated user's clinic.
 */
export async function findPetConsultation(
  nameQuery: string
): Promise<MentorPetResult> {
  if (!nameQuery.trim()) return { found: false }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { found: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { found: false }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: rows } = await supabase
    .from('consultations')
    .select(`
      id, status,
      patients!inner ( name, tutors ( name ) )
    `)
    .eq('clinic_id', profile.clinic_id)
    .neq('status', 'cancelled')
    .gte('created_at', todayStart.toISOString())
    .ilike('patients.name', `%${nameQuery.trim()}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!rows || rows.length === 0) return { found: false }

  const row    = rows[0]
  const pet    = row.patients as unknown as { name: string; tutors?: { name: string } | null }
  const status = row.status as string
  const tour   = STATUS_TOUR[status] ?? 'alta'
  const href   = STATUS_HREF[status] ?? '/dashboard/management'

  return {
    found: true,
    petName:        pet.name,
    tutorName:      pet.tutors?.name ?? '',
    status,
    statusLabel:    STATUS_LABELS[status] ?? status,
    statusLocation: STATUS_LOCATION[status] ?? 'Sistema',
    consultationId: row.id,
    suggestedTour:  tour,
    href,
  }
}
