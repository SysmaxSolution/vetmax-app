'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { VitalSigns } from '@/types'
import { logAudit } from './audit'
import { runInsuranceAudit, type AuditResult } from './insurance-audit'

// ─── Fila do Médico Veterinário (in_progress) ─────────────────────────────────
export type VetQueueItem = {
  id: string
  status: string
  visit_reason: string
  created_at: string
  vital_signs: VitalSigns | null
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
    allergies: string | null
    chronic_diseases: string | null
    behavior_tags: string[]
  }
  tutor: {
    id: string
    name: string
    phone: string
  }
}

export async function getVetQueue(): Promise<VetQueueItem[] | { error: string }> {
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
      id, status, visit_reason, created_at, weight, temperature, triage_notes,
      patients ( id, name, species, breed, allergies, chronic_diseases, behavior_tags,
        tutors ( id, name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['in_progress', 'revisao_pos_internacao'])
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar fila: ' + error.message }

  return (data ?? []).map((c: any) => {
    // Reconstrói VitalSigns das colunas antigas (migration 0006 não aplicada)
    let vital_signs: VitalSigns | null = null
    if (c.weight || c.temperature || c.triage_notes) {
      let parsedNotes: Partial<VitalSigns> = {}
      try { parsedNotes = JSON.parse(c.triage_notes ?? '') } catch { /* texto livre */ }
      vital_signs = {
        weight: c.weight ?? parsedNotes.weight ?? 0,
        temperature: c.temperature ?? parsedNotes.temperature ?? 0,
        heart_rate: parsedNotes.heart_rate ?? 0,
        respiratory_rate: parsedNotes.respiratory_rate ?? 0,
        mucous_color: parsedNotes.mucous_color ?? 'pink',
        crt: parsedNotes.crt ?? '2s',
        chief_complaint: parsedNotes.chief_complaint ?? c.triage_notes ?? '',
      }
    }
    return {
      id: c.id,
      status: c.status,
      visit_reason: c.visit_reason ?? 'consultation',
      created_at: c.created_at,
      vital_signs,
      patient: {
        id: c.patients?.id ?? '',
        name: c.patients?.name ?? '—',
        species: c.patients?.species ?? '',
        breed: c.patients?.breed ?? null,
        allergies: c.patients?.allergies ?? null,
        chronic_diseases: c.patients?.chronic_diseases ?? null,
        behavior_tags: Array.isArray(c.patients?.behavior_tags) ? c.patients.behavior_tags : [],
      },
      tutor: {
        id: c.patients?.tutors?.id ?? '',
        name: c.patients?.tutors?.name ?? '—',
        phone: c.patients?.tutors?.phone ?? '',
      },
    }
  })
}

// ─── Consultas Concluídas Hoje ────────────────────────────────────────────────
export type VetCompletedItem = {
  id: string
  status: string
  visit_reason: string
  created_at: string
  patient: { name: string; species: string; photo_url: string | null }
  tutor: { name: string }
}

export async function getVetCompleted(): Promise<VetCompletedItem[] | { error: string }> {
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
      patients ( name, species, photo_url,
        tutors ( name )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['completed', 'waiting_exam', 'medication'])
    .gte('updated_at', todayStart.toISOString())
    .order('updated_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar finalizadas: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id: c.id,
    status: c.status,
    visit_reason: c.visit_reason ?? 'consultation',
    created_at: c.created_at,
    patient: { name: c.patients?.name ?? '—', species: c.patients?.species ?? '', photo_url: c.patients?.photo_url ?? null },
    tutor: { name: c.patients?.tutors?.name ?? '—' },
  }))
}

// ─── Detalhe Completo da Consulta para o MV ───────────────────────────────────
export type VetConsultationDetail = {
  id: string
  status: string
  visit_reason: string
  vet_notes: string | null
  audio_transcript: string | null
  suggested_diagnosis: string | null
  is_reviewed_by_vet: boolean
  exam_notes: string | null
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
    gender: string | null
    color: string | null
    neutered: boolean
    birth_date: string | null
    allergies: string | null
    chronic_diseases: string | null
    past_surgeries: string | null
    notes: string | null
    coat_color: string | null
    reproductive_status: string | null
    medical_history: string | null
    photo_url: string | null
    behavior_tags: string[]
  }
  tutor: {
    id: string
    name: string
    phone: string
    cpf: string
  }
  vital_signs: VitalSigns | null
  past_consultations: {
    id: string
    visit_reason: string
    status: string
    created_at: string
  }[]
}

export async function getVetConsultation(
  consultationId: string
): Promise<VetConsultationDetail | { error: string }> {
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
      id, status, visit_reason, weight, temperature, triage_notes,
      vet_notes, audio_transcript, suggested_diagnosis, is_reviewed_by_vet, exam_notes,
      patients (
        id, name, species, breed, gender, color, neutered, birth_date,
        allergies, chronic_diseases, past_surgeries, notes,
        coat_color, reproductive_status, medical_history,
        photo_url, behavior_tags,
        tutors ( id, name, phone, cpf )
      )
    `)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) return { error: 'Consulta não encontrada.' }

  const c = data as any

  // Reconstrói VitalSigns das colunas antigas (migration 0006 não aplicada)
  let reconstructedVitals: VitalSigns | null = null
  if (c.weight || c.temperature || c.triage_notes) {
    let parsedNotes: Partial<VitalSigns> = {}
    try { parsedNotes = JSON.parse(c.triage_notes ?? '') } catch { /* texto livre */ }
    reconstructedVitals = {
      weight: c.weight ?? parsedNotes.weight ?? 0,
      temperature: c.temperature ?? parsedNotes.temperature ?? 0,
      heart_rate: parsedNotes.heart_rate ?? 0,
      respiratory_rate: parsedNotes.respiratory_rate ?? 0,
      mucous_color: parsedNotes.mucous_color ?? 'pink',
      crt: parsedNotes.crt ?? '2s',
      chief_complaint: parsedNotes.chief_complaint ?? c.triage_notes ?? '',
    }
  }

  // Histórico de consultas anteriores do mesmo pet (últimas 5)
  const { data: past } = await supabase
    .from('consultations')
    .select('id, visit_reason, status, created_at')
    .eq('clinic_id', profile.clinic_id)
    .eq('patient_id', c.patients?.id)
    .neq('id', consultationId)
    .in('status', ['completed', 'waiting_exam', 'medication', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    id: c.id,
    status: c.status,
    visit_reason: c.visit_reason,
    vet_notes: c.vet_notes,
    audio_transcript: c.audio_transcript,
    suggested_diagnosis: c.suggested_diagnosis,
    is_reviewed_by_vet: c.is_reviewed_by_vet,
    exam_notes: c.exam_notes ?? null,
    patient: {
      id: c.patients?.id ?? '',
      name: c.patients?.name ?? '—',
      species: c.patients?.species ?? '',
      breed: c.patients?.breed ?? null,
      gender: c.patients?.gender ?? null,
      color: c.patients?.color ?? null,
      neutered: c.patients?.neutered ?? false,
      birth_date: c.patients?.birth_date ?? null,
      allergies: c.patients?.allergies ?? null,
      chronic_diseases: c.patients?.chronic_diseases ?? null,
      past_surgeries: c.patients?.past_surgeries ?? null,
      notes: c.patients?.notes ?? null,
      coat_color: c.patients?.coat_color ?? null,
      reproductive_status: c.patients?.reproductive_status ?? null,
      medical_history: c.patients?.medical_history ?? null,
      photo_url: c.patients?.photo_url ?? null,
      behavior_tags: Array.isArray(c.patients?.behavior_tags) ? c.patients.behavior_tags : [],
    },
    tutor: {
      id: c.patients?.tutors?.id ?? '',
      name: c.patients?.tutors?.name ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
      cpf: c.patients?.tutors?.cpf ?? '',
    },
    vital_signs: reconstructedVitals,
    past_consultations: (past ?? []).map((pc: any) => ({
      id: pc.id,
      visit_reason: pc.visit_reason,
      status: pc.status,
      created_at: pc.created_at,
    })),
  }
}

// ─── Incluir Paciente Diretamente no Consultório (C-02) ──────────────────────
export async function addPatientDirectToVet(params: {
  patient_id:   string
  tutor_id:     string
  visit_reason: string
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
  const { data, error } = await admin
    .from('consultations')
    .insert({
      clinic_id:       profile.clinic_id,
      patient_id:      params.patient_id,
      visit_reason:    params.visit_reason,
      status:          'in_progress',
      payment_status:  'pending',
      is_reviewed_by_vet: false,
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'Erro ao incluir paciente: ' + (error?.message ?? '') }

  revalidatePath('/dashboard/vet')
  return { id: data.id }
}

// ─── Reabrir Consulta Concluída ───────────────────────────────────────────────
export async function reopenConsultation(
  consultationId: string
): Promise<{ success: boolean } | { error: string }> {
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
    .from('consultations')
    .update({
      status: 'in_progress',
      is_reviewed_by_vet: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'completed')

  if (error) return { error: 'Erro ao reabrir consulta: ' + error.message }

  revalidatePath('/dashboard/vet')
  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}

// ─── Salvar Notas do MV (rascunho + auditoria de convênio) ───────────────────
export async function saveVetNotes(
  consultationId: string,
  vetNotes: string,
  suggestedDiagnosis?: string
): Promise<{ success: boolean; audit?: AuditResult } | { error: string }> {
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

  // 1. Buscar patient_id da consulta para a auditoria
  const { data: consRow } = await supabase
    .from('consultations')
    .select('patient_id')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  const payload: Record<string, any> = {
    vet_notes: vetNotes,
    anamnesis: vetNotes,
    updated_at: new Date().toISOString(),
  }
  if (suggestedDiagnosis !== undefined) {
    payload.suggested_diagnosis = suggestedDiagnosis
  }

  // 2. Salvar notas (caminho crítico — falha aqui retorna erro)
  const { error } = await admin
    .from('consultations')
    .update(payload)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao salvar notas: ' + error.message }

  await logAudit({ action: 'SAVE_VET_NOTES', entity_type: 'consultations', entity_id: consultationId })
  revalidatePath(`/dashboard/vet/${consultationId}`)

  // 3. Auditoria de convênio (caminho advisory — nunca quebra o auto-save)
  let audit: AuditResult | undefined
  if (consRow?.patient_id && vetNotes.trim().length > 50) {
    const result = await runInsuranceAudit({
      consultationId,
      patientId: consRow.patient_id,
      vetNotes,
    })
    if (result) audit = result
  }

  return { success: true, ...(audit ? { audit } : {}) }
}

// ─── Finalizar Consulta (requer is_reviewed_by_vet) ──────────────────────────
export async function finalizeConsultation(
  consultationId: string,
  data: {
    vet_notes: string
    suggested_diagnosis?: string
    next_status: 'completed' | 'waiting_exam' | 'medication'
  }
): Promise<{ success: boolean } | { error: string }> {
  if (!data.vet_notes?.trim()) {
    return { error: 'As notas clínicas são obrigatórias para finalizar a consulta.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const payload: Record<string, any> = {
    vet_notes: data.vet_notes,
    vet_id: profile.id,
    status: data.next_status,
    updated_at: new Date().toISOString(),
  }

  // is_reviewed_by_vet só é true na alta final (CFMV)
  if (data.next_status === 'completed') {
    payload.is_reviewed_by_vet = true
  }

  if (data.suggested_diagnosis) {
    payload.suggested_diagnosis = data.suggested_diagnosis
  }

  const { error } = await admin
    .from('consultations')
    .update(payload)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao finalizar consulta: ' + error.message }

  await logAudit({
    action: 'FINALIZE_CONSULTATION',
    entity_type: 'consultations',
    entity_id: consultationId,
    details: { next_status: data.next_status, is_reviewed_by_vet: data.next_status === 'completed' },
  })

  revalidatePath('/dashboard/vet')
  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}

// ─── Prescrição ───────────────────────────────────────────────────────────────

export async function savePrescription(params: {
  consultation_id:   string
  medication:        string
  dose?:             string
  frequency?:        string        // CFMV obrigatório para controlados
  duration_days?:    number        // CFMV obrigatório para controlados
  is_controlled?:    boolean       // Medicamento controlado (receituário azul)
  prescription_type?: 'standard' | 'blue_receipt' | 'yellow_receipt' | 'special'
  route_of_administration?: 'oral' | 'iv' | 'im' | 'subcutaneo' | 'topico' | 'inalacao' | 'outro'
}): Promise<{ id: string; medication: string; dose: string | null; is_controlled: boolean; prescription_type: string; route_of_administration: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, crmv')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Perfil não encontrado.' }

  const isControlled = params.is_controlled ?? false

  // CFMV: controlados exigem frequência e duração
  if (isControlled) {
    if (!params.frequency?.trim()) return { error: 'CFMV: frequência obrigatória para medicamento controlado.' }
    if (!params.duration_days || params.duration_days <= 0) return { error: 'CFMV: duração em dias obrigatória para medicamento controlado.' }
    if (!profile.crmv) return { error: 'CFMV: cadastre seu CRMV antes de prescrever medicamento controlado.' }
  }

  // Controlados usam rpc_create_prescription (valida CRMV no banco)
  if (isControlled) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_create_prescription', {
      p_clinic_id:       profile.clinic_id,
      p_consultation_id: params.consultation_id,
      p_medication:      params.medication,
      p_dose:            params.dose ?? null,
      p_frequency:       params.frequency!,
      p_duration_days:   params.duration_days!,
      p_is_controlled:   true,
      p_prescription_type: params.prescription_type ?? 'blue_receipt',
    })
    if (rpcError) return { error: 'Erro ao salvar prescrição controlada: ' + rpcError.message }
    return rpcData as { id: string; medication: string; dose: string | null; is_controlled: boolean; prescription_type: string }
  }

  // Não-controlados: insert direto
  const admin = createAdminClient()
  const { data, error } = await admin.from('prescriptions').insert({
    clinic_id:                profile.clinic_id,
    consultation_id:          params.consultation_id,
    medication:               params.medication,
    dose:                     params.dose ?? null,
    frequency:                params.frequency ?? null,
    duration_days:            params.duration_days ?? null,
    is_controlled:            false,
    prescription_type:        params.prescription_type ?? 'standard',
    route_of_administration:  params.route_of_administration ?? 'oral',
  }).select('id, medication, dose, is_controlled, prescription_type, route_of_administration').single()

  if (error) return { error: 'Erro ao salvar prescrição: ' + error.message }
  return data
}
