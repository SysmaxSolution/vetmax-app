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
  /**
   * Data de adesão/microchipagem (Épico C, reunião 04/06/2026). Quando
   * preenchida é a fonte nº 1 das carências (resolveEnrollmentDate).
   * A Laís confere no portal Petlove e corrige aqui.
   */
  enrollment_date: string | null
  notes:           string | null
  created_at:      string
  provider?: {
    name:       string
    plan_types: string[]
  }
}

/** Origem da data de adesão efetiva usada no cálculo de carências. */
export type EnrollmentInfo = {
  effective_date: string
  source:         'manual' | 'remessa' | 'cadastro'
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
      plan_type, member_id, coverage_status, valid_until, enrollment_date, notes, created_at,
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
    enrollment_date: (data as { enrollment_date?: string | null }).enrollment_date ?? null,
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
  /**
   * Data de adesão/microchipagem (yyyy-mm-dd). undefined = não mexe;
   * string vazia/null = limpa (volta a usar remessa/cadastro como fallback).
   */
  enrollment_date?: string | null
  notes?:           string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  if (!input.member_id.trim()) return { error: 'Número de carteirinha é obrigatório.' }
  if (!input.plan_type.trim()) return { error: 'Tipo de plano é obrigatório.' }
  if (input.enrollment_date) {
    const d = new Date(input.enrollment_date)
    if (Number.isNaN(d.getTime())) return { error: 'Data de adesão inválida.' }
    if (d.getTime() > Date.now())  return { error: 'Data de adesão não pode ser futura.' }
  }

  const patch: Record<string, unknown> = {
    provider_id:     input.provider_id,
    plan_type:       input.plan_type,
    member_id:       input.member_id.trim(),
    coverage_status: input.coverage_status ?? 'active',
    valid_until:     input.valid_until || null,
    notes:           input.notes || null,
    updated_at:      new Date().toISOString(),
  }
  // Só toca enrollment_date quando o caller mandou o campo (Épico C)
  if (input.enrollment_date !== undefined) {
    patch.enrollment_date = input.enrollment_date || null
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
    // HF2 (05/06): o consultório recebe insuranceCard server-rendered — sem
    // revalidar /dashboard/vet, a carência continuava com a adesão antiga
    // até um reload manual.
    revalidatePath('/dashboard/patients')
    revalidatePath('/dashboard/vet')
    revalidatePath('/dashboard/reception')
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
  revalidatePath('/dashboard/vet')
  revalidatePath('/dashboard/reception')
  return { id: data.id }
}

// ─── Enrollment info (Épico C) ────────────────────────────────────────────────

/**
 * Data de adesão EFETIVA usada nas carências + origem, espelhando a
 * hierarquia de resolveEnrollmentDate (insurance-coverage.ts):
 *   manual (enrollment_date) → remessa (1ª service_date) → cadastro (created_at).
 * Exibida na aba Convênio para a Laís entender de onde a data vem.
 */
export async function getEnrollmentInfo(
  patientId: string,
): Promise<EnrollmentInfo | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: ins } = await supabase
    .from('pet_insurance')
    .select('enrollment_date, created_at')
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!ins) return null

  if (ins.enrollment_date) {
    return { effective_date: ins.enrollment_date as string, source: 'manual' }
  }

  const { data: oldestLine } = await supabase
    .from('petlove_remittance_lines')
    .select('service_date')
    .eq('clinic_id', clinicId)
    .eq('matched_patient_id', patientId)
    .order('service_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (oldestLine?.service_date) {
    return { effective_date: oldestLine.service_date as string, source: 'remessa' }
  }

  return { effective_date: (ins.created_at as string).slice(0, 10), source: 'cadastro' }
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
