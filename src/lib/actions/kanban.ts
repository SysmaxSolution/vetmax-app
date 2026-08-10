'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KanbanColumn = 'reception' | 'triage' | 'consultation' | 'billing'

export type KanbanItem = {
  consultationId: string
  column: KanbanColumn
  petName: string
  species: string
  breed: string | null
  photo_url: string | null
  tutorName: string
  visitReason: string
  createdAt: string        // ISO — para calcular tempo de espera no cliente
  vetName: string | null   // preenchido apenas em 'consultation'
  behaviorTags: string[]   // vem de patients.behavior_tags (JSONB)
  hasAllergies: boolean    // derivado de patients.allergies != null
  paymentStatus: 'pending' | 'paid' | 'courtesy' | null  // vem de invoices
  invoiceTotal: number | null
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

const STATUS_TO_COLUMN: Record<string, KanbanColumn> = {
  reception:              'reception',
  scheduled:              'reception',
  triage:                 'triage',
  in_progress:            'consultation',
  waiting_exam:           'consultation',
  medication:             'consultation',
  revisao_pos_internacao: 'consultation',
  awaiting_review:        'billing',
  completed:              'billing',
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
  grooming:     'Banho e Tosa',
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getKanbanData(): Promise<KanbanItem[] | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at,
      patients (
        name, species, breed, photo_url, allergies,
        behavior_tags,
        tutors ( name )
      ),
      vet:profiles!vet_id ( full_name ),
      invoices ( status, total_amount )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['reception', 'scheduled', 'triage', 'in_progress', 'waiting_exam', 'medication', 'awaiting_review', 'completed', 'revisao_pos_internacao'])
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar dados do Kanban: ' + error.message }

  return (data ?? []).map((c: any) => {
    const rawTags: string[] = Array.isArray(c.patients?.behavior_tags)
      ? c.patients.behavior_tags
      : []

    // Deriva tag 'allergic' se o campo livre de alergias estiver preenchido
    const behaviorTags = c.patients?.allergies && !rawTags.includes('allergic')
      ? [...rawTags, 'allergic']
      : rawTags

    const invoice = Array.isArray(c.invoices) ? c.invoices[0] : c.invoices

    return {
      consultationId: c.id,
      column: STATUS_TO_COLUMN[c.status] ?? 'reception',
      petName:  c.patients?.name      ?? '—',
      species:  c.patients?.species   ?? 'exotic',
      breed:    c.patients?.breed     ?? null,
      photo_url: c.patients?.photo_url ?? null,
      tutorName: c.patients?.tutors?.name ?? '—',
      visitReason: VISIT_REASON_LABELS[c.visit_reason] ?? c.visit_reason ?? 'Consulta',
      createdAt: c.created_at,
      vetName: (c.vet as any)?.full_name ?? null,
      behaviorTags,
      hasAllergies: !!c.patients?.allergies,
      paymentStatus: (invoice?.status as 'pending' | 'paid' | 'courtesy') ?? null,
      invoiceTotal: invoice?.total_amount ? Number(invoice.total_amount) : null,
    }
  })
}
