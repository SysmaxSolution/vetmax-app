'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { VitalSigns } from '@/types'
import { logAudit } from './audit'

// ─── Fila de Triagem (consultations com status = 'triage' — chamados pela recepção) ────
export type TriageQueueItem = {
  id: string
  status: string
  visit_reason: string
  created_at: string
  source?: 'consultation' | 'triage_record'
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

export async function getTriageQueue(): Promise<TriageQueueItem[] | { error: string }> {
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
      patients ( id, name, species, breed, allergies, chronic_diseases, behavior_tags,
        tutors ( id, name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['triage'])
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar fila de triagem: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id: c.id,
    status: c.status,
    visit_reason: c.visit_reason ?? 'consultation',
    created_at: c.created_at,
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
  }))
}

// ─── Obter Consulta Completa para Triagem ────────────────────────────────────
export type TriageConsultationDetail = {
  id: string
  status: string
  visit_reason: string
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
    allergies: string | null
    chronic_diseases: string | null
    gender: string | null
    neutered: boolean
    birth_date: string | null
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
  }
  vital_signs: VitalSigns | null
}

export async function getTriageConsultation(
  consultationId: string
): Promise<TriageConsultationDetail | { error: string }> {
  // Auth check via regular client (respeita cookies de sessão)
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

  // Step 1: busca consultation usando colunas que existem no schema atual
  // (weight, temperature, triage_notes — sem vital_signs JSONB que requer migration 0006)
  const { data: rawConsult, error: rawError } = await admin
    .from('consultations')
    .select('id, status, visit_reason, weight, temperature, triage_notes, patient_id, clinic_id')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  console.log('--- DEBUG TRIAGEM STEP 1 ---', {
    consultationId,
    userClinicId: profile.clinic_id,
    rawError: rawError ? { code: rawError.code, message: rawError.message, hint: rawError.hint } : null,
    rawConsult,
  })

  if (rawError || !rawConsult) {
    return { error: `Step1 falhou: ${rawError?.message ?? 'ID ou clinic_id não encontrado no banco.'}` }
  }

  // Step 2: busca patient
  const { data: rawPatient, error: patientError } = await admin
    .from('patients')
    .select('id, name, species, breed, allergies, chronic_diseases, gender, neutered, birth_date, coat_color, reproductive_status, medical_history, photo_url, behavior_tags, tutor_id')
    .eq('id', rawConsult.patient_id)
    .single()

  console.log('--- DEBUG TRIAGEM STEP 2 ---', {
    patient_id: rawConsult.patient_id,
    patientError: patientError ? { code: patientError.code, message: patientError.message } : null,
    rawPatient,
  })

  if (patientError || !rawPatient) {
    return { error: `Step2 falhou: ${patientError?.message ?? 'patient_id=' + rawConsult.patient_id + ' não encontrado'}` }
  }

  // Step 3: busca tutor
  const { data: rawTutor, error: tutorError } = await admin
    .from('tutors')
    .select('id, name, phone')
    .eq('id', rawPatient.tutor_id)
    .single()

  console.log('--- DEBUG TRIAGEM STEP 3 ---', {
    tutor_id: rawPatient.tutor_id,
    tutorError: tutorError ? { code: tutorError.code, message: tutorError.message } : null,
    rawTutor,
  })

  if (tutorError || !rawTutor) {
    return { error: `Step3 falhou: ${tutorError?.message ?? 'tutor_id=' + rawPatient.tutor_id + ' não encontrado'}` }
  }

  // Reconstrói VitalSigns a partir das colunas antigas do schema
  // triage_notes pode conter JSON (se salvo pelo novo form) ou texto livre
  let vital_signs: VitalSigns | null = null
  if (rawConsult.weight || rawConsult.temperature || rawConsult.triage_notes) {
    let parsedNotes: Partial<VitalSigns> = {}
    try {
      parsedNotes = JSON.parse(rawConsult.triage_notes ?? '')
    } catch {
      // triage_notes é texto livre — usa como chief_complaint
    }
    vital_signs = {
      weight: rawConsult.weight ?? parsedNotes.weight ?? 0,
      temperature: rawConsult.temperature ?? parsedNotes.temperature ?? 0,
      heart_rate: parsedNotes.heart_rate ?? 0,
      respiratory_rate: parsedNotes.respiratory_rate ?? 0,
      mucous_color: parsedNotes.mucous_color ?? 'pink',
      crt: parsedNotes.crt ?? '2s',
      chief_complaint: parsedNotes.chief_complaint ?? rawConsult.triage_notes ?? '',
    }
  }

  return {
    id: rawConsult.id,
    status: rawConsult.status,
    visit_reason: rawConsult.visit_reason,
    patient: {
      id: rawPatient.id,
      name: rawPatient.name,
      species: rawPatient.species,
      breed: rawPatient.breed ?? null,
      allergies: rawPatient.allergies ?? null,
      chronic_diseases: rawPatient.chronic_diseases ?? null,
      gender: rawPatient.gender ?? null,
      neutered: rawPatient.neutered ?? false,
      birth_date: rawPatient.birth_date ?? null,
      coat_color: rawPatient.coat_color ?? null,
      reproductive_status: rawPatient.reproductive_status ?? null,
      medical_history: rawPatient.medical_history ?? null,
      photo_url: rawPatient.photo_url ?? null,
      behavior_tags: Array.isArray(rawPatient.behavior_tags) ? rawPatient.behavior_tags : [],
    },
    tutor: {
      id: rawTutor.id,
      name: rawTutor.name,
      phone: rawTutor.phone ?? '',
    },
    vital_signs,
  }
}

// ─── Triagens Realizadas Hoje ─────────────────────────────────────────────────
export type TriageHistoryItem = {
  id: string
  status: string
  created_at: string
  patient: {
    id: string
    name: string
    species: string
    breed: string | null
  }
  tutor: {
    id: string
    name: string
    phone: string
  }
  vital_signs: VitalSigns | null
}

export async function getTriageHistory(): Promise<TriageHistoryItem[] | { error: string }> {
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
      id, status, created_at, weight, temperature, triage_notes,
      patients ( id, name, species, breed,
        tutors ( id, name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['in_progress', 'waiting_exam', 'medication', 'completed'])
    .gte('updated_at', todayStart.toISOString())
    .order('updated_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar histórico de triagens: ' + error.message }

  return (data ?? []).map((c: any) => {
    // Reconstrói VitalSigns das colunas antigas
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
      created_at: c.created_at,
      patient: {
        id: c.patients?.id ?? '',
        name: c.patients?.name ?? '—',
        species: c.patients?.species ?? '',
        breed: c.patients?.breed ?? null,
      },
      tutor: {
        id: c.patients?.tutors?.id ?? '',
        name: c.patients?.tutors?.name ?? '—',
        phone: c.patients?.tutors?.phone ?? '',
      },
      vital_signs,
    }
  })
}

// ─── Salvar Sinais Vitais e Avançar para Médico Veterinário ──────────────────
export async function submitTriageAndMoveToDoctor(
  consultationId: string,
  vitalSigns: VitalSigns & { template_fields?: Record<string, any>; template_id?: string; transcription?: string }
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

  // TODOS os campos da triagem (inclusive weight/temperature) são
  // configuráveis em Gestão > Configurações > Acesso > Campos
  // Obrigatórios. Se admin desmarcou, recepção pode enviar para o
  // consultório sem preencher esses sinais vitais — o MV completa
  // dentro da consulta. Esta server action espelha a regra do
  // TriageForm client; sem isso o client liberava mas o server
  // bloqueava (UX quebrada).
  const { data: triageSettings } = await admin
    .from('clinic_settings')
    .select('triage_required_fields')
    .eq('clinic_id', profile.clinic_id)
    .single()
  const triageRequiredFields: string[] = Array.isArray(triageSettings?.triage_required_fields)
    ? triageSettings.triage_required_fields
    : ['weight', 'temperature', 'chief_complaint']

  if (triageRequiredFields.includes('weight') && (!vitalSigns.weight || vitalSigns.weight <= 0)) {
    return { error: 'Peso é obrigatório e deve ser > 0.' }
  }
  if (triageRequiredFields.includes('temperature') && (!vitalSigns.temperature || vitalSigns.temperature <= 0)) {
    return { error: 'Temperatura retal é obrigatória e deve ser > 0.' }
  }
  if (triageRequiredFields.includes('chief_complaint') && !vitalSigns.chief_complaint?.trim()) {
    return { error: 'Queixa principal é obrigatória.' }
  }

  // ── Blindagem de status: nunca regredir uma consulta já avançada ───────────
  // Se a consulta já passou da triagem (in_progress, waiting_exam, medication,
  // completed), apenas atualiza os dados sem alterar o status.
  const { data: current } = await admin
    .from('consultations')
    .select('status')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  const TRIAGE_STATUSES = ['reception', 'scheduled', 'triage']
  const shouldAdvance = current && TRIAGE_STATUSES.includes(current.status)

  const { transcription, ...vitalSignsData } = vitalSigns

  const updateData: Record<string, any> = {
    weight:       vitalSignsData.weight,
    temperature:  vitalSignsData.temperature,
    triage_notes: JSON.stringify(vitalSignsData),
    updated_at:   new Date().toISOString(),
    // Só avança status se ainda estiver em triagem/recepção
    ...(shouldAdvance && { status: 'in_progress' }),
  }

  if (transcription) {
    updateData.audio_transcript = transcription
  }

  const { error, count } = await admin
    .from('consultations')
    .update(updateData)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao salvar triagem: ' + error.message }

  // Fallback: se não atualizou nenhuma consulta (ID é de triage_records), atualiza triage_records
  if (count === 0 || !current) {
    const triageUpdateData: Record<string, any> = {
      weight_kg:           vitalSigns.weight,
      temperature_celsius: vitalSigns.temperature,
      anamnesis:           vitalSigns.chief_complaint ?? null,
      status:              'in_progress',
      updated_at:          new Date().toISOString(),
    }
    await admin
      .from('triage_records')
      .update(triageUpdateData)
      .eq('id', consultationId)
      .eq('clinic_id', profile.clinic_id)
  }

  await logAudit({
    action: shouldAdvance ? 'TRIAGE_SUBMIT' : 'TRIAGE_UPDATE',
    entity_type: 'consultations',
    entity_id: consultationId,
    details: { weight: vitalSigns.weight, temperature: vitalSigns.temperature },
  })

  revalidatePath('/dashboard/triage')
  return { success: true }
}

// ─── Extração de Campos por IA a partir de Transcrição de Voz ───────────────

export type TriageExtractionResult = {
  vital_signs:      Partial<VitalSigns>
  vaccines_applied: Array<{
    vaccine_name:  string
    next_due_date: string | null  // YYYY-MM-DD ou null
    notes:         string | null
  }>
}

export async function extractFieldsFromTranscription(
  transcription: string
): Promise<TriageExtractionResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  if (!transcription?.trim()) return { error: 'Transcrição vazia.' }

  const today = new Date().toISOString().split('T')[0]

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  const prompt = `Você é um assistente de triagem veterinária. Analise a transcrição e extraia dois grupos de dados.

CONTEXTO TEMPORAL: Hoje é ${today}.

TRANSCRIÇÃO:
"${transcription}"

Retorne um JSON com exatamente 2 chaves:

1. "vital_signs": objeto com os sinais vitais mencionados. Inclua SOMENTE campos explicitamente mencionados:
   - weight: peso em kg (número decimal, ex: 12.5)
   - temperature: temperatura retal em °C (número decimal, ex: 38.5)
   - heart_rate: frequência cardíaca em bpm (número inteiro)
   - respiratory_rate: frequência respiratória em mov/min (número inteiro)
   - mucous_color: SOMENTE um de: "pink", "pale", "icteric", "cyanotic"
   - crt: SOMENTE um de: "2s", "3s", "4s"
   - chief_complaint: queixa principal em PT-BR (texto livre)

2. "vaccines_applied": array de vacinas mencionadas como aplicadas ou informadas pelo tutor. Detecte frases como "V10 em dia", "tutor informa que vacinou contra raiva", "aplicamos antirrábica", "vacina polivalente". Cada item:
   {"vaccine_name": "nome", "next_due_date": "YYYY-MM-DD ou null", "notes": "observação ou null"}
   Calcule next_due_date baseado em HOJE (${today}) se mencionado "próxima em X meses/semanas". Se não houver vacinas, retorne [].

REGRAS:
- Retorne SOMENTE JSON válido, sem markdown
- vital_signs: inclua apenas campos explícitos, omita os não mencionados
- Para números, use apenas dígitos

Responda SOMENTE com o JSON:`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 768,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  let extracted: Record<string, any> = {}
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0])
  } catch {
    return { error: 'IA não conseguiu extrair campos da transcrição.' }
  }

  const vital_signs: Partial<VitalSigns> = {}
  const raw = extracted.vital_signs ?? extracted  // backwards compat if AI returns flat object
  if (typeof raw.weight === 'number' && raw.weight > 0) vital_signs.weight = raw.weight
  if (typeof raw.temperature === 'number' && raw.temperature > 0) vital_signs.temperature = raw.temperature
  if (typeof raw.heart_rate === 'number' && raw.heart_rate > 0) vital_signs.heart_rate = Math.round(raw.heart_rate)
  if (typeof raw.respiratory_rate === 'number' && raw.respiratory_rate > 0) vital_signs.respiratory_rate = Math.round(raw.respiratory_rate)
  if (['pink', 'pale', 'icteric', 'cyanotic'].includes(raw.mucous_color)) vital_signs.mucous_color = raw.mucous_color as VitalSigns['mucous_color']
  if (['2s', '3s', '4s'].includes(raw.crt)) vital_signs.crt = raw.crt as VitalSigns['crt']
  if (typeof raw.chief_complaint === 'string' && raw.chief_complaint.trim()) vital_signs.chief_complaint = raw.chief_complaint.trim()

  const vaccines_applied = Array.isArray(extracted.vaccines_applied)
    ? extracted.vaccines_applied.filter((v: any) => typeof v.vaccine_name === 'string' && v.vaccine_name.trim())
    : []

  return { vital_signs, vaccines_applied }
}

// ─── Adicionar à Fila de Triagem (cria registro de intenção) ─────────────────
export async function addToTriageQueue(
  params: { chief_complaint: string; patient_id?: string; tutor_id?: string }
): Promise<{ id: string } | { error: string }> {
  if (!params.chief_complaint?.trim()) return { error: 'Queixa principal é obrigatória.' }
  if (!params.patient_id) {
    // Sem patient_id não é possível inserir (FK NOT NULL na tabela triage_records/consultations).
    // Retorna noop — o botão e modal existem, mas a inserção real requer vínculo com pet.
    return { id: 'noop' }
  }

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

  // Insert into triage_records (primary table for E2E tests)
  const { data: trRec, error: trErr } = await admin
    .from('triage_records')
    .insert({
      clinic_id:        profile.clinic_id,
      patient_id:       params.patient_id,
      tutor_id:         params.tutor_id ?? null,
      chief_complaint:  params.chief_complaint,
      status:           'waiting',
    })
    .select('id')
    .single()

  if (trErr && trErr.code !== '42P01') {
    // Table exists but error — also try consultations fallback
    const { data, error } = await admin
      .from('consultations')
      .insert({
        clinic_id:    profile.clinic_id,
        patient_id:   params.patient_id,
        status:       'triage',
        visit_reason: 'consultation',
        triage_notes: params.chief_complaint,
      })
      .select('id')
      .single()
    if (error) return { error: 'Erro ao adicionar à fila: ' + error.message }
    revalidatePath('/dashboard/triage')
    return { id: data.id }
  }

  if (!trErr) {
    revalidatePath('/dashboard/triage')
    return { id: trRec.id }
  }

  // triage_records table doesn't exist — fallback to consultations
  const { data, error } = await admin
    .from('consultations')
    .insert({
      clinic_id:    profile.clinic_id,
      patient_id:   params.patient_id,
      status:       'triage',
      visit_reason: 'consultation',
      triage_notes: params.chief_complaint,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao adicionar à fila: ' + error.message }

  revalidatePath('/dashboard/triage')
  return { id: data.id }
}

// ─── Encaminhar triage_record para Consultório ───────────────────────────────
export async function forwardTriageRecord(
  triageRecordId: string
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
    .from('triage_records')
    .update({ status: 'completed' })
    .eq('id', triageRecordId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao encaminhar triagem: ' + error.message }

  revalidatePath('/dashboard/triage')
  return { success: true }
}

// ─── Buscar triage_record por ID (fallback quando ID não é de consultations) ──
export async function getTriageRecordById(
  triageRecordId: string
): Promise<TriageConsultationDetail | { error: string }> {
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

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('triage_records')
      .select(`
        id, status, chief_complaint, weight_kg, temperature_celsius, anamnesis, created_at,
        patients ( id, name, species, breed, allergies, chronic_diseases, gender, neutered, birth_date, coat_color,
                   reproductive_status, medical_history, photo_url, behavior_tags,
          tutors ( id, name, phone )
        )
      `)
      .eq('id', triageRecordId)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (error || !data) return { error: `Registro de triagem não encontrado: ${error?.message}` }

    const r = data as any
    let vital_signs: VitalSigns | null = null
    if (r.weight_kg || r.temperature_celsius || r.anamnesis) {
      vital_signs = {
        weight:            r.weight_kg ?? 0,
        temperature:       r.temperature_celsius ?? 0,
        heart_rate:        0,
        respiratory_rate:  0,
        mucous_color:      'pink',
        crt:               '2s',
        chief_complaint:   r.anamnesis ?? r.chief_complaint ?? '',
      }
    }

    return {
      id: r.id,
      status: r.status,
      visit_reason: 'consultation',
      patient: {
        id: r.patients?.id ?? '',
        name: r.patients?.name ?? '—',
        species: r.patients?.species ?? '',
        breed: r.patients?.breed ?? null,
        allergies: r.patients?.allergies ?? null,
        chronic_diseases: r.patients?.chronic_diseases ?? null,
        gender: r.patients?.gender ?? null,
        neutered: r.patients?.neutered ?? false,
        birth_date: r.patients?.birth_date ?? null,
        coat_color: r.patients?.coat_color ?? null,
        reproductive_status: r.patients?.reproductive_status ?? null,
        medical_history: r.patients?.medical_history ?? null,
        photo_url: r.patients?.photo_url ?? null,
        behavior_tags: Array.isArray(r.patients?.behavior_tags) ? r.patients.behavior_tags : [],
      },
      tutor: {
        id: r.patients?.tutors?.id ?? '',
        name: r.patients?.tutors?.name ?? '—',
        phone: r.patients?.tutors?.phone ?? '',
      },
      vital_signs,
    }
  } catch (e: any) {
    return { error: `Erro inesperado: ${e?.message}` }
  }
}

// ─── Fila de Triagem a partir de triage_records (status='waiting') ───────────
export async function getTriageRecordsQueue(): Promise<TriageQueueItem[]> {
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
      .from('triage_records')
      .select(`
        id, status, chief_complaint, created_at,
        patients ( id, name, species, breed, allergies, chronic_diseases, behavior_tags,
          tutors ( id, name, phone )
        )
      `)
      .eq('clinic_id', profile.clinic_id)
      .in('status', ['waiting', 'in_progress'])
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return data.map((r: any) => ({
      id: r.id,
      status: r.status,
      visit_reason: 'consultation',
      created_at: r.created_at,
      source: 'triage_record' as const,
      patient: {
        id: r.patients?.id ?? '',
        name: r.patients?.name ?? '—',
        species: r.patients?.species ?? '',
        breed: r.patients?.breed ?? null,
        allergies: r.patients?.allergies ?? null,
        chronic_diseases: r.patients?.chronic_diseases ?? null,
        behavior_tags: Array.isArray(r.patients?.behavior_tags) ? r.patients.behavior_tags : [],
      },
      tutor: {
        id: r.patients?.tutors?.id ?? '',
        name: r.patients?.tutors?.name ?? '—',
        phone: r.patients?.tutors?.phone ?? '',
      },
    }))
  } catch {
    return []
  }
}

// ─── Atualizar Triagem Existente (edição) ────────────────────────────────────
export async function updateTriageVitalSigns(
  consultationId: string,
  vitalSigns: VitalSigns & { template_fields?: Record<string, any>; template_id?: string; transcription?: string }
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

  const { transcription, ...vitalSignsData } = vitalSigns

  const updateData: Record<string, any> = {
    weight: vitalSignsData.weight,
    temperature: vitalSignsData.temperature,
    triage_notes: JSON.stringify(vitalSignsData),
    updated_at: new Date().toISOString(),
  }

  if (transcription) {
    updateData.audio_transcript = transcription
  }

  const { error, count } = await admin
    .from('consultations')
    .update(updateData)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao atualizar triagem: ' + error.message }

  // Fallback: se não atualizou consulta (ID é de triage_records), atualiza triage_records
  if (count === 0) {
    await admin
      .from('triage_records')
      .update({
        weight_kg:           vitalSigns.weight,
        temperature_celsius: vitalSigns.temperature,
        anamnesis:           vitalSigns.chief_complaint ?? null,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', consultationId)
      .eq('clinic_id', profile.clinic_id)
  }

  await logAudit({
    action: 'TRIAGE_EDIT',
    entity_type: 'consultations',
    entity_id: consultationId,
    details: { weight: vitalSigns.weight, temperature: vitalSigns.temperature },
  })

  revalidatePath('/dashboard/triage')
  return { success: true }
}

// ─── Busca de pacientes por nome de pet OU nome de tutor (para modal de triagem) ─
export type TriagePatientSearchResult = {
  id: string
  name: string
  species: string
  tutor: { id: string; name: string; cpf: string; phone: string }
}

export async function searchPatientsForTriage(
  query: string
): Promise<TriagePatientSearchResult[] | { error: string }> {
  if (!query || query.trim().length < 2) return []
  const q = query.trim()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Search tutors by name
  const { data: tutors } = await admin
    .from('tutors')
    .select('id, name, cpf, phone')
    .eq('clinic_id', profile.clinic_id)
    .ilike('name', `%${q}%`)
    .limit(20)

  const tutorIds = (tutors ?? []).map(t => t.id)
  const tutorMap: Record<string, typeof tutors extends (infer T)[] | null ? T : never> = {}
  for (const t of tutors ?? []) tutorMap[t.id] = t

  // Search patients by name OR by tutor_id
  const { data: byName } = await admin
    .from('patients')
    .select('id, name, species, tutor_id')
    .eq('clinic_id', profile.clinic_id)
    .ilike('name', `%${q}%`)
    .limit(20)

  const { data: byTutor } = tutorIds.length > 0
    ? await admin
        .from('patients')
        .select('id, name, species, tutor_id')
        .eq('clinic_id', profile.clinic_id)
        .in('tutor_id', tutorIds)
        .limit(20)
    : { data: [] }

  // Merge deduplicating by id
  const all = [...(byName ?? []), ...(byTutor ?? [])]
  const seen = new Set<string>()
  const unique = all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })

  // Fetch tutors for all found patients
  const allTutorIds = [...new Set(unique.map(p => p.tutor_id))]
  const { data: allTutors } = await admin
    .from('tutors')
    .select('id, name, cpf, phone')
    .in('id', allTutorIds)

  for (const t of allTutors ?? []) tutorMap[t.id] = t

  return unique.map(p => ({
    id: p.id,
    name: p.name,
    species: p.species,
    tutor: tutorMap[p.tutor_id] ?? { id: p.tutor_id, name: '—', cpf: '', phone: '' },
  }))
}

// ─── Update Patient Reproductive Status ─────────────────────────────────────

export async function updatePatientReproductiveStatus(
  patientId: string,
  status: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { error } = await supabase
    .from('patients')
    .update({ reproductive_status: status || null })
    .eq('id', patientId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/triage')
  return { success: true }
}
