/**
 * Monta o ResolveContext para o motor Canvas Visual a partir do banco.
 *
 * Centralizado aqui (em vez de na rota de print) porque será reaproveitado
 * por previews em listagens, exports e a tela de edição do vet.
 *
 * Campos disponíveis no contexto seguem os paths declarados em
 * src/lib/canva/dynamic-tags.ts — manter os dois em sincronia.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolveContext } from './dynamic-tags'

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador',
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Técnico',
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  vet_clinic:     'Clínica Veterinária',
  pet_aesthetics: 'Estética Pet',
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
}

/** Extrai cidade/UF do endereço (formato livre).
 *  Heurísticas comuns no DB:
 *  - "Rua X, 123 - Bairro - São Paulo/SP"
 *  - "Av Y - São Paulo - SP"
 *  - cnpj_data.municipio + cnpj_data.uf (preferido quando disponível) */
function extractCityState(
  address: string | null | undefined,
  cnpjData: Record<string, unknown> | null | undefined,
): { city: string; state: string } {
  // Preferência 1: cnpj_data tem municipio/uf (vem da API de CNPJ)
  const cMun = cnpjData?.municipio as string | undefined
  const cUf = cnpjData?.uf as string | undefined
  if (cMun || cUf) return { city: cMun ?? '', state: (cUf ?? '').toUpperCase() }

  // Preferência 2: parse do address — padrão "...Cidade/UF" ou "...Cidade - UF"
  if (!address) return { city: '', state: '' }
  // Padrão "Cidade/UF" no final
  const slashMatch = address.match(/([A-Za-zÀ-ú\s.]+)\s*[\/\-]\s*([A-Z]{2})\s*$/u)
  if (slashMatch) {
    return { city: slashMatch[1].trim(), state: slashMatch[2].trim() }
  }
  return { city: '', state: '' }
}

interface BusinessHourEntry {
  open?: string
  close?: string
  open_morning?: string
  close_morning?: string
  open_afternoon?: string
  close_afternoon?: string
  closed?: boolean
}

const DAY_SHORT: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
}

function formatBusinessHoursLabel(hours: unknown): string {
  if (!hours || typeof hours !== 'object') return ''
  const entries = hours as Record<string, BusinessHourEntry>
  // Agrupa dias com horário idêntico em um único bloco
  const blocks: Array<{ days: string[]; hours: string }> = []
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const e = entries[day]
    if (!e || e.closed) continue
    const hoursStr = e.open && e.close
      ? `${e.open}–${e.close}`
      : (e.open_morning && e.close_afternoon
          ? `${e.open_morning}–${e.close_morning} / ${e.open_afternoon}–${e.close_afternoon}`
          : '')
    if (!hoursStr) continue
    const last = blocks[blocks.length - 1]
    if (last && last.hours === hoursStr) last.days.push(day)
    else blocks.push({ days: [day], hours: hoursStr })
  }
  return blocks.map(b => {
    const range = b.days.length === 1
      ? DAY_SHORT[b.days[0]]
      : `${DAY_SHORT[b.days[0]]}–${DAY_SHORT[b.days[b.days.length - 1]]}`
    return `${range} ${b.hours}`
  }).join(' · ')
}

function calculateAge(birthDate: string | null | undefined): string {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--
  if (years >= 1) return `${years} ano${years > 1 ? 's' : ''}`
  // bebês: meses
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + m
  return `${Math.max(0, months)} mes${months !== 1 ? 'es' : ''}`
}

/**
 * buildPreviewContext — para pré-visualização do template no editor.
 * Usa clínica + vet REAIS do usuário logado (logo, CNPJ, CRMV próprios),
 * mas pet/tutor/consulta são mock fixo (Toby / Maria Silva / data de hoje).
 * Assim o admin vê o layout com os próprios assets sem precisar de uma
 * consulta de verdade aberta.
 */
export async function buildPreviewContext(
  supabase: SupabaseClient,
  clinicId: string,
  userId: string,
): Promise<ResolveContext> {
  const [clinic, vet] = await Promise.all([
    supabase.from('clinics')
      .select('id, name, cnpj, cnpj_data, phone, address, business_type, business_hours, logo_url')
      .eq('id', clinicId).single()
      .then(r => r.data),
    supabase.from('profiles')
      .select('id, full_name, nickname, role, crmv, specialty, specialties, phone, photo_url, electronic_signature_url, mapa_code, username')
      .eq('id', userId).single()
      .then(r => r.data),
  ])

  const now = new Date()

  const mockPet = {
    name: 'Toby',
    species: 'Canino',
    breed: 'Golden Retriever',
    sex: 'Macho',
    age: '4 anos',
    weight: 28.4,
    color: 'Dourado',
    microchip: '900215001234567',
  }

  const mockTutor = {
    name: 'Maria Silva',
    cpf: '12345678900',
    email: 'maria@exemplo.com',
    phone: '11988887777',
    address: 'Rua das Flores, 123',
  }

  const mockConsultation = {
    date: now.toISOString(),
    datetime: now.toISOString(),
    diagnosis: 'Suspeita de cardiopatia hipertrófica',
    complaint: 'Tosse seca persistente há 3 dias',
    weight: 28.4,
    temperature: 38.5,
    visit_reason_label: 'Consulta',
    // Listas para o Repeater
    prescriptions: [
      { medication: 'Dipirona 25mg/mL', dose: '1 mL', frequency: 'a cada 8h', duration_days: 5, route_of_administration: 'oral', prescription_type: 'common', is_controlled: false },
      { medication: 'Tramadol 50mg',    dose: '50 mg', frequency: 'a cada 12h', duration_days: 5, route_of_administration: 'oral', prescription_type: 'controlled', is_controlled: true },
      { medication: 'Pomada Furacin',   dose: 'fina camada', frequency: '3× ao dia', duration_days: 7, route_of_administration: 'topical', prescription_type: 'common', is_controlled: false },
    ],
    exam_items: [
      { name: 'Hemograma completo', urgency: 'rotina' },
      { name: 'Ecocardiograma',     urgency: 'urgente' },
    ],
    vaccines: [
      { name: 'V10 (polivalente)', date: '15/04/2026', next: '15/04/2027' },
    ],
  }

  return {
    patient: mockPet,
    tutor: mockTutor,
    consultation: mockConsultation,
    clinic: clinic ? (() => {
      const { city, state: uf } = extractCityState(
        clinic.address ?? undefined,
        clinic.cnpj_data as Record<string, unknown> | null | undefined,
      )
      return {
        ...clinic,
        city,
        state: uf,
        city_state: city && uf ? `${city}/${uf}` : (city || uf),
        business_type_label: BUSINESS_TYPE_LABELS[clinic.business_type] ?? clinic.business_type,
        business_hours_label: formatBusinessHoursLabel(clinic.business_hours),
        razao_social: (clinic.cnpj_data as { razao_social?: string } | null)?.razao_social ?? clinic.name,
      }
    })() : {},
    vet: vet ? {
      ...vet,
      role_label: ROLE_LABELS[vet.role] ?? vet.role,
      specialty: vet.specialty ?? (Array.isArray(vet.specialties) ? vet.specialties.join(', ') : ''),
    } : {},
  }
}

export async function buildResolveContext(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  consultationId: string,
): Promise<ResolveContext> {
  const [patient, consultation, clinic] = await Promise.all([
    supabase.from('patients')
      .select('id, name, species, breed, gender, neutered, birth_date, microchip, color, tutor_id')
      .eq('id', patientId).single()
      .then(r => r.data),
    supabase.from('consultations')
      .select('id, professional_id, vet_notes, suggested_diagnosis, created_at, weight, vital_signs')
      .eq('id', consultationId).single()
      .then(r => r.data),
    supabase.from('clinics')
      .select('id, name, cnpj, cnpj_data, phone, address, business_type, business_hours, logo_url')
      .eq('id', clinicId).single()
      .then(r => r.data),
  ])

  const tutor = patient?.tutor_id
    ? await supabase.from('tutors')
        .select('id, name, cpf, email, phone, address')
        .eq('id', patient.tutor_id).single()
        .then(r => r.data)
    : null

  const vet = consultation?.professional_id
    ? await supabase.from('profiles')
        .select('id, full_name, nickname, role, crmv, specialty, specialties, phone, photo_url, electronic_signature_url, mapa_code, username')
        .eq('id', consultation.professional_id).single()
        .then(r => r.data)
    : null

  const vitalSigns = (consultation?.vital_signs as Record<string, unknown> | null) ?? null
  const chiefComplaint = typeof vitalSigns?.chief_complaint === 'string' ? vitalSigns.chief_complaint : null

  return {
    patient: patient ? {
      ...patient,
      age: calculateAge(patient.birth_date),
      sex: patient.gender === 'male' ? 'Macho' : patient.gender === 'female' ? 'Fêmea' : 'Indef.',
      weight: consultation?.weight ?? null,
    } : {},

    tutor: tutor ?? {},

    consultation: consultation ? {
      date: consultation.created_at,
      datetime: consultation.created_at,
      diagnosis: consultation.suggested_diagnosis ?? consultation.vet_notes ?? '',
      complaint: chiefComplaint ?? '',
      weight: consultation.weight ?? null,
      temperature: (vitalSigns?.temperature as number | undefined) ?? null,
      visit_reason_label: VISIT_REASON_LABELS[(consultation as Record<string, unknown>).visit_reason as string] ?? '',
    } : {},

    clinic: clinic ? (() => {
      const { city, state: uf } = extractCityState(
        clinic.address ?? undefined,
        clinic.cnpj_data as Record<string, unknown> | null | undefined,
      )
      return {
        ...clinic,
        city,
        state: uf,
        city_state: city && uf ? `${city}/${uf}` : (city || uf),
        business_type_label: BUSINESS_TYPE_LABELS[clinic.business_type] ?? clinic.business_type,
        business_hours_label: formatBusinessHoursLabel(clinic.business_hours),
        razao_social: (clinic.cnpj_data as { razao_social?: string } | null)?.razao_social ?? clinic.name,
      }
    })() : {},

    vet: vet ? {
      ...vet,
      role_label: ROLE_LABELS[vet.role] ?? vet.role,
      specialty: vet.specialty ?? (Array.isArray(vet.specialties) ? vet.specialties.join(', ') : ''),
    } : {},
  }
}
