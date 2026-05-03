'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleType =
  | 'requires_justification'
  | 'requires_prior_auth'
  | 'limited_frequency'
  | 'not_covered'
  | 'informational'

export type RuleSeverity = 'blocking' | 'warning' | 'info'

export type InsuranceRule = {
  id:                     string
  clinic_id:              string
  provider_id:            string
  procedure_name:         string
  rule_type:              RuleType
  rule_description:       string
  justification_template: string | null
  severity:               RuleSeverity
  is_active:              boolean
  created_at:             string
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

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getInsuranceRules(providerId: string): Promise<InsuranceRule[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('insurance_rules')
    .select('id, clinic_id, provider_id, procedure_name, rule_type, rule_description, justification_template, severity, is_active, created_at')
    .eq('provider_id', providerId)
    .eq('clinic_id', clinicId)
    .order('procedure_name')

  if (error) return { error: error.message }
  return data ?? []
}

export async function createInsuranceRule(input: {
  provider_id:             string
  procedure_name:          string
  rule_type:               RuleType
  rule_description:        string
  justification_template?: string
  severity:                RuleSeverity
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  if (!input.procedure_name.trim()) return { error: 'Nome do procedimento é obrigatório.' }
  if (!input.rule_description.trim()) return { error: 'Descrição da regra é obrigatória.' }

  const { data, error } = await supabase
    .from('insurance_rules')
    .insert({
      clinic_id:              clinicId,
      provider_id:            input.provider_id,
      procedure_name:         input.procedure_name.trim(),
      rule_type:              input.rule_type,
      rule_description:       input.rule_description.trim(),
      justification_template: input.justification_template?.trim() || null,
      severity:               input.severity,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { id: data.id }
}

export async function updateInsuranceRule(
  id: string,
  input: Partial<{
    procedure_name:         string
    rule_type:              RuleType
    rule_description:       string
    justification_template: string | null
    severity:               RuleSeverity
    is_active:              boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { error } = await supabase
    .from('insurance_rules')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { success: true }
}

export async function deleteInsuranceRule(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { error } = await supabase
    .from('insurance_rules')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { success: true }
}
