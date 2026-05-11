'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPetUpcomingAppointments } from '@/lib/actions/appointments'
import type { ExtractedField } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'checkin'
  | 'triage'
  | 'consultation'
  | 'medication'
  | 'document'
  | 'completed'
  | 'appointment'
  | 'attachment'
  | 'hospitalization_evolution'
  | 'grooming_evolution'
  | 'whatsapp_notification'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: string
  consultation_id?: string
  visit_reason?: string
  vet_name?: string | null
  vet_crmv?: string | null
  performed_by?: string | null
  checkin?: {
    visit_reason: string
    payment_status: string
  }
  triage?: {
    weight: number
    temperature: number
    heart_rate: number
    respiratory_rate: number
    mucous_color: string
    crt: string
    chief_complaint: string
  }
  consultation?: {
    vet_notes: string | null
    suggested_diagnosis: string | null
  }
  medication?: {
    medication_name: string
    dosage: string | null
    route: string | null
    notes: string | null
  }
  document?: {
    id: string
    document_name: string
    template_name: string | null
    template_type: string | null
    content_data: Record<string, any>
    template_extracted_fields: ExtractedField[] | null
  }
  completed?: {
    is_reviewed_by_vet: boolean
  }
  appointment?: {
    id:       string
    datetime: string
    reason:   string
    status:   'scheduled' | 'confirmed'
    notes:    string | null
  }
  attachment?: {
    id:           string
    file_name:    string
    file_type:    string
    signed_url:   string
    storage_path: string
  }
  hospitalization_evolution?: {
    id:                string
    hospitalization_id: string
    improvement_level: 'piorou' | 'estavel' | 'melhorou'
    notes:             string
    medications:       Array<{ name: string; dosage?: string; route?: string }>
    user_name:         string
  }
  grooming_evolution?: {
    id:               string
    session_id:       string
    services_applied: string[]
    products_used:    string[]
    behavior:         string | null
    observations:     string | null
    user_name:        string
  }
  whatsapp_notification?: {
    id:           string
    trigger_type: string
    message:      string
    tutor_name:   string | null
    tutor_phone:  string
  }
}

// Ordem para mesmo timestamp (DESC)
const SORT_ORDER: Record<TimelineEventType, number> = {
  appointment:              -1,
  completed:                 0,
  consultation:              1,
  document:                  2,
  attachment:                3,
  medication:                4,
  triage:                    5,
  checkin:                   6,
  hospitalization_evolution: 7,
  grooming_evolution:        7.5,
  whatsapp_notification:     8,
}

// ─── Server Action ────────────────────────────────────────────────────────────

export async function getPetTimeline(
  petId: string
): Promise<TimelineEvent[] | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Não autenticado.' }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    const clinicId = profile.clinic_id

    // 1. Todas as consultas do pet
    // NOTA: vital_signs NÃO existe no banco — usar weight, temperature, triage_notes
    const { data: consultations, error: cError } = await supabase
      .from('consultations')
      .select(
        'id, status, visit_reason, payment_status, weight, temperature, triage_notes, vet_notes, suggested_diagnosis, is_reviewed_by_vet, vet_id, created_at, updated_at'
      )
      .eq('patient_id', petId)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    if (cError) {
      console.error('[getPetTimeline] consultations query error:', cError)
      return { error: 'Erro ao buscar consultas: ' + cError.message }
    }

    const consultationIds = (consultations ?? []).map(c => c.id)

    // 2. Nomes dos veterinários
    const vetIds = [...new Set(
      consultations.map(c => c.vet_id).filter(Boolean)
    )] as string[]

    // Hospitalizations linked to this pet (for fetching evolution records)
    const { data: hospitalizations } = await supabase
      .from('hospitalizations')
      .select('id')
      .eq('patient_id', petId)
      .eq('clinic_id', clinicId)

    const hospitalizationIds = (hospitalizations ?? []).map(h => h.id)

    // Grooming sessions linked to this pet (for fetching grooming records)
    const { data: groomingSessions } = await supabase
      .from('grooming_sessions')
      .select('id')
      .eq('patient_id', petId)
      .eq('clinic_id', clinicId)

    const groomingSessionIds = (groomingSessions ?? []).map(g => g.id)

    const [vetsResult, medsResult, docsResult, attachResult, hospEvResult, groomEvResult, waResult] = await Promise.all([
      vetIds.length > 0
        ? supabase.from('profiles').select('id, full_name, crmv').in('id', vetIds)
        : Promise.resolve({ data: [], error: null }),
      consultationIds.length > 0
        ? supabase
            .from('applied_medications')
            .select('id, consultation_id, medication_name, dosage, route, notes, created_at')
            .in('consultation_id', consultationIds)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('patient_documents')
        .select('id, consultation_id, document_name, template_name, template_type, template_extracted_fields, content_data, created_at')
        .eq('patient_id', petId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false }),
      supabase
        .from('patient_attachments')
        .select('id, consultation_id, file_name, file_type, file_url, created_at')
        .eq('patient_id', petId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false }),
      hospitalizationIds.length > 0
        ? supabase
            .from('hospitalization_records')
            .select('id, hospitalization_id, improvement_level, notes, medications, user_name, created_at')
            .in('hospitalization_id', hospitalizationIds)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      groomingSessionIds.length > 0
        ? supabase
            .from('grooming_records')
            .select('id, session_id, services_applied, products_used, behavior, observations, user_name, created_at')
            .in('session_id', groomingSessionIds)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      consultationIds.length > 0
        ? supabase
            .from('whatsapp_notifications')
            .select('id, consultation_id, trigger_type, message, tutor_name, tutor_phone, sent_at')
            .in('consultation_id', consultationIds)
            .eq('clinic_id', clinicId)
            .order('sent_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (medsResult.error) {
      console.error('[getPetTimeline] medications query error:', medsResult.error)
    }
    if (docsResult.error) {
      console.error('[getPetTimeline] documents query error:', docsResult.error)
    }
    if (attachResult.error) {
      console.error('[getPetTimeline] attachments query error:', attachResult.error)
    }
    if (hospEvResult.error) {
      console.error('[getPetTimeline] hospitalization_records query error:', hospEvResult.error)
    }
    if (groomEvResult.error) {
      console.error('[getPetTimeline] grooming_records query error:', groomEvResult.error)
    }
    if (waResult.error) {
      console.error('[getPetTimeline] whatsapp_notifications query error:', waResult.error)
    }

    const vetsMap: Record<string, { full_name: string; crmv: string | null }> = {}
    for (const v of vetsResult.data ?? []) {
      vetsMap[v.id] = { full_name: v.full_name, crmv: v.crmv }
    }

    const events: TimelineEvent[] = []

    // 3. Eventos por consulta
    for (const c of consultations) {
      const vet = c.vet_id ? vetsMap[c.vet_id] : null

      // Check-in
      events.push({
        id:              `checkin-${c.id}`,
        type:            'checkin',
        date:            c.created_at,
        consultation_id: c.id,
        visit_reason:    c.visit_reason ?? undefined,
        checkin: {
          visit_reason:   c.visit_reason ?? 'consultation',
          payment_status: c.payment_status ?? 'pending',
        },
      })

      // Triagem (somente se tiver peso ou temperatura)
      if (c.weight || c.temperature) {
        let parsedNotes: Record<string, any> = {}
        try { parsedNotes = JSON.parse(c.triage_notes ?? '') } catch { /* texto livre — ignora */ }

        events.push({
          id:              `triage-${c.id}`,
          type:            'triage',
          date:            c.created_at,
          consultation_id: c.id,
          triage: {
            weight:            c.weight ?? 0,
            temperature:       c.temperature ?? 0,
            heart_rate:        parsedNotes.heart_rate ?? 0,
            respiratory_rate:  parsedNotes.respiratory_rate ?? 0,
            mucous_color:      parsedNotes.mucous_color ?? '',
            crt:               parsedNotes.crt ?? '',
            chief_complaint:   parsedNotes.chief_complaint ?? c.triage_notes ?? '',
          },
        })
      }

      // Prontuário clínico (somente se tiver notas ou diagnóstico)
      if (c.vet_notes || c.suggested_diagnosis) {
        events.push({
          id:              `consultation-${c.id}`,
          type:            'consultation',
          date:            c.updated_at ?? c.created_at,
          consultation_id: c.id,
          visit_reason:    c.visit_reason ?? undefined,
          vet_name:        vet?.full_name ?? null,
          vet_crmv:        vet?.crmv ?? null,
          consultation: {
            vet_notes:           c.vet_notes,
            suggested_diagnosis: c.suggested_diagnosis,
          },
        })
      }

      // Alta
      if (c.status === 'completed') {
        events.push({
          id:              `completed-${c.id}`,
          type:            'completed',
          date:            c.updated_at ?? c.created_at,
          consultation_id: c.id,
          vet_name:        vet?.full_name ?? null,
          completed: {
            is_reviewed_by_vet: c.is_reviewed_by_vet ?? false,
          },
        })
      }
    }

    // 4. Medicações aplicadas
    for (const med of medsResult.data ?? []) {
      events.push({
        id:              `med-${med.id}`,
        type:            'medication',
        date:            med.created_at,
        consultation_id: med.consultation_id,
        medication: {
          medication_name: med.medication_name,
          dosage:          med.dosage,
          route:           med.route,
          notes:           med.notes,
        },
      })
    }

    // 5. Documentos
    for (const doc of docsResult.data ?? []) {
      events.push({
        id:              `doc-${doc.id}`,
        type:            'document',
        date:            doc.created_at,
        consultation_id: doc.consultation_id,
        document: {
          id:                        doc.id,
          document_name:             doc.document_name,
          template_name:             doc.template_name,
          template_type:             doc.template_type,
          content_data:              doc.content_data ?? {},
          template_extracted_fields: doc.template_extracted_fields ?? null,
        },
      })
    }

    // 6. Anexos — signed URLs em paralelo
    const attachRows = attachResult.data ?? []
    const signedResults = await Promise.all(
      attachRows.map(r =>
        supabase.storage.from('clinic-attachments').createSignedUrl(r.file_url, 3600)
      )
    )
    for (let i = 0; i < attachRows.length; i++) {
      const r = attachRows[i]
      events.push({
        id:              `attach-${r.id}`,
        type:            'attachment',
        date:            r.created_at,
        consultation_id: r.consultation_id ?? undefined,
        attachment: {
          id:           r.id,
          file_name:    r.file_name,
          file_type:    r.file_type,
          signed_url:   signedResults[i].data?.signedUrl ?? '',
          storage_path: r.file_url,
        },
      })
    }

    // 7. Evoluções de internação
    for (const ev of hospEvResult.data ?? []) {
      const meds = Array.isArray(ev.medications) ? ev.medications : []
      events.push({
        id:   `hospev-${ev.id}`,
        type: 'hospitalization_evolution',
        date: ev.created_at,
        hospitalization_evolution: {
          id:                ev.id,
          hospitalization_id: ev.hospitalization_id,
          improvement_level: ev.improvement_level as 'piorou' | 'estavel' | 'melhorou',
          notes:             ev.notes ?? '',
          medications:       meds.map((m: any) => ({
            name:   m.medication_name ?? m.name ?? String(m),
            dosage: m.dosage ?? undefined,
            route:  m.route ?? undefined,
          })),
          user_name: ev.user_name ?? '',
        },
      })
    }

    // 8. Evoluções de Banho e Tosa (Grooming)
    for (const gr of groomEvResult.data ?? []) {
      events.push({
        id:   `groomev-${gr.id}`,
        type: 'grooming_evolution',
        date: gr.created_at,
        grooming_evolution: {
          id:               gr.id,
          session_id:       gr.session_id,
          services_applied: Array.isArray(gr.services_applied) ? gr.services_applied : [],
          products_used:    Array.isArray(gr.products_used) ? gr.products_used : [],
          behavior:         gr.behavior ?? null,
          observations:     gr.observations ?? null,
          user_name:        gr.user_name ?? '',
        },
      })
    }

    // 9. Logs de WhatsApp
    for (const wa of waResult.data ?? []) {
      events.push({
        id:              `wa-${wa.id}`,
        type:            'whatsapp_notification',
        date:            wa.sent_at,
        consultation_id: wa.consultation_id ?? undefined,
        whatsapp_notification: {
          id:           wa.id,
          trigger_type: wa.trigger_type,
          message:      wa.message,
          tutor_name:   wa.tutor_name,
          tutor_phone:  wa.tutor_phone,
        },
      })
    }

    // 9. Agendamentos futuros do pet
    const futureAppts = await getPetUpcomingAppointments(petId, clinicId)
    for (const appt of futureAppts) {
      events.push({
        id:   `appt-${appt.id}`,
        type: 'appointment',
        date: appt.appointment_datetime,
        appointment: {
          id:       appt.id,
          datetime: appt.appointment_datetime,
          reason:   appt.reason,
          status:   appt.status as 'scheduled' | 'confirmed',
          notes:    appt.notes,
        },
      })
    }

    // 7. Ordena: mais recente primeiro; mesmo timestamp → por tipo
    events.sort((a, b) => {
      const dt = new Date(b.date).getTime() - new Date(a.date).getTime()
      if (dt !== 0) return dt
      return SORT_ORDER[a.type] - SORT_ORDER[b.type]
    })

    return events
  } catch (err) {
    console.error('[getPetTimeline] unexpected error:', err)
    return { error: 'Erro interno ao carregar histórico.' }
  }
}

// ─── Listagem de Pacientes da Clínica ─────────────────────────────────────────

export type PatientsListItem = {
  id: string
  name: string
  species: string
  breed: string | null
  gender: string | null
  neutered: boolean
  birth_date: string | null
  birth_date_estimated: boolean
  coat_color: string | null
  reproductive_status: string | null
  medical_history: string | null
  photo_url: string | null
  behavior_tags: string[]
  allergies: string | null
  chronic_diseases: string | null
  microchip_id: string | null
  tutor: {
    id:                string
    name:              string | null
    cpf:               string | null
    phone:             string | null
    email?:            string | null
    address?:          string | null
    emergency_contact?: string | null
  }
  last_visit: string | null
}

export async function getPatientsList(
  query?: string
): Promise<PatientsListItem[] | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    // Usa admin para evitar falha de RLS no lookup do clinic_id
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    const clinicId = profile.clinic_id

    let patientsQuery = supabase
      .from('patients')
      .select('id, name, species, breed, gender, neutered, birth_date, birth_date_estimated, coat_color, reproductive_status, medical_history, photo_url, behavior_tags, allergies, chronic_diseases, microchip_id, tutor_id')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('name')

    if (query && query.trim().length >= 2) {
      patientsQuery = patientsQuery.ilike('name', `%${query.trim()}%`)
    }

    const { data: patients, error: pError } = await patientsQuery.limit(100)
    if (pError) return { error: 'Erro ao buscar pacientes: ' + pError.message }
    if (!patients?.length) return []

    // ... dentro de getPatientsList no timeline.ts

    const tutorIds = [...new Set(patients.map(p => p.tutor_id).filter(Boolean))] as string[]
    const { data: tutors } = await supabase
      .from('tutors')
      .select('id, name, cpf, phone, email, address, emergency_contact') // Adicionado address e emergency
      .in('id', tutorIds)

    const tutorMap: Record<string, any> = {}
    for (const t of tutors ?? []) tutorMap[t.id] = t

     

    return patients.map(p => ({
      id:                  p.id,
      name:                p.name,
      species:             p.species,
      breed:               p.breed,
      gender:              p.gender,
      neutered:            p.neutered,
      birth_date:           p.birth_date,
      birth_date_estimated: p.birth_date_estimated ?? false,
      coat_color:           p.coat_color ?? null,
      reproductive_status: p.reproductive_status ?? null,
      medical_history:     p.medical_history ?? null,
      photo_url:           p.photo_url ?? null,
      behavior_tags:       Array.isArray(p.behavior_tags) ? p.behavior_tags : [],
      allergies:           p.allergies ?? null,
      chronic_diseases:    p.chronic_diseases ?? null,
      microchip_id:        p.microchip_id ?? null,
      tutor:               tutorMap[p.tutor_id] ?? { id: p.tutor_id, name: '—', cpf: '', phone: '' },
      last_visit:          null, // preenchido futuramente com join em consultations
    }))
  } catch (err) {
    console.error('[getPatientsList] error:', err)
    return { error: 'Erro ao listar pacientes.' }
  }
}
