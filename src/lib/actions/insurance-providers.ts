'use server'

import { createClient } from '@/lib/supabase/server'
import type { ReceiptMode, InsuranceProvider } from '@/types/insurance-providers'
import type { CicloRepasse } from '@/lib/insurance/ciclo'
import type { ModoCopay } from '@/lib/insurance/copay'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
// ─── Types ────────────────────────────────────────────────────────────────────

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
    .select('id, clinic_id, name, plan_types, portal_url, contact_info, receipt_mode, config, is_active, created_at, repass_cycle, repass_cycle_day, copay_mode, copay_percent, copay_fixed')
    .eq('clinic_id', clinicId)
    .order('name')

  if (error) return { error: mensagemErro(error, 'lib/actions/insurance-providers.ts') }
  return (data ?? []).map(r => ({
    ...r,
    plan_types:   Array.isArray(r.plan_types)   ? r.plan_types   : [],
    contact_info: (r.contact_info && typeof r.contact_info === 'object') ? r.contact_info as InsuranceProvider['contact_info'] : {},
    receipt_mode: (r.receipt_mode as ReceiptMode) ?? 'convenio_repasse',
    config:       (r.config && typeof r.config === 'object') ? r.config as Record<string, unknown> : {},
    repass_cycle:     ((r.repass_cycle as string) ?? 'monthly') as CicloRepasse,
    repass_cycle_day: r.repass_cycle_day === null || r.repass_cycle_day === undefined ? null : Number(r.repass_cycle_day),
    copay_mode:       ((r.copay_mode as string) ?? 'per_item') as ModoCopay,
    copay_percent:    r.copay_percent === null || r.copay_percent === undefined ? null : Number(r.copay_percent),
    copay_fixed:      r.copay_fixed   === null || r.copay_fixed   === undefined ? null : Number(r.copay_fixed),
  }))
}

export async function createInsuranceProvider(input: {
  name:          string
  plan_types:    string[]
  portal_url?:   string
  contact_info?: { phone?: string; email?: string; contact_name?: string }
  receipt_mode?: ReceiptMode
  config?:       Record<string, unknown>
  repass_cycle?:     CicloRepasse
  repass_cycle_day?: number | null
  copay_mode?:       ModoCopay
  copay_percent?:    number | null
  copay_fixed?:      number | null
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
      receipt_mode: input.receipt_mode ?? 'convenio_repasse',
      repass_cycle:     input.repass_cycle ?? 'monthly',
      repass_cycle_day: input.repass_cycle_day ?? null,
      copay_mode:       input.copay_mode ?? 'per_item',
      copay_percent:    input.copay_mode === 'percent' ? (input.copay_percent ?? 0) : null,
      copay_fixed:      input.copay_mode === 'fixed'   ? (input.copay_fixed   ?? 0) : null,
      config:       input.config ?? {},
    })
    .select('id')
    .single()

  if (error) return { error: mensagemErro(error, 'lib/actions/insurance-providers.ts') }
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
    receipt_mode: ReceiptMode
    config:       Record<string, unknown>
    is_active:    boolean
    repass_cycle:     CicloRepasse
    repass_cycle_day: number | null
    copay_mode:       ModoCopay
    copay_percent:    number | null
    copay_fixed:      number | null
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() }
  if (input.copay_mode !== undefined) {
    patch.copay_percent = input.copay_mode === 'percent' ? (input.copay_percent ?? 0) : null
    patch.copay_fixed   = input.copay_mode === 'fixed'   ? (input.copay_fixed   ?? 0) : null
  }
  if (input.repass_cycle !== undefined && (input.repass_cycle === 'daily' || input.repass_cycle === 'custom')) {
    patch.repass_cycle_day = null
  }

  const { error } = await supabase
    .from('insurance_providers')
    .update(patch)
    .eq('id', id)

  if (error) return { error: mensagemErro(error, 'lib/actions/insurance-providers.ts') }
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

  if (error) return { error: mensagemErro(error, 'lib/actions/insurance-providers.ts') }
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
  if (error) return { error: mensagemErro(error, 'lib/actions/insurance-providers.ts') }
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
  if (delErr) return { error: mensagemErro(delErr, 'lib/actions/insurance-providers.ts') }
  if (providerIds.length > 0) {
    const rows = providerIds.map(pid => ({
      stock_item_id:         stockItemId,
      insurance_provider_id: pid,
      clinic_id:             clinicId,
    }))
    const { error: insErr } = await admin
      .from('stock_item_insurance_providers')
      .insert(rows)
    if (insErr) return { error: mensagemErro(insErr, 'lib/actions/insurance-providers.ts') }
  }
  return { success: true }
}
