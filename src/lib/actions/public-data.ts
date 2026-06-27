'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicVaccineRecord {
  id:                   string
  vaccine_name:         string
  vaccine_type:         string | null
  date_administered:    string
  next_due_date:        string | null
  dose_number:          number | null
  dose_total:           number | null
  manufacturer:         string | null
  lot_number:           string | null
  validity_date:        string | null
  administration_route: string | null
  vet_name:             string | null   // MV aplicador (CFMV: ato privativo)
  vet_crmv:             string | null
  notes:                string | null
}

export interface PublicPatientVaccineData {
  // Resenha do animal (CFMV Res. 1321/2020)
  petName:        string
  petSpecies:     string
  petBreed:       string | null
  petGender:      string | null
  petNeutered:    boolean | null
  petColor:       string | null
  petBirthDate:   string | null
  petMicrochip:   string | null
  // Tutor (CPF mascarado — página pública por link-capability)
  tutorName:      string | null
  tutorCpfMasked: string | null
  // Estabelecimento
  clinicName:     string
  clinicPhone:    string | null
  clinicCnpj:     string | null
  clinicAddress:  string | null
  clinicLogo:     string | null
  // Atos vacinais
  vaccines:       PublicVaccineRecord[]
  nextDue:        { vaccine: string; date: string } | null
}

// LGPD: a carteira é compartilhada por link público (UUID não-enumerável). O CPF
// do tutor é mascarado; o CRMV do MV é dado profissional público (registro CRMV).
function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return null
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
}

// ─── Public — sem autenticação, usa admin para RLS bypass ────────────────────

/**
 * Dados públicos de vacinação de um pet — acesso sem login.
 * Modelo CFMV Res. 1321/2020 (carteira de vacinação).
 * Usado em /public/vaccines/[patient_id] (link compartilhado pelo Tutor via WhatsApp).
 */
export async function getPublicPatientVaccines(
  patientId: string,
): Promise<PublicPatientVaccineData | { error: string }> {
  if (!patientId || patientId.length < 10) return { error: 'ID de paciente inválido.' }

  const admin = createAdminClient()

  // Pet + clínica + tutor (resenha CFMV)
  const { data: pet, error: petErr } = await admin
    .from('patients')
    .select(`
      name, species, breed, gender, neutered, color, coat_color,
      birth_date, microchip, microchip_id, clinic_id,
      clinics!clinic_id ( name, phone, cnpj, address, city, state ),
      tutors!tutor_id ( name, cpf )
    `)
    .eq('id', patientId)
    .is('deleted_at', null)
    .single()

  if (petErr || !pet) return { error: 'Paciente não encontrado.' }

  const p = pet as any
  const clinic = Array.isArray(p.clinics) ? p.clinics[0] : p.clinics
  const tutor  = Array.isArray(p.tutors)  ? p.tutors[0]  : p.tutors

  // Atos vacinais + MV aplicador (CFMV: documento assinado por médico-veterinário)
  const { data: vaccines, error: vaccErr } = await admin
    .from('patient_vaccines')
    .select(`
      id, vaccine_name, vaccine_type, date_administered, next_due_date,
      dose_number, dose_total, manufacturer, lot_number, validity_date,
      administration_route, notes,
      vet:administered_by ( full_name, crmv )
    `)
    .eq('patient_id', patientId)
    .order('date_administered', { ascending: false })

  if (vaccErr) return { error: 'Erro ao carregar vacinas.' }

  const vaccineRecords: PublicVaccineRecord[] = (vaccines ?? []).map((v: any) => {
    const vet = Array.isArray(v.vet) ? v.vet[0] : v.vet
    return {
      id:                   v.id,
      vaccine_name:         v.vaccine_name,
      vaccine_type:         v.vaccine_type ?? null,
      date_administered:    v.date_administered,
      next_due_date:        v.next_due_date ?? null,
      dose_number:          v.dose_number ?? null,
      dose_total:           v.dose_total ?? null,
      manufacturer:         v.manufacturer ?? null,
      lot_number:           v.lot_number ?? null,
      validity_date:        v.validity_date ?? null,
      administration_route: v.administration_route ?? null,
      vet_name:             vet?.full_name ?? null,
      vet_crmv:             vet?.crmv ?? null,
      notes:                v.notes ?? null,
    }
  })

  // Próxima dose mais urgente
  const today = new Date().toISOString().split('T')[0]
  const pending = vaccineRecords
    .filter(v => v.next_due_date && v.next_due_date >= today)
    .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''))

  const nextDue = pending[0]
    ? { vaccine: pending[0].vaccine_name, date: pending[0].next_due_date! }
    : null

  // Logo da clínica
  const { data: settings } = await admin
    .from('clinic_settings')
    .select('logo_url')
    .eq('clinic_id', p.clinic_id)
    .maybeSingle()

  // Endereço consolidado do estabelecimento
  const addressParts = [clinic?.address, clinic?.city, clinic?.state].filter(Boolean)
  const clinicAddress = addressParts.length ? addressParts.join(' — ') : null

  return {
    petName:        p.name,
    petSpecies:     p.species,
    petBreed:       p.breed ?? null,
    petGender:      p.gender ?? null,
    petNeutered:    typeof p.neutered === 'boolean' ? p.neutered : null,
    petColor:       p.color ?? p.coat_color ?? null,
    petBirthDate:   p.birth_date ?? null,
    petMicrochip:   p.microchip ?? p.microchip_id ?? null,
    tutorName:      tutor?.name ?? null,
    tutorCpfMasked: maskCpf(tutor?.cpf),
    clinicName:     clinic?.name ?? 'Clínica Veterinária',
    clinicPhone:    clinic?.phone ?? null,
    clinicCnpj:     clinic?.cnpj ?? null,
    clinicAddress,
    clinicLogo:     (settings as any)?.logo_url ?? null,
    vaccines:       vaccineRecords,
    nextDue,
  }
}
