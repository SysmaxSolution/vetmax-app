'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExamQueueItem = {
  id:           string
  status:       string
  visit_reason: string
  created_at:   string
  patient: {
    id:            string
    name:          string
    species:       string
    breed:         string | null
    photo_url:     string | null
    behavior_tags: string[]
  }
  tutor: {
    name:  string
    phone: string
  }
}

// ─── Fila de Exames (waiting_exam) ───────────────────────────────────────────

export async function getExamsQueue(): Promise<ExamQueueItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at,
      patients ( id, name, species, breed, photo_url, behavior_tags,
        tutors ( name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'waiting_exam')
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar fila de exames: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id:           c.id,
    status:       c.status,
    visit_reason: c.visit_reason,
    created_at:   c.created_at,
    patient: {
      id:            c.patients?.id      ?? '',
      name:          c.patients?.name      ?? '—',
      species:       c.patients?.species   ?? '',
      breed:         c.patients?.breed     ?? null,
      photo_url:     c.patients?.photo_url ?? null,
      behavior_tags: Array.isArray(c.patients?.behavior_tags) ? c.patients.behavior_tags : [],
    },
    tutor: {
      name:  c.patients?.tutors?.name  ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
    },
  })) as ExamQueueItem[]
}

// ─── Histórico de Exames do Dia ───────────────────────────────────────────────

export type ExamHistoryItem = {
  id:           string
  status:       string
  visit_reason: string
  created_at:   string
  exam_notes:   string | null
  patient: {
    id:        string
    name:      string
    species:   string
    breed:     string | null
    photo_url: string | null
  }
  tutor: {
    name:  string
    phone: string
  }
}

export async function getExamsHistory(): Promise<ExamHistoryItem[] | { error: string }> {
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

  // Consultas de hoje com exam_notes preenchidas = o técnico registrou o laudo
  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at, exam_notes,
      patients ( id, name, species, breed, photo_url,
        tutors ( name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .not('exam_notes', 'is', null)
    .gte('updated_at', todayStart.toISOString())
    .order('updated_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar histórico de exames: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id:           c.id,
    status:       c.status,
    visit_reason: c.visit_reason,
    created_at:   c.created_at,
    exam_notes:   c.exam_notes,
    patient: {
      id:        c.patients?.id        ?? '',
      name:      c.patients?.name      ?? '—',
      species:   c.patients?.species   ?? '',
      breed:     c.patients?.breed     ?? null,
      photo_url: c.patients?.photo_url ?? null,
    },
    tutor: {
      name:  c.patients?.tutors?.name  ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
    },
  })) as ExamHistoryItem[]
}

// ─── Devolver ao Médico (waiting_exam → in_progress) ─────────────────────────

export async function dischargeFromExams(
  consultationId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { error } = await supabase
    .from('consultations')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'waiting_exam')

  if (error) return { error: 'Erro ao dar alta: ' + error.message }

  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/reception')
  return { success: true }
}

export async function returnToVet(
  consultationId: string,
  examNotes?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const payload: Record<string, any> = {
    status:     'in_progress',
    updated_at: new Date().toISOString(),
  }
  if (examNotes?.trim()) payload.exam_notes = examNotes.trim()

  const { error } = await supabase
    .from('consultations')
    .update(payload)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'waiting_exam')

  if (error) return { error: 'Erro ao devolver consulta: ' + error.message }

  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/vet')
  return { success: true }
}

// ─── exam_requests table (E2E tests use this table) ──────────────────────────

export type ExamRequest = {
  id:         string
  exam_type:  string
  status:     string
  result:     string | null
  created_at: string
  patient: {
    id:        string
    name:      string
    species:   string
    breed:     string | null
    photo_url: string | null
  }
  tutor: {
    name:  string
    phone: string
  }
}

export async function getExamRequests(): Promise<ExamRequest[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()
    if (!profile?.clinic_id) return []

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('exam_requests')
      .select(`
        id, exam_type, status, result, created_at,
        patients ( id, name, species, breed, photo_url,
          tutors ( name, phone )
        )
      `)
      .eq('clinic_id', profile.clinic_id)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return data.map((r: any) => ({
      id:         r.id,
      exam_type:  r.exam_type ?? 'exam',
      status:     r.status,
      result:     r.result ?? null,
      created_at: r.created_at,
      patient: {
        id:        r.patients?.id        ?? '',
        name:      r.patients?.name      ?? '—',
        species:   r.patients?.species   ?? '',
        breed:     r.patients?.breed     ?? null,
        photo_url: r.patients?.photo_url ?? null,
      },
      tutor: {
        name:  r.patients?.tutors?.name  ?? '—',
        phone: r.patients?.tutors?.phone ?? '',
      },
    }))
  } catch {
    return []
  }
}

export async function requestExam(params: {
  patient_id: string
  tutor_id:   string
  exam_type:  string
  notes?:     string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Cria consulta no fluxo unificado (igual ao Consultório) para que o pet apareça
  // na fila de exames (getExamsQueue consulta consultations com status waiting_exam)
  const { data: consultation, error: consultErr } = await admin
    .from('consultations')
    .insert({
      clinic_id:      profile.clinic_id,
      patient_id:     params.patient_id,
      visit_reason:   'exam',
      status:         'waiting_exam',
      payment_status: 'pending',
    })
    .select('id')
    .single()

  if (consultErr || !consultation) {
    return { error: 'Erro ao criar consulta de exame: ' + (consultErr?.message ?? '') }
  }

  const { data, error } = await admin
    .from('exam_requests')
    .insert({
      clinic_id:       profile.clinic_id,
      patient_id:      params.patient_id,
      tutor_id:        params.tutor_id,
      exam_type:       params.exam_type,
      consultation_id: consultation.id,
      notes:           params.notes ?? 'Exame solicitado manualmente no módulo de Exames.',
      status:          'pending',
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao solicitar exame: ' + error.message }
  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/reception')
  return { id: data.id }
}

export async function saveExamResult(
  examRequestId: string,
  result: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('exam_requests')
    .update({ status: 'completed', result, updated_at: new Date().toISOString() })
    .eq('id', examRequestId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao salvar resultado: ' + error.message }
  revalidatePath('/dashboard/exams')
  return { success: true }
}
