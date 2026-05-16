'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicVaccineRecord {
  id:                string
  vaccine_name:      string
  date_administered: string
  next_due_date:     string | null
  notes:             string | null
}

export interface PublicPatientVaccineData {
  petName:     string
  petSpecies:  string
  clinicName:  string
  clinicPhone: string | null
  clinicLogo:  string | null
  vaccines:    PublicVaccineRecord[]
  nextDue:     { vaccine: string; date: string } | null
}

// ─── Public — sem autenticação, usa admin para RLS bypass ────────────────────

/**
 * Dados públicos de vacinação de um pet — acesso sem login.
 * Usado em /public/vaccines/[patient_id] (link compartilhado pelo Tutor via WhatsApp).
 */
export async function getPublicPatientVaccines(
  patientId: string,
): Promise<PublicPatientVaccineData | { error: string }> {
  if (!patientId || patientId.length < 10) return { error: 'ID de paciente inválido.' }

  const admin = createAdminClient()

  // Busca dados do pet + clínica
  const { data: pet, error: petErr } = await admin
    .from('patients')
    .select(`
      name, species, clinic_id,
      clinics!clinic_id ( name, phone )
    `)
    .eq('id', patientId)
    .is('deleted_at', null)
    .single()

  if (petErr || !pet) return { error: 'Paciente não encontrado.' }

  const clinic = Array.isArray((pet as any).clinics) ? (pet as any).clinics[0] : (pet as any).clinics

  // Busca vacinas (sem dados sensíveis)
  const { data: vaccines, error: vaccErr } = await admin
    .from('patient_vaccines')
    .select('id, vaccine_name, date_administered, next_due_date, notes')
    .eq('patient_id', patientId)
    .order('date_administered', { ascending: false })

  if (vaccErr) return { error: 'Erro ao carregar vacinas.' }

  // Próxima dose mais urgente
  const today = new Date().toISOString().split('T')[0]
  const pending = (vaccines ?? [])
    .filter(v => v.next_due_date && v.next_due_date >= today)
    .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''))

  const nextDue = pending[0]
    ? { vaccine: pending[0].vaccine_name, date: pending[0].next_due_date! }
    : null

  // Configurações da clínica (logo, etc.)
  const { data: settings } = await admin
    .from('clinic_settings')
    .select('logo_url')
    .eq('clinic_id', pet.clinic_id)
    .maybeSingle()

  return {
    petName:     pet.name,
    petSpecies:  pet.species,
    clinicName:  clinic?.name ?? 'Clínica Veterinária',
    clinicPhone: clinic?.phone ?? null,
    clinicLogo:  (settings as any)?.logo_url ?? null,
    vaccines:    (vaccines ?? []) as PublicVaccineRecord[],
    nextDue,
  }
}
