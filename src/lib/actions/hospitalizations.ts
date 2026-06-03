'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HospitalizationStatus =
  | 'observation'
  | 'ward'
  | 'icu'
  | 'ready_for_discharge'
  | 'discharged'

export type HospitalizationCard = {
  id:              string
  clinic_id:       string
  patient_id:      string
  consultation_id: string | null
  status:          HospitalizationStatus
  reason:          string | null
  notes:           string | null
  created_at:      string
  discharged_at:   string | null
  isolation_required: boolean
  box_id:          string | null
  estimated_discharge: string | null
  patient: {
    id:            string
    name:          string
    species:       string
    breed:         string | null
    birth_date:    string | null
    gender:        string | null
    neutered:      boolean
    coat_color:    string | null
    photo_url:     string | null
    behavior_tags: string[]
  }
  tutor?: {
    name:  string
    phone: string
  }
}

export type HospitalizationBoard = {
  observation:         HospitalizationCard[]
  ward:                HospitalizationCard[]
  icu:                 HospitalizationCard[]
  ready_for_discharge: HospitalizationCard[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClinicId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', userId)
    .single()
  return data?.clinic_id ?? null
}

// ─── Quadro Kanban ────────────────────────────────────────────────────────────

export async function getHospitalizationsBoard(): Promise<HospitalizationBoard | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('hospitalizations')
    .select(`
      id, clinic_id, patient_id, consultation_id, status, reason, notes, created_at, discharged_at,
      isolation_required, box_id, estimated_discharge,
      patients ( id, name, species, breed, birth_date, gender, neutered, coat_color, photo_url, behavior_tags, tutors ( name, phone ) )
    `)
    .eq('clinic_id', clinicId)
    .neq('status', 'discharged')
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar internações: ' + error.message }

  const board: HospitalizationBoard = {
    observation:         [],
    ward:                [],
    icu:                 [],
    ready_for_discharge: [],
  }

  for (const h of data ?? []) {
    const p = h.patients as any
    const t = p?.tutors as any
    const card: HospitalizationCard = {
      id:              h.id,
      clinic_id:       h.clinic_id,
      patient_id:      h.patient_id,
      consultation_id: h.consultation_id ?? null,
      status:          h.status as HospitalizationStatus,
      reason:          h.reason ?? null,
      notes:           h.notes ?? null,
      created_at:      h.created_at,
      discharged_at:   h.discharged_at ?? null,
      isolation_required: (h as any).isolation_required ?? false,
      box_id:          (h as any).box_id ?? null,
      estimated_discharge: (h as any).estimated_discharge ?? null,
      patient: {
        id:            p?.id ?? '',
        name:          p?.name ?? '—',
        species:       p?.species ?? '',
        breed:         p?.breed ?? null,
        birth_date:    p?.birth_date ?? null,
        gender:        p?.gender ?? null,
        neutered:      p?.neutered ?? false,
        coat_color:    p?.coat_color ?? null,
        photo_url:     p?.photo_url ?? null,
        behavior_tags: Array.isArray(p?.behavior_tags) ? p.behavior_tags : [],
      },
      tutor: t ? { name: t.name ?? '—', phone: t.phone ?? '' } : undefined,
    }
    if (h.status in board) {
      board[h.status as keyof HospitalizationBoard].push(card)
    }
  }

  return board
}

// ─── Internar Paciente ────────────────────────────────────────────────────────

export async function createHospitalization(data: {
  patient_id:      string
  consultation_id?: string
  status:          HospitalizationStatus
  reason:          string
  admission_reason_from_transcription?: boolean
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  if (!data.reason.trim()) return { error: 'Motivo da internação é obrigatório.' }

  const admin = createAdminClient()

  // Impede duplicatas: se já existe internação ativa, bloqueia.
  // Se existe uma internação encerrada (saiu para revisão e voltou), REATIVA-a.
  if (data.consultation_id) {
    const { data: active } = await admin
      .from('hospitalizations')
      .select('id')
      .eq('consultation_id', data.consultation_id)
      .neq('status', 'discharged')
      .maybeSingle()
    if (active) return { error: 'Este paciente já possui uma internação ativa.' }

    const { data: previous } = await admin
      .from('hospitalizations')
      .select('id')
      .eq('consultation_id', data.consultation_id)
      .eq('status', 'discharged')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previous) {
      // Reativa o leito existente — todo o histórico de evoluções é preservado
      await admin
        .from('hospitalizations')
        .update({ status: data.status, discharged_at: null, updated_at: new Date().toISOString() })
        .eq('id', previous.id)
      revalidatePath('/dashboard/hospitalization')
      revalidatePath('/dashboard/vet')
      return { id: previous.id }
    }
  }

  const { data: result, error } = await admin
    .from('hospitalizations')
    .insert({
      clinic_id:                          clinicId,
      patient_id:                         data.patient_id,
      consultation_id:                    data.consultation_id ?? null,
      status:                             data.status,
      reason:                             data.reason.trim(),
      admission_reason:                   data.reason.trim(),
      admission_reason_from_transcription: data.admission_reason_from_transcription ?? false,
    })
    .select('id')
    .single()

  if (error || !result) return { error: 'Erro ao internar paciente: ' + (error?.message ?? '') }

  // Remove o paciente do Kanban de Consultório atualizando o status da consulta
  if (data.consultation_id) {
    const { error: updateErr } = await admin
      .from('consultations')
      .update({ status: 'hospitalized' })
      .eq('id', data.consultation_id)
      .eq('clinic_id', clinicId)
    if (updateErr) return { error: 'Internação criada, mas falha ao atualizar fila: ' + updateErr.message }
  }

  await logAudit({ action: 'CREATE_HOSPITALIZATION', entity_type: 'hospitalizations', entity_id: result.id, details: { patient_id: data.patient_id, status: data.status, reason: data.reason } })

  revalidatePath('/dashboard/hospitalization')
  revalidatePath('/dashboard/vet')
  return { id: result.id }
}

// ─── Mover Card entre Colunas ─────────────────────────────────────────────────

export async function updateHospitalizationStatus(
  id:     string,
  status: HospitalizationStatus
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const payload: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'discharged') {
    payload.discharged_at = new Date().toISOString()
  }

  const { error } = await admin
    .from('hospitalizations')
    .update(payload)
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao mover internação: ' + error.message }

  await logAudit({ action: 'UPDATE_HOSPITALIZATION_STATUS', entity_type: 'hospitalizations', entity_id: id, details: { status } })

  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Ocupação para o Dashboard ────────────────────────────────────────────────

export async function getHospitalizationOccupancy(): Promise<
  { active: number; by_status: Record<string, number> } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('hospitalizations')
    .select('status')
    .eq('clinic_id', clinicId)
    .neq('status', 'discharged')

  if (error) return { error: error.message }

  const by_status: Record<string, number> = {}
  for (const h of data ?? []) {
    by_status[h.status] = (by_status[h.status] ?? 0) + 1
  }

  return { active: data?.length ?? 0, by_status }
}
// ─── Evolução Clínica (Registos Diários) ──────────────────────────────────────

export type StructuredMed = {
  name: string
  dose: string
  route: string
  notes: string
}

export type HospitalizationRecord = {
  id: string
  hospitalization_id: string
  user_name: string
  notes: string
  medications: StructuredMed[] // Agora é um array estruturado
  improvement_level: 'piorou' | 'estavel' | 'melhorou'
  created_at: string
}

export async function addClinicalEvolution(data: {
  hospitalization_id: string
  notes: string
  medications: StructuredMed[]
  improvement_level: 'piorou' | 'estavel' | 'melhorou'
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase.from('profiles').select('full_name, clinic_id').eq('id', user.id).single()
  const admin = createAdminClient()
  
  const { data: insertedRecord, error } = await admin.from('hospitalization_records').insert({
    hospitalization_id: data.hospitalization_id,
    clinic_id:         profile?.clinic_id,
    user_id:           user.id,
    user_name:         profile?.full_name ?? 'Veterinário',
    notes:             data.notes,
    medications:       data.medications, // Array JSONB vai direto
    improvement_level: data.improvement_level,
  }).select('id').single()

  if (error) return { error: 'Erro ao salvar evolução: ' + error.message }

  // Abatimento automático de estoque para cada medicação da evolução
  if (profile?.clinic_id && insertedRecord?.id && data.medications.length > 0) {
    const { deductStockForMedication } = await import('./stock')
    for (const med of data.medications) {
      if (med.name?.trim()) {
        await deductStockForMedication({
          clinicId:       profile.clinic_id,
          userId:         user.id,
          medicationName: med.name,
          source:         'HOSPITALIZATION',
          referenceId:    insertedRecord.id,
        })
      }
    }
  }

  // I-01: Verificar regras de transição automática
  if (profile?.clinic_id) {
    const { data: hosp } = await admin
      .from('hospitalizations')
      .select('status')
      .eq('id', data.hospitalization_id)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (hosp?.status) {
      // Verificar regra específica da clínica; fallback para regras padrão
      const { data: rule } = await admin
        .from('hospitalization_transitions')
        .select('to_status')
        .eq('clinic_id', profile.clinic_id)
        .eq('from_status', hosp.status)
        .eq('evolution_status', data.improvement_level)
        .eq('enabled', true)
        .maybeSingle()

      // Regras padrão (se não houver configuração da clínica)
      const DEFAULT_RULES: Record<string, Record<string, string>> = {
        icu:         { melhorou: 'ward' },
        ward:        { melhorou: 'ready_for_discharge', piorou: 'icu' },
        observation: { melhorou: 'ward', piorou: 'icu' },
      }
      const toStatus = rule?.to_status ?? DEFAULT_RULES[hosp.status]?.[data.improvement_level]

      if (toStatus && toStatus !== hosp.status) {
        await admin
          .from('hospitalizations')
          .update({ status: toStatus, updated_at: new Date().toISOString() })
          .eq('id', data.hospitalization_id)
          .eq('clinic_id', profile.clinic_id)

        await logAudit({
          action:      'AUTO_TRANSITION_HOSPITALIZATION',
          entity_type: 'hospitalizations',
          entity_id:   data.hospitalization_id,
          details:     { from: hosp.status, to: toStatus, trigger: data.improvement_level },
        })
      }
    }
  }

  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Log de Movimentações ─────────────────────────────────────────────────────

export async function addHospitalizationLog(data: {
  hospitalization_id: string
  from_status:        HospitalizationStatus | string
  to_status:          HospitalizationStatus | string
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { error } = await admin.from('hospitalization_logs').insert({
    clinic_id:          profile.clinic_id,
    hospitalization_id: data.hospitalization_id,
    user_name:          profile.full_name ?? 'Usuário',
    from_status:        data.from_status,
    to_status:          data.to_status,
  })

  if (error) return { error: 'Erro ao registrar log: ' + error.message }
  return { success: true }
}

// ─── Alta Definitiva ──────────────────────────────────────────────────────────

export async function confirmDischarge(
  hospitalizationId: string,
  consultationId:    string | null
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const now   = new Date().toISOString()

  const { error: hospErr } = await admin
    .from('hospitalizations')
    .update({ status: 'discharged', discharged_at: now, discharge_at: now, updated_at: now })
    .eq('id', hospitalizationId)
    .eq('clinic_id', clinicId)

  if (hospErr) return { error: 'Erro ao encerrar internação: ' + hospErr.message }

  if (consultationId) {
    await admin
      .from('consultations')
      .update({ status: 'completed' })
      .eq('id', consultationId)
      .eq('clinic_id', clinicId)
  }

  await logAudit({ action: 'DISCHARGE', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: { consultation_id: consultationId } })

  revalidatePath('/dashboard/hospitalization')
  revalidatePath('/dashboard/vet')
  return { success: true }
}

// ─── Ficha Enriquecida (Internação Completa) ──────────────────────────────────

export interface HospClinicalData {
  box_id:              string | null
  estimated_discharge: string | null
  diet_notes:          string | null
  fasting:             boolean
  isolation_required:  boolean
  weight_at_admission: number | null
  personal_belongings: string | null
  care_level:          'enfermaria' | 'semi_intensiva' | 'uti' | 'isolamento' | null
  animal_size:         'small' | 'medium' | 'large' | null
}

export async function getHospitalizationClinicalData(hospitalizationId: string): Promise<HospClinicalData | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalizations')
    .select('box_id, estimated_discharge, diet_notes, fasting, isolation_required, weight_at_admission, personal_belongings, care_level, animal_size')
    .eq('id', hospitalizationId).eq('clinic_id', clinicId).single()
  if (error || !data) return { error: 'Internação não encontrada.' }
  return {
    box_id:              (data.box_id as string | null) ?? null,
    estimated_discharge: (data.estimated_discharge as string | null) ?? null,
    diet_notes:          (data.diet_notes as string | null) ?? null,
    fasting:             data.fasting === true,
    isolation_required:  data.isolation_required === true,
    weight_at_admission: data.weight_at_admission === null || data.weight_at_admission === undefined ? null : Number(data.weight_at_admission),
    personal_belongings: (data.personal_belongings as string | null) ?? null,
    care_level:          (data.care_level as HospClinicalData['care_level']) ?? null,
    animal_size:         (data.animal_size as HospClinicalData['animal_size']) ?? null,
  }
}


/**
 * Atualiza os dados clínicos/operacionais da internação (ficha enriquecida):
 * leito/box, previsão de alta, dieta, jejum, isolamento (Regra 2), peso de
 * admissão e pertences. Campos da migration 0196.
 */
export async function updateHospitalizationClinicalData(
  hospitalizationId: string,
  fields: {
    box_id?:              string | null
    estimated_discharge?: string | null
    diet_notes?:          string | null
    fasting?:             boolean
    isolation_required?:  boolean
    weight_at_admission?: number | null
    personal_belongings?: string | null
    care_level?:          'enfermaria' | 'semi_intensiva' | 'uti' | 'isolamento' | null
    animal_size?:         'small' | 'medium' | 'large' | null
  }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('box_id'              in fields) patch.box_id              = fields.box_id || null
  if ('estimated_discharge' in fields) patch.estimated_discharge = fields.estimated_discharge || null
  if ('diet_notes'          in fields) patch.diet_notes          = fields.diet_notes?.trim() || null
  if ('fasting'             in fields) patch.fasting             = fields.fasting === true
  if ('isolation_required'  in fields) patch.isolation_required  = fields.isolation_required === true
  if ('weight_at_admission' in fields) patch.weight_at_admission = (fields.weight_at_admission === null || fields.weight_at_admission === undefined || Number.isNaN(fields.weight_at_admission)) ? null : Number(fields.weight_at_admission)
  if ('personal_belongings' in fields) patch.personal_belongings = fields.personal_belongings?.trim() || null
  if ('care_level'          in fields) patch.care_level          = fields.care_level ?? null
  if ('animal_size'         in fields) patch.animal_size         = fields.animal_size ?? null

  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalizations')
    .update(patch)
    .eq('id', hospitalizationId)
    .eq('clinic_id', clinicId)
  if (error) return { error: 'Erro ao salvar dados clínicos: ' + error.message }

  // Propaga weight_at_admission para patients.last_known_weight
  if (fields.weight_at_admission && fields.weight_at_admission > 0) {
    const { data: hosp } = await admin
      .from('hospitalizations')
      .select('patient_id')
      .eq('id', hospitalizationId)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (hosp?.patient_id) {
      const { updatePatientWeight } = await import('./patient-weight')
      updatePatientWeight({
        patient_id: hosp.patient_id as string,
        weight_kg:  fields.weight_at_admission,
        source:     'hospitalization',
      }).catch(() => {})
    }
  }

  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Central de Documentos ────────────────────────────────────────────────────

export type HospDocument = {
  id:                 string
  hospitalization_id: string
  file_name:          string
  file_type:          string  // 'pdf' | 'image' | 'other'
  storage_path:       string
  user_name:          string
  created_at:         string
  title?:             string | null
  document_date?:     string | null
  notes?:             string | null
}

export type HospDocumentMetadata = {
  title?:         string | null
  document_date?: string | null
  notes?:         string | null
}

export async function getHospitalizationDocuments(
  hospitalizationId: string
): Promise<HospDocument[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data, error } = await supabase
    .from('hospitalization_documents')
    .select('id, hospitalization_id, file_name, file_type, storage_path, user_name, created_at, title, document_date, notes')
    .eq('hospitalization_id', hospitalizationId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return (data ?? []) as HospDocument[]
}

export async function saveHospitalizationDocument(data: {
  hospitalization_id: string
  file_name:          string
  file_type:          string
  storage_path:       string
  title?:             string | null
  document_date?:     string | null
  notes?:             string | null
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const { data: doc, error } = await admin
    .from('hospitalization_documents')
    .insert({
      clinic_id:          profile.clinic_id,
      hospitalization_id: data.hospitalization_id,
      file_name:          data.file_name,
      file_type:          data.file_type,
      storage_path:       data.storage_path,
      user_id:            user.id,
      user_name:          profile.full_name ?? 'Usuário',
      title:              data.title?.trim() || null,
      document_date:      data.document_date || null,
      notes:              data.notes?.trim() || null,
    })
    .select('id')
    .single()

  if (error || !doc) return { error: 'Erro ao salvar documento: ' + (error?.message ?? '') }

  // Log automático no feed da Linha do Tempo (prioriza título se informado)
  const displayName = data.title?.trim() || data.file_name
  const noteSuffix  = data.notes?.trim() ? ` — ${data.notes.trim()}` : ''
  await admin.from('hospitalization_records').insert({
    hospitalization_id: data.hospitalization_id,
    clinic_id:          profile.clinic_id,
    user_id:            user.id,
    user_name:          profile.full_name ?? 'Usuário',
    notes:              `📎 Documento "${displayName}" anexado.${noteSuffix}`,
    medications:        [],
    improvement_level:  'estavel',
  })

  revalidatePath('/dashboard/hospitalization')
  return { id: doc.id }
}

export async function updateHospitalizationDocumentMetadata(
  docId:    string,
  metadata: HospDocumentMetadata,
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
    .from('hospitalization_documents')
    .update({
      title:         metadata.title?.trim() || null,
      document_date: metadata.document_date || null,
      notes:         metadata.notes?.trim() || null,
    })
    .eq('id', docId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao atualizar metadados: ' + error.message }

  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

export async function deleteHospitalizationDocument(
  docId:       string,
  storagePath: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // Verifica posse via RLS antes de usar admin
  const { data: doc } = await supabase
    .from('hospitalization_documents')
    .select('id')
    .eq('id', docId)
    .single()

  if (!doc) return { error: 'Documento não encontrado ou sem permissão.' }

  const admin = createAdminClient()

  const { error: storageErr } = await admin.storage
    .from('clinical-documents')
    .remove([storagePath])

  if (storageErr) return { error: 'Erro ao remover arquivo: ' + storageErr.message }

  const { error: dbErr } = await admin
    .from('hospitalization_documents')
    .delete()
    .eq('id', docId)

  if (dbErr) return { error: 'Erro ao remover registro: ' + dbErr.message }

  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Feed de Internação para Revisão Pós-Internação ──────────────────────────

export type InternationFeedData = {
  id:            string
  reason:        string | null
  created_at:    string
  discharged_at: string | null
  records:       HospitalizationRecord[]
}

export async function getHospitalizationByConsultation(
  consultationId: string
): Promise<InternationFeedData | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: hosp, error } = await supabase
    .from('hospitalizations')
    .select('id, reason, created_at, discharged_at')
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!hosp)  return { error: 'Internação não encontrada.' }

  const { data: recs, error: recErr } = await supabase
    .from('hospitalization_records')
    .select('id, hospitalization_id, user_name, notes, medications, improvement_level, created_at')
    .eq('hospitalization_id', hosp.id)
    .order('created_at', { ascending: false })

  if (recErr) return { error: recErr.message }

  return {
    id:            hosp.id,
    reason:        hosp.reason,
    created_at:    hosp.created_at,
    discharged_at: hosp.discharged_at,
    records:       (recs ?? []) as HospitalizationRecord[],
  }
}

// ─── Revisão Clínica Pós-Internação ──────────────────────────────────────────

export async function sendToVetReview(
  hospitalizationId: string,
  consultationId:    string | null
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const clinicId = await getClinicId(supabase, user.id)
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const now   = new Date().toISOString()

  // Libera o leito (encerra a internação)
  const { error: hospErr } = await admin
    .from('hospitalizations')
    .update({ status: 'discharged', discharged_at: now, discharge_at: now, updated_at: now })
    .eq('id', hospitalizationId)
    .eq('clinic_id', clinicId)

  if (hospErr) return { error: 'Erro ao encerrar internação: ' + hospErr.message }

  // Devolve o animal para a fila do MV
  if (consultationId) {
    const { error: consErr } = await admin
      .from('consultations')
      .update({ status: 'revisao_pos_internacao' })
      .eq('id', consultationId)
      .eq('clinic_id', clinicId)

    if (consErr) return { error: 'Internação encerrada, mas falha ao mover para revisão: ' + consErr.message }
  }

  revalidatePath('/dashboard/hospitalization')
  revalidatePath('/dashboard/vet')
  return { success: true }
}