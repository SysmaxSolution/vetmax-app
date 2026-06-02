'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsuranceProvider = {
  id:           string
  clinic_id:    string
  name:         string
  plan_types:   string[]
  portal_url:   string | null
  contact_info: { phone?: string; email?: string; contact_name?: string }
  is_active:    boolean
  created_at:   string
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

export async function getInsuranceProviders(): Promise<InsuranceProvider[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('insurance_providers')
    .select('id, clinic_id, name, plan_types, portal_url, contact_info, is_active, created_at')
    .eq('clinic_id', clinicId)
    .order('name')

  if (error) return { error: error.message }
  return (data ?? []).map(r => ({
    ...r,
    plan_types:   Array.isArray(r.plan_types)   ? r.plan_types   : [],
    contact_info: (r.contact_info && typeof r.contact_info === 'object') ? r.contact_info as InsuranceProvider['contact_info'] : {},
  }))
}

export async function createInsuranceProvider(input: {
  name:          string
  plan_types:    string[]
  portal_url?:   string
  contact_info?: { phone?: string; email?: string; contact_name?: string }
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  if (!input.name.trim()) return { error: 'Nome do convênio é obrigatório.' }

  const { data, error } = await supabase
    .from('insurance_providers')
    .insert({
      clinic_id:    clinicId,
      name:         input.name.trim(),
      plan_types:   input.plan_types,
      portal_url:   input.portal_url?.trim() || null,
      contact_info: input.contact_info ?? {},
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { id: data.id }
}

export async function updateInsuranceProvider(
  id: string,
  input: Partial<{
    name:         string
    plan_types:   string[]
    portal_url:   string | null
    contact_info: { phone?: string; email?: string; contact_name?: string }
    is_active:    boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { error } = await supabase
    .from('insurance_providers')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { success: true }
}

export async function deleteInsuranceProvider(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { error } = await supabase
    .from('insurance_providers')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/insurance')
  return { success: true }
}

// ─── Junção n:n com stock_items (Item B do convênio, 2026-06-02) ─────────────

export async function getProvidersForStockItem(stockItemId: string): Promise<string[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx
  const { data, error } = await supabase
    .from('stock_item_insurance_providers')
    .select('insurance_provider_id')
    .eq('stock_item_id', stockItemId)
    .eq('clinic_id', clinicId)
  if (error) return { error: error.message }
  return (data ?? []).map((r: any) => r.insurance_provider_id as string)
}

export async function setProvidersForStockItem(
  stockItemId: string,
  providerIds: string[],
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { clinicId } = ctx
  const admin = createAdminClient()
  const { error: delErr } = await admin
    .from('stock_item_insurance_providers')
    .delete()
    .eq('stock_item_id', stockItemId)
    .eq('clinic_id', clinicId)
  if (delErr) return { error: delErr.message }
  if (providerIds.length > 0) {
    const rows = providerIds.map(pid => ({
      stock_item_id:         stockItemId,
      insurance_provider_id: pid,
      clinic_id:             clinicId,
    }))
    const { error: insErr } = await admin
      .from('stock_item_insurance_providers')
      .insert(rows)
    if (insErr) return { error: insErr.message }
  }
  return { success: true }
}
