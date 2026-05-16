'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { CheckInPayload, VisitReason, PaymentStatus } from '@/types'
import { logAudit } from './audit'

// ─── Check-in Avançado: cria/atualiza consulta com motivo e pagamento ───────
export async function checkInPatientAdvanced(
  data: CheckInPayload
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }

  // Determinar status baseado no tipo de visita
  const status = data.scheduled_date ? 'scheduled_future' : 'reception'

  const { data: result, error } = await admin
    .from('consultations')
    .insert({
      clinic_id:      profile.clinic_id,
      patient_id:     data.patient_id,
      visit_reason:   data.visit_reason,
      payment_status: data.payment_status,
      payment_method: data.payment_method || null,
      scheduled_date: data.scheduled_date || null,
      weight:         data.weight || null,
      status:         status,
    })
    .select('id')
    .single()

  if (error || !result) return { error: 'Erro ao fazer check-in: ' + (error?.message ?? '') }

  await logAudit({ action: 'CHECK_IN', entity_type: 'consultations', entity_id: result.id, details: { patient_id: data.patient_id, visit_reason: data.visit_reason } })

  revalidatePath('/dashboard/reception')
  return { id: result.id }
}

// ─── Check-in com Confirmação de Contatos (Tutor + Endereço) ──────────────────
export interface CheckInWithContactsPayload extends CheckInPayload {
  patient_id: string
  tutor_id: string
  address: string          // Endereço completo — obrigatório
  emergency_contact: string // Contato de emergência — obrigatório
}

export async function checkInPatientWithContacts(
  data: CheckInWithContactsPayload
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }

  // Validação dinâmica conforme configuração da clínica
  const { data: settingsRow } = await admin
    .from('clinic_settings')
    .select('checkin_required_fields')
    .eq('clinic_id', profile.clinic_id)
    .single()
  const requiredFields: string[] = Array.isArray(settingsRow?.checkin_required_fields)
    ? settingsRow.checkin_required_fields
    : ['address', 'emergency_contact']

  if (requiredFields.includes('address') && !data.address?.trim()) {
    return { error: 'Endereço é obrigatório.' }
  }
  if (requiredFields.includes('emergency_contact') && !data.emergency_contact?.trim()) {
    return { error: 'Contato de emergência é obrigatório.' }
  }

  // 1. Atualizar dados do tutor (endereço + contato de emergência)
  const { error: tutorErr } = await admin
    .from('tutors')
    .update({
      address: data.address.trim(),
      emergency_contact: data.emergency_contact.trim(),
    })
    .eq('id', data.tutor_id)

  if (tutorErr) return { error: 'Erro ao atualizar dados do tutor: ' + tutorErr.message }

  // 2. Criar consulta com dados do check-in
  const status = data.scheduled_date ? 'scheduled_future' : 'reception'

  const { data: result, error } = await admin
    .from('consultations')
    .insert({
      clinic_id:      profile.clinic_id,
      patient_id:     data.patient_id,
      visit_reason:   data.visit_reason,
      payment_status: data.payment_status,
      payment_method: data.payment_method || null,
      scheduled_date: data.scheduled_date || null,
      weight:         data.weight || null,
      status:         status,
    })
    .select('id')
    .single()

  if (error || !result) return { error: 'Erro ao fazer check-in: ' + (error?.message ?? '') }

  await logAudit({ action: 'CHECK_IN_WITH_CONTACTS', entity_type: 'consultations', entity_id: result.id, details: { patient_id: data.patient_id } })

  revalidatePath('/dashboard/reception')
  return { id: result.id }
}

// ─── Atualizar Consulta Existente (Motivo, Pagamento, Data, e Tutor) ────────
export async function updateConsultation(
  consultationId: string,
  updates: {
    visit_reason?: VisitReason
    payment_status?: PaymentStatus
    payment_method?: string
    scheduled_date?: string | null
    tutorId?: string
    address?: string
    emergency_contact?: string
  }
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

  // 1. Se houver dados de tutor, atualizar tutor também (escopo por clinic_id)
  if (updates.tutorId && (updates.address || updates.emergency_contact)) {
    const tutorUpdates: { address?: string; emergency_contact?: string } = {}
    if (updates.address) tutorUpdates.address = updates.address
    if (updates.emergency_contact) tutorUpdates.emergency_contact = updates.emergency_contact

    const { error: tutorErr } = await admin
      .from('tutors')
      .update(tutorUpdates)
      .eq('id', updates.tutorId)
      .eq('clinic_id', profile.clinic_id)

    if (tutorErr) return { error: 'Erro ao atualizar tutor: ' + tutorErr.message }
  }

  // 2. Atualizar consulta (remover campos de tutor da atualização)
  const consultationUpdates = {
    visit_reason: updates.visit_reason,
    payment_status: updates.payment_status,
    payment_method: updates.payment_method,
    scheduled_date: updates.scheduled_date,
  }

  const { error } = await admin
    .from('consultations')
    .update(consultationUpdates)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao atualizar: ' + error.message }

  await logAudit({ action: 'UPDATE_CONSULTATION', entity_type: 'consultations', entity_id: consultationId, details: { visit_reason: updates.visit_reason, payment_status: updates.payment_status } })

  revalidatePath('/dashboard/reception')
  return { success: true }
}

// ─── Check-in simples (mantém compatibilidade) ────────────────────────────────
export async function checkInPatient(
  patientId: string,
  paymentMethod?: string
): Promise<{ id: string } | { error: string }> {
  return checkInPatientAdvanced({
    patient_id: patientId,
    visit_reason: 'consultation',
    payment_status: 'pending',
    payment_method: paymentMethod ? (paymentMethod as any) : undefined,
  })
}

// ─── Fila de Recepção (status = reception ou scheduled, criadas hoje) ─────────
export type ReceptionQueueItem = {
  id: string
  status: string
  created_at: string
  payment_status: string | null
  payment_method: string | null
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
    birth_date: string | null
    gender: string | null
    neutered: boolean
    coat_color: string | null
    photo_url: string | null
    behavior_tags: string[]
    last_visit: string | null
  }
  tutor: {
    id: string
    name: string
    phone: string
    address: string | null
  }
}

export async function getReceptionQueue(): Promise<ReceptionQueueItem[] | { error: string }> {
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

  const { data, error } = await admin
    .from('consultations')
    .select(`
      id, status, created_at, payment_status, payment_method,
      patients ( id, name, species, breed, birth_date, gender, neutered, coat_color, photo_url, behavior_tags,
        tutors ( id, name, phone, address )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['reception', 'scheduled'])
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar fila: ' + error.message }

  // Busca última visita para cada pet
  const patientIds = [...new Set((data ?? []).map((c: any) => c.patients?.id).filter(Boolean))]
  let lastVisitMap: Record<string, string> = {}
  if (patientIds.length > 0) {
    const { data: visits } = await admin
      .from('consultations')
      .select('patient_id, created_at')
      .in('patient_id', patientIds)
      .eq('clinic_id', profile.clinic_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
    if (visits) {
      for (const v of visits) {
        if (v.patient_id && !lastVisitMap[v.patient_id]) {
          lastVisitMap[v.patient_id] = v.created_at
        }
      }
    }
  }

  return (data ?? []).map((c: any) => ({
    id:             c.id,
    status:         c.status,
    created_at:     c.created_at,
    payment_status: c.payment_status,
    payment_method: c.payment_method,
    patient: {
      id:            c.patients?.id ?? '',
      name:          c.patients?.name ?? '—',
      species:       c.patients?.species ?? '',
      breed:         c.patients?.breed ?? null,
      birth_date:    c.patients?.birth_date ?? null,
      gender:        c.patients?.gender ?? null,
      neutered:      c.patients?.neutered ?? false,
      coat_color:    c.patients?.coat_color ?? null,
      photo_url:     c.patients?.photo_url ?? null,
      behavior_tags: Array.isArray(c.patients?.behavior_tags) ? c.patients.behavior_tags : [],
      last_visit:    lastVisitMap[c.patients?.id] ?? null,
    },
    tutor: {
      id:      c.patients?.tutors?.id ?? '',
      name:    c.patients?.tutors?.name ?? '—',
      phone:   c.patients?.tutors?.phone ?? '',
      address: c.patients?.tutors?.address ?? null,
    },
  }))
}

// ─── Histórico de Recepção (Consultations já processadas hoje) ────────────────
export type ReceptionHistoryItem = {
  id: string
  status: string
  visit_reason: string
  payment_status: string
  created_at: string
  updated_at: string
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
    photo_url: string | null
  }
  tutor: {
    id: string
    name: string
    phone: string
  }
}

export async function getReceptionHistory(): Promise<ReceptionHistoryItem[] | { error: string }> {
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

  const { data, error } = await admin
    .from('consultations')
    .select(`
      id, status, visit_reason, payment_status, created_at, updated_at,
      patients ( id, name, species, breed, photo_url,
        tutors ( id, name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['reception', 'scheduled', 'triage', 'in_progress', 'waiting_exam', 'medication', 'completed'])
    .gte('created_at', todayStart.toISOString())
    .order('updated_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar histórico: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id:             c.id,
    status:         c.status,
    visit_reason:   c.visit_reason,
    payment_status: c.payment_status,
    created_at:     c.created_at,
    updated_at:     c.updated_at,
    patient: {
      id:        c.patients?.id ?? '',
      name:      c.patients?.name ?? '—',
      species:   c.patients?.species ?? '',
      breed:     c.patients?.breed ?? null,
      photo_url: c.patients?.photo_url ?? null,
    },
    tutor: {
      id:    c.patients?.tutors?.id ?? '',
      name:  c.patients?.tutors?.name ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
    },
  }))
}

// ─── Avançar consulta para triagem ────────────────────────────────────────────
export async function moveToTriage(
  consultationId: string
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const adminC = createAdminClient()
  const { data: prof } = await adminC.from('profiles').select('clinic_id').eq('id', user.id).single()

  const { error } = await adminC
    .from('consultations')
    .update({ status: 'triage', updated_at: new Date().toISOString() })
    .eq('id', consultationId)
    .eq('clinic_id', prof?.clinic_id)

  if (error) return { error: 'Erro ao mover para triagem: ' + error.message }
  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/triage')
  return null
}

// ─── Enviar consulta diretamente ao Consultório (sem triagem) ─────────────────
export async function moveDirectToVet(
  consultationId: string
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const adminC = createAdminClient()
  const { data: prof } = await adminC.from('profiles').select('clinic_id').eq('id', user.id).single()

  const { error } = await adminC
    .from('consultations')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', consultationId)
    .eq('clinic_id', prof?.clinic_id)

  if (error) return { error: 'Erro ao enviar ao consultório: ' + error.message }
  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  return null
}
