'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CreateTutorPayload, CreatePatientPayload } from '@/types'

// ─── Busca inteligente: CPF do Tutor, Nome do Tutor ou Nome do Pet ────────────
export type SearchResult = {
  type: 'tutor_with_patients'
  tutor: { id: string; name: string | null; cpf: string | null; phone: string | null; email: string | null }
  patients: { id: string; name: string; species: string; breed: string | null }[]
}

export async function searchTutorsAndPatients(
  query: string
): Promise<SearchResult[] | { error: string }> {
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

  const q = query.trim()
  if (q.length < 2) return []

  const clinicId = profile.clinic_id

  // Detectar se parece um CPF (só dígitos com 6+ caracteres)
  const isCpf = /^\d{6,}$/.test(q.replace(/\D/g, '')) && q.replace(/\D/g, '').length >= 6
  const cpfDigits = q.replace(/\D/g, '')

  let tutorIds: string[] = []

  if (isCpf) {
    // Busca por CPF do Tutor
    const { data } = await admin
      .from('tutors')
      .select('id')
      .eq('clinic_id', clinicId)
      .ilike('cpf', `${cpfDigits}%`)
      .limit(10)
    tutorIds = (data ?? []).map(r => r.id)
  } else {
    // Busca por nome do Tutor
    const { data: byTutor } = await admin
      .from('tutors')
      .select('id')
      .eq('clinic_id', clinicId)
      .ilike('name', `%${q}%`)
      .limit(10)

    // Busca por nome do Pet → traz os tutor_ids associados
    const { data: byPet } = await admin
      .from('patients')
      .select('tutor_id')
      .eq('clinic_id', clinicId)
      .ilike('name', `%${q}%`)
      .limit(10)

    // Busca por telefone do Tutor (apenas dígitos, mínimo 6)
    const phoneDigits = q.replace(/\D/g, '')
    const { data: byPhone } = phoneDigits.length >= 6
      ? await admin
          .from('tutors')
          .select('id')
          .eq('clinic_id', clinicId)
          .ilike('phone', `%${phoneDigits}%`)
          .limit(10)
      : { data: null }

    const ids = new Set<string>()
    ;(byTutor ?? []).forEach(r => ids.add(r.id))
    ;(byPet ?? []).forEach(r => r.tutor_id && ids.add(r.tutor_id))
    ;(byPhone ?? []).forEach(r => ids.add(r.id))
    tutorIds = [...ids]
  }

  if (tutorIds.length === 0) return []

  // Busca tutores com todos os seus pets
  const { data: tutors, error } = await admin
    .from('tutors')
    .select('id, name, cpf, phone, email')
    .in('id', tutorIds)
    .order('name')

  if (error || !tutors) return { error: 'Erro na busca: ' + error?.message }

  const { data: allPatients } = await admin
    .from('patients')
    .select('id, name, species, breed, tutor_id')
    .eq('clinic_id', clinicId)
    .in('tutor_id', tutorIds)
    .order('name')

  const patientsByTutor = new Map<string, { id: string; name: string; species: string; breed: string | null }[]>()
  ;(allPatients ?? []).forEach(p => {
    if (!patientsByTutor.has(p.tutor_id)) patientsByTutor.set(p.tutor_id, [])
    patientsByTutor.get(p.tutor_id)!.push({ id: p.id, name: p.name, species: p.species, breed: p.breed })
  })

  return tutors.map(t => ({
    type: 'tutor_with_patients' as const,
    tutor: { id: t.id, name: t.name, cpf: t.cpf, phone: t.phone, email: t.email },
    patients: patientsByTutor.get(t.id) ?? [],
  }))
}

// ─── Busca Tutor por CPF (para pré-preenchimento no cadastro) ────────────────
export async function getTutorByCpf(cpf: string): Promise<
  { id: string; name: string | null; cpf: string | null; phone: string | null; email: string | null; address: string | null; emergency_contact: string | null } | null | { error: string }
> {
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

  const cpfDigits = cpf.replace(/\D/g, '')
  if (cpfDigits.length !== 11) return null
  const { data } = await admin
    .from('tutors')
    .select('id, name, cpf, phone, email, address, emergency_contact')
    .eq('clinic_id', profile.clinic_id)
    .eq('cpf', cpfDigits)
    .maybeSingle()

  return data ?? null
}

// ─── Busca Tutor por ID com todos os seus Pets (para perfil) ─────────────────
export async function getTutorWithPatients(tutorId: string): Promise<
  { tutor: { id: string; name: string | null; cpf: string | null; phone: string | null; email: string | null; address: string | null; emergency_contact: string | null }; patients: { id: string; name: string; species: string; breed: string | null; neutered: boolean; gender: string | null; photo_url: string | null }[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

  const { data: tutor, error: tErr } = await admin
    .from('tutors')
    .select('id, name, cpf, phone, email, address, emergency_contact')
    .eq('id', tutorId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (tErr || !tutor) return { error: 'Tutor não encontrado.' }

  const { data: patients } = await admin
    .from('patients')
    .select('id, name, species, breed, neutered, gender, photo_url')
    .eq('tutor_id', tutorId)
    .eq('clinic_id', profile.clinic_id)
    .order('name')

  return { tutor, patients: patients ?? [] }
}

// ─── Cadastro Composto: Tutor + Pet em sequência ──────────────────────────────
export async function registerTutorAndPet(
  tutorData: CreateTutorPayload,
  patientData: Omit<CreatePatientPayload, 'tutor_id'>
): Promise<{ tutorId: string; patientId: string } | { error: string }> {
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

  const clinicId = profile.clinic_id

  if (!patientData.name.trim()) return { error: 'Nome do Pet é obrigatório.' }

  // 1. Salvar Tutor
  //    Com CPF → upsert (encontra existente ou cria novo)
  //    Sem CPF → insert simples (dados incompletos, tutor preenchido depois)
  const cpfDigits = (tutorData.cpf ?? '').replace(/\D/g, '')

  const tutorRow = {
    clinic_id: clinicId,
    name:      tutorData.name?.trim() || null,
    cpf:       cpfDigits.length === 11 ? cpfDigits : null,
    email:     tutorData.email?.trim() || null,
    phone:     tutorData.phone?.trim() || null,
    address:   tutorData.address?.trim() || null,
  }

  let tutor: { id: string } | null = null
  if (cpfDigits.length === 11) {
    const { data, error: tutorErr } = await admin
      .from('tutors')
      .upsert(tutorRow, { onConflict: 'clinic_id,cpf' })
      .select('id')
      .single()
    if (tutorErr || !data) return { error: 'Erro ao salvar Tutor: ' + (tutorErr?.message ?? '') }
    tutor = data
  } else {
    const { data, error: tutorErr } = await admin
      .from('tutors')
      .insert(tutorRow)
      .select('id')
      .single()
    if (tutorErr || !data) return { error: 'Erro ao salvar Tutor: ' + (tutorErr?.message ?? '') }
    tutor = data
  }

  if (!tutor) return { error: 'Erro ao salvar Tutor.' }

  // 2. Inserir Pet vinculado ao Tutor
  const { data: patient, error: patErr } = await admin
    .from('patients')
    .insert({
      clinic_id:       clinicId,
      tutor_id:        tutor.id,
      name:            patientData.name.trim(),
      species:         patientData.species,
      breed:           patientData.breed?.trim() || null,
      gender:          patientData.gender || null,
      neutered:        patientData.neutered ?? false,
      birth_date:      patientData.birth_date || null,
      color:           patientData.color?.trim() || null,
      allergies:       patientData.allergies?.trim() || null,
      past_surgeries:  patientData.past_surgeries?.trim() || null,
      chronic_diseases: patientData.chronic_diseases?.trim() || null,
      notes:           patientData.notes?.trim() || null,
      behavior_tags:   patientData.behavior_tags?.length ? patientData.behavior_tags : [],
    })
    .select('id')
    .single()

  if (patErr || !patient) return { error: 'Erro ao salvar Pet: ' + (patErr?.message ?? '') }

  return { tutorId: tutor.id, patientId: patient.id }
}

// ─── Adicionar novo Pet a Tutor já existente ──────────────────────────────────
export async function addPatientToTutor(
  tutorId: string,
  patientData: Omit<CreatePatientPayload, 'tutor_id'>
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

  if (!patientData.name.trim()) return { error: 'Nome do Pet é obrigatório.' }

  const { data: patient, error } = await admin
    .from('patients')
    .insert({
      clinic_id:       profile.clinic_id,
      tutor_id:        tutorId,
      name:            patientData.name.trim(),
      species:         patientData.species,
      breed:           patientData.breed?.trim() || null,
      gender:          patientData.gender || null,
      neutered:        patientData.neutered ?? false,
      birth_date:      patientData.birth_date || null,
      color:           patientData.color?.trim() || null,
      allergies:       patientData.allergies?.trim() || null,
      past_surgeries:  patientData.past_surgeries?.trim() || null,
      chronic_diseases: patientData.chronic_diseases?.trim() || null,
      notes:           patientData.notes?.trim() || null,
      behavior_tags:   patientData.behavior_tags?.length ? patientData.behavior_tags : [],
    })
    .select('id')
    .single()

  if (error || !patient) return { error: 'Erro ao adicionar Pet: ' + (error?.message ?? '') }
  return { id: patient.id }
}

// ─── Registrar Consentimento LGPD ─────────────────────────────────────────────
export async function recordConsent(
  tutorId: string,
  action: 'granted' | 'revoked' | 'updated' = 'granted'
): Promise<{ success: true; historyId: string } | { error: string }> {
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

  const { data, error } = await supabase.rpc('rpc_record_consent', {
    p_tutor_id:        tutorId,
    p_clinic_id:       profile.clinic_id,
    p_action:          action,
    p_consent_version: '1.0',
  })

  if (error) return { error: 'Erro ao registrar consentimento: ' + error.message }
  return { success: true, historyId: data?.history_id ?? '' }
}
