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
    } : {},

    clinic: clinic ? {
      ...clinic,
      business_type_label: BUSINESS_TYPE_LABELS[clinic.business_type] ?? clinic.business_type,
      business_hours_label: formatBusinessHoursLabel(clinic.business_hours),
      razao_social: (clinic.cnpj_data as { razao_social?: string } | null)?.razao_social ?? clinic.name,
    } : {},

    vet: vet ? {
      ...vet,
      role_label: ROLE_LABELS[vet.role] ?? vet.role,
      specialty: vet.specialty ?? (Array.isArray(vet.specialties) ? vet.specialties.join(', ') : ''),
    } : {},
  }
}
