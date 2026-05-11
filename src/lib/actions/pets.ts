'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import type { PatientSpecies } from '@/types'

// ─── Cadastro Atômico: Pet + Tutor + Vacinas + Convênio ───────────────────────

export type CreateFullPatientInput = {
  tutor: {
    id?: string          // se já existente (add_pet_to_tutor ou CPF encontrado)
    name?: string
    cpf?: string
    phone?: string
    email?: string
    address?: string
  }
  pet: {
    name: string
    species: PatientSpecies
    breed?: string
    reproductive_status?: string
    behavior_tags?: string[]
  }
  vaccines?: {
    vaccine_name: string
    date_administered?: string
    next_due_date?: string
    notes?: string
  }[]
  insurance?: {
    provider_id: string
    plan_type: string
    member_id: string
    coverage_status: 'active' | 'suspended' | 'cancelled'
  }
}

export async function createFullPatient(
  input: CreateFullPatientInput
): Promise<{ tutorId: string; patientId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const clinicId = profile.clinic_id
  const admin = createAdminClient()

  // 1. Resolver tutor (existente ou criar)
  let tutorId = input.tutor.id ?? null

  if (!tutorId) {
    const cpfDigits = (input.tutor.cpf ?? '').replace(/\D/g, '')
    if (cpfDigits.length !== 11)   return { error: 'CPF inválido — deve ter 11 dígitos.' }
    if (!input.tutor.name?.trim()) return { error: 'Nome do Tutor é obrigatório.' }
    if (!input.tutor.phone?.trim()) return { error: 'Celular do Tutor é obrigatório.' }

    const { data: tutor, error: tutorErr } = await admin
      .from('tutors')
      .upsert(
        {
          clinic_id: clinicId,
          name:      input.tutor.name.trim(),
          cpf:       cpfDigits,
          phone:     input.tutor.phone.trim(),
          email:     input.tutor.email?.trim() || null,
          address:   input.tutor.address?.trim() || null,
        },
        { onConflict: 'clinic_id,cpf' }
      )
      .select('id')
      .single()

    if (tutorErr || !tutor) return { error: 'Erro ao salvar Tutor: ' + (tutorErr?.message ?? '') }
    tutorId = tutor.id
  }

  // 2. Inserir Pet
  const { data: pet, error: petErr } = await admin
    .from('patients')
    .insert({
      clinic_id:           clinicId,
      tutor_id:            tutorId,
      name:                input.pet.name.trim(),
      species:             input.pet.species,
      breed:               input.pet.breed?.trim() || null,
      reproductive_status: input.pet.reproductive_status || null,
      behavior_tags:       input.pet.behavior_tags?.length ? input.pet.behavior_tags : [],
    })
    .select('id')
    .single()

  if (petErr || !pet) return { error: 'Erro ao salvar Pet: ' + (petErr?.message ?? '') }
  const patientId = pet.id

  // 3. Inserir vacinas (se houver)
  if (input.vaccines?.length) {
    const vaccineRows = input.vaccines.map(v => ({
      clinic_id:         clinicId,
      patient_id:        patientId,
      vaccine_name:      v.vaccine_name,
      date_administered: v.date_administered ?? new Date().toISOString().split('T')[0],
      next_due_date:     v.next_due_date ?? null,
      notes:             v.notes ?? null,
    }))
    const { error: vaccErr } = await admin.from('patient_vaccines').insert(vaccineRows)
    if (vaccErr) return { error: 'Erro ao registrar vacinas: ' + vaccErr.message }
  }

  // 4. Inserir convênio (se houver)
  if (input.insurance?.provider_id) {
    const { error: insErr } = await admin.from('pet_insurance').upsert(
      {
        clinic_id:       clinicId,
        patient_id:      patientId,
        tutor_id:        tutorId,
        provider_id:     input.insurance.provider_id,
        plan_type:       input.insurance.plan_type,
        member_id:       input.insurance.member_id,
        coverage_status: input.insurance.coverage_status,
      },
      { onConflict: 'clinic_id,patient_id' }
    )
    if (insErr) return { error: 'Erro ao registrar convênio: ' + insErr.message }
  }

  await logAudit({
    action: 'CREATE_FULL_PATIENT',
    entity_type: 'patients',
    entity_id: patientId,
    details: { tutorId, hasVaccines: !!(input.vaccines?.length), hasInsurance: !!input.insurance?.provider_id },
  })

  revalidatePath('/dashboard/patients')
  return { tutorId: tutorId!, patientId }
}

export interface UpdatePetData {
  name?:                  string
  species?:               string
  breed?:                 string | null
  birth_date?:            string | null
  birth_date_estimated?:  boolean
  coat_color?:            string | null
  reproductive_status?:   string | null
  medical_history?:       string | null
  photo_url?:             string | null
  behavior_tags?:         string[]
  allergies?:             string | null
  chronic_diseases?:      string | null
  microchip_id?:          string | null
}

export async function updatePetProfile(
  petId: string,
  data: UpdatePetData
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    // Montar objeto de update apenas com os campos fornecidos
    const updateObj: Record<string, unknown> = { ...data }
    if ('photo_url' in data) updateObj.photo_url = data.photo_url ?? null
    if (data.behavior_tags !== undefined) updateObj.behavior_tags = data.behavior_tags

    const adminC = createAdminClient()
    const { error } = await adminC
      .from('patients')
      .update(updateObj)
      .eq('id', petId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: 'Erro ao atualizar cadastro: ' + error.message }

    await logAudit({ action: 'UPDATE_PET', entity_type: 'patients', entity_id: petId, details: data })

    revalidatePath('/dashboard/patients')
    return { success: true }
  } catch (err) {
    console.error('[updatePetProfile] error:', err)
    return { error: 'Erro inesperado ao atualizar cadastro.' }
  }
}

// ─── Cadastro Vivo — atualiza behavior_tags e vacinas via IA ─────────────────

export async function updatePatientFromLiveReg(
  petId: string,
  consultationId: string,
  data: { vaccines: { name: string; date: string }[]; behavior: string[] }
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    // Merge behavior_tags com as existentes (sem duplicatas)
    if (data.behavior.length > 0) {
      const { data: current } = await supabase
        .from('patients')
        .select('behavior_tags')
        .eq('id', petId)
        .eq('clinic_id', profile.clinic_id)
        .single()

      const existing: string[] = current?.behavior_tags ?? []
      const merged = Array.from(new Set([...existing, ...data.behavior]))

      const { error: tagErr } = await supabase
        .from('patients')
        .update({ behavior_tags: merged })
        .eq('id', petId)
        .eq('clinic_id', profile.clinic_id)

      if (tagErr) return { error: 'Erro ao atualizar comportamento: ' + tagErr.message }

      await logAudit({ action: 'UPDATE_PET_LIVE_REG', entity_type: 'patients', entity_id: petId, details: { behavior_tags: data.behavior, consultation_id: consultationId } })
    }

    // Inserir vacinas históricas extraídas pela IA
    for (const v of data.vaccines) {
      const { error: vaccErr } = await supabase
        .from('patient_vaccines')
        .insert({
          patient_id:        petId,
          consultation_id:   consultationId,
          clinic_id:         profile.clinic_id,
          vaccine_name:      v.name,
          date_administered: v.date || new Date().toISOString().split('T')[0],
        })
      if (vaccErr) return { error: 'Erro ao inserir vacina: ' + vaccErr.message }
    }

    revalidatePath('/dashboard/vet')
    return { success: true }
  } catch (err) {
    console.error('[updatePatientFromLiveReg] error:', err)
    return { error: 'Erro inesperado ao atualizar cadastro.' }
  }
}

// ─── Upload de Foto do Pet ─────────────────────────────────────────────────────

export async function uploadPetPhoto(
  petId: string,
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const file = formData.get('file') as File | null
  if (!file || !file.name) return { error: 'Nenhum arquivo enviado.' }
  if (file.size === 0) return { error: 'Arquivo vazio.' }
  if (file.size > 5_242_880) return { error: 'Foto deve ter menos de 5 MB.' }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) return { error: 'Formato inválido. Use JPG, PNG ou WebP.' }

  // Salvar em /avatars/clinic_id/pet_id.ext
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `avatars/${profile.clinic_id}/${petId}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upsert (substitui foto anterior)
  const { error: uploadErr } = await supabase.storage
    .from('clinic-attachments')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadErr) return { error: 'Erro no upload: ' + uploadErr.message }

  // Gerar URL pública assinada (1 ano = 31536000s)
  const { data: signed } = await supabase.storage
    .from('clinic-attachments')
    .createSignedUrl(storagePath, 31536000)

  if (!signed?.signedUrl) return { error: 'Erro ao gerar URL da foto.' }

  // Salvar a URL no cadastro do pet
  const { error: dbErr } = await supabase
    .from('patients')
    .update({ photo_url: signed.signedUrl })
    .eq('id', petId)
    .eq('clinic_id', profile.clinic_id)

  if (dbErr) return { error: 'Erro ao salvar URL da foto: ' + dbErr.message }

  revalidatePath('/dashboard/patients')
  return { url: signed.signedUrl }
}
export interface UpdateTutorData {
  name?: string
  phone?: string
  cpf?: string
  email?: string
  address?: string | null
  emergency_contact?: string | null
}

// ─── Soft Delete de Pet com Motivo (G-05) ────────────────────────────────────

export async function softDeletePatient(
  patientId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  if (!reason.trim()) return { error: 'Motivo do arquivamento é obrigatório.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  // Bloquear se houver consulta ativa (não concluída / não cancelada)
  const { data: active } = await supabase
    .from('consultations')
    .select('id')
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .not('status', 'in', '("completed","cancelled")')
    .limit(1)
    .maybeSingle()

  if (active) return { error: 'O pet possui atendimento ativo. Conclua ou cancele antes de arquivar.' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('patients')
    .update({ deleted_at: now, delete_reason: reason.trim() })
    .eq('id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .is('deleted_at', null)

  if (error) return { error: 'Erro ao arquivar pet: ' + error.message }

  await logAudit({
    action:      'SOFT_DELETE_PATIENT',
    entity_type: 'patients',
    entity_id:   patientId,
    details:     { reason: reason.trim(), deleted_at: now },
  })

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  return { success: true }
}

export async function updateFullProfile(
  petId: string,
  tutorId: string,
  petData: Partial<UpdatePetData>,
  tutorData: Partial<UpdateTutorData>
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    // 1. Atualiza o Pet com filtro clinic_id
    const { error: pErr } = await supabase
      .from('patients')
      .update(petData)
      .eq('id', petId)
      .eq('clinic_id', profile.clinic_id)

    if (pErr) throw new Error(`Erro Pet: ${pErr.message}`)

    // 2. Atualiza o Tutor com filtro clinic_id
    const { error: tErr } = await supabase
      .from('tutors')
      .update(tutorData)
      .eq('id', tutorId)
      .eq('clinic_id', profile.clinic_id)

    if (tErr) throw new Error(`Erro Tutor: ${tErr.message}`)

    await logAudit({ action: 'UPDATE_FULL_PROFILE', entity_type: 'patients', entity_id: petId, details: { petData, tutorId } })

    revalidatePath('/dashboard/patients')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('Falha na atualização:', message)
    return { error: message }
  }
}