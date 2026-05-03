'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PetInsurance = {
  id:              string
  clinic_id:       string
  patient_id:      string
  tutor_id:        string | null
  provider_id:     string
  plan_type:       string
  member_id:       string
  coverage_status: 'active' | 'suspended' | 'cancelled'
  valid_until:     string | null
  notes:           string | null
  created_at:      string
  provider?: {
    name:       string
    plan_types: string[]
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

type ClinicCtx = { supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string }

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { supabase, clinicId: profile.clinic_id }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPetInsurance(patientId: string): Promise<PetInsurance | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('pet_insurance')
    .select(`
      id, clinic_id, patient_id, tutor_id, provider_id,
      plan_type, member_id, coverage_status, valid_until, notes, created_at,
      insurance_providers ( name, plan_types )
    `)
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return null

  const prov = data.insurance_providers as any
  return {
    id:              data.id,
    clinic_id:       data.clinic_id,
    patient_id:      data.patient_id,
    tutor_id:        data.tutor_id,
    provider_id:     data.provider_id,
    plan_type:       data.plan_type,
    member_id:       data.member_id,
    coverage_status: data.coverage_status as PetInsurance['coverage_status'],
    valid_until:     data.valid_until,
    notes:           data.notes,
    created_at:      data.created_at,
    provider:        prov ? { name: prov.name, plan_types: Array.isArray(prov.plan_types) ? prov.plan_types : [] } : undefined,
  }
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertPetInsurance(input: {
  patient_id:       string
  tutor_id?:        string
  provider_id:      string
  plan_type:        string
  member_id:        string
  coverage_status?: 'active' | 'suspended' | 'cancelled'
  valid_until?:     string
  notes?:           string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  if (!input.member_id.trim()) return { error: 'Número de carteirinha é obrigatório.' }
  if (!input.plan_type.trim()) return { error: 'Tipo de plano é obrigatório.' }

  const patch = {
    provider_id:     input.provider_id,
    plan_type:       input.plan_type,
    member_id:       input.member_id.trim(),
    coverage_status: input.coverage_status ?? 'active',
    valid_until:     input.valid_until || null,
    notes:           input.notes || null,
    updated_at:      new Date().toISOString(),
  }

  // Check existing record for this patient
  const { data: existing } = await supabase
    .from('pet_insurance')
    .select('id')
    .eq('patient_id', input.patient_id)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('pet_insurance')
      .update(patch)
      .eq('id', existing.id)

    if (error) return { error: error.message }
    revalidatePath('/dashboard/patients')
    return { id: existing.id }
  }

  const { data, error } = await supabase
    .from('pet_insurance')
    .insert({
      clinic_id:  clinicId,
      patient_id: input.patient_id,
      tutor_id:   input.tutor_id ?? null,
      ...patch,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/patients')
  return { id: data.id }
}

// ─── Remove ───────────────────────────────────────────────────────────────────

export async function removePetInsurance(patientId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { error } = await supabase
    .from('pet_insurance')
    .delete()
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/patients')
  return { success: true }
}
