'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PatientVaccine = {
  id:                string
  patient_id:        string
  vaccine_name:      string
  date_administered: string
  next_due_date:     string | null
  notes:             string | null
  created_at:        string
  // M7 — campos estruturados (todos opcionais)
  vaccine_type:      string | null
  dose_number:       number | null
  dose_total:        number | null
  manufacturer:      string | null
  lot_number:        string | null
  validity_date:     string | null
}

// Campos estruturados que entram no insert/update de vacina (M7).
const VACCINE_SELECT =
  'id, patient_id, vaccine_name, date_administered, next_due_date, notes, created_at, vaccine_type, dose_number, dose_total, manufacturer, lot_number, validity_date'

export interface VaccineExtra {
  vaccine_type?:  string | null
  dose_number?:   number | null
  dose_total?:    number | null
  manufacturer?:  string | null
  lot_number?:    string | null
  validity_date?: string | null
}

function vaccineExtraPayload(d: VaccineExtra) {
  return {
    vaccine_type:  d.vaccine_type  ?? null,
    dose_number:   d.dose_number   ?? null,
    dose_total:    d.dose_total    ?? null,
    manufacturer:  d.manufacturer  ?? null,
    lot_number:    d.lot_number    ?? null,
    validity_date: d.validity_date ?? null,
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPatientVaccines(
  patientId: string
): Promise<PatientVaccine[] | { error: string }> {
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
    .from('patient_vaccines')
    .select(VACCINE_SELECT)
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .order('date_administered', { ascending: false })

  if (error) return { error: 'Erro ao buscar vacinas: ' + error.message }
  return (data ?? []) as PatientVaccine[]
}

// ─── Add ─────────────────────────────────────────────────────────────────────

export async function addVaccine(data: {
  patient_id:        string
  consultation_id:   string
  vaccine_name:      string
  date_administered?: string
  next_due_date?:    string
  notes?:            string
} & VaccineExtra): Promise<PatientVaccine | { error: string }> {
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

  const { data: result, error } = await admin
    .from('patient_vaccines')
    .insert({
      clinic_id:         profile.clinic_id,
      patient_id:        data.patient_id,
      vaccine_name:      data.vaccine_name,
      date_administered: data.date_administered ?? new Date().toISOString().split('T')[0],
      next_due_date:     data.next_due_date ?? null,
      administered_by:   user.id,
      notes:             data.notes ?? null,
      ...vaccineExtraPayload(data),
    })
    .select(VACCINE_SELECT)
    .single()

  if (error || !result) return { error: 'Erro ao registrar vacina: ' + (error?.message ?? '') }

  revalidatePath(`/dashboard/vet/${data.consultation_id}`)
  return result as PatientVaccine
}

// ─── Add (sem consultation_id — para cadastro inicial) ───────────────────────

export async function addVaccineStandalone(data: {
  patient_id:         string
  vaccine_name:       string
  date_administered?: string
  next_due_date?:     string
  notes?:             string
} & VaccineExtra): Promise<PatientVaccine | { error: string }> {
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

  const { data: result, error } = await admin
    .from('patient_vaccines')
    .insert({
      clinic_id:         profile.clinic_id,
      patient_id:        data.patient_id,
      vaccine_name:      data.vaccine_name,
      date_administered: data.date_administered ?? new Date().toISOString().split('T')[0],
      next_due_date:     data.next_due_date ?? null,
      administered_by:   user.id,
      notes:             data.notes ?? null,
      ...vaccineExtraPayload(data),
    })
    .select(VACCINE_SELECT)
    .single()

  if (error || !result) return { error: 'Erro ao registrar vacina: ' + (error?.message ?? '') }
  revalidatePath('/dashboard/patients')
  return result as PatientVaccine
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateVaccine(
  id: string,
  consultationId: string,
  data: { vaccine_name: string; date_administered?: string; next_due_date?: string; notes?: string } & VaccineExtra
): Promise<PatientVaccine | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data: result, error } = await supabase
    .from('patient_vaccines')
    .update({
      vaccine_name:      data.vaccine_name,
      date_administered: data.date_administered,
      next_due_date:     data.next_due_date ?? null,
      notes:             data.notes ?? null,
      ...vaccineExtraPayload(data),
    })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select(VACCINE_SELECT)
    .single()

  if (error || !result) return { error: 'Erro ao atualizar vacina: ' + (error?.message ?? '') }

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return result as PatientVaccine
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteVaccine(
  id: string,
  consultationId: string
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

  const { error } = await supabase
    .from('patient_vaccines')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao remover vacina: ' + error.message }

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}
