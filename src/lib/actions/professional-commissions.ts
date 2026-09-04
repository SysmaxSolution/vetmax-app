'use server'

// 1.5 · Motor de repasse dos profissionais — regras de comissão (config).
// Por profissional: serviço/produto/categoria/padrão → % ou valor fixo. O
// resolvedor escolhe a regra MAIS ESPECÍFICA ativa e calcula a comissão sobre um
// valor base. A geração do título no contas a pagar (ao faturar) usa resolveCommission.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantCtx } from '@/lib/data/context'
import { revalidatePath } from 'next/cache'

async function ctx() {
  const t = await getTenantCtx()
  if (!t?.clinicId) return null
  return { clinicId: t.clinicId, role: t.role }
}

export type CommissionScope = 'default' | 'service' | 'product' | 'category'
export type CommissionType  = 'percent' | 'fixed'

export interface CommissionRule {
  id:              string
  professional_id: string
  applies_to:      CommissionScope
  service_id:      string | null
  product_id:      string | null
  category:        string | null
  commission_type: CommissionType
  value:           number
  is_active:       boolean
}

export async function listProfessionalCommissions(professionalId?: string): Promise<CommissionRule[] | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  let q = admin.from('professional_commissions')
    .select('id, professional_id, applies_to, service_id, product_id, category, commission_type, value, is_active')
    .eq('clinic_id', c.clinicId).order('created_at', { ascending: true })
  if (professionalId) q = q.eq('professional_id', professionalId)
  const { data, error } = await q
  if (error) return { error: error.message }
  return (data ?? []).map(r => ({ ...r, value: Number((r as { value: number }).value) })) as CommissionRule[]
}

export async function upsertProfessionalCommission(input: {
  id?:             string
  professional_id: string
  applies_to:      CommissionScope
  service_id?:     string | null
  product_id?:     string | null
  category?:       string | null
  commission_type: CommissionType
  value:           number
  is_active?:      boolean
}): Promise<{ ok: true; id: string } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  if (!input.professional_id) return { error: 'Profissional obrigatório.' }
  if (input.value < 0) return { error: 'Valor inválido.' }
  if (input.commission_type === 'percent' && input.value > 100) return { error: 'Percentual não pode passar de 100%.' }
  const admin = createAdminClient()
  const row = {
    clinic_id: c.clinicId, professional_id: input.professional_id,
    applies_to: input.applies_to,
    service_id: input.applies_to === 'service' ? (input.service_id ?? null) : null,
    product_id: input.applies_to === 'product' ? (input.product_id ?? null) : null,
    category:   input.applies_to === 'category' ? (input.category ?? null) : null,
    commission_type: input.commission_type, value: input.value,
    is_active: input.is_active ?? true, updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { error } = await admin.from('professional_commissions').update(row).eq('id', input.id).eq('clinic_id', c.clinicId)
    if (error) return { error: error.message }
    revalidatePath('/dashboard/financial')
    return { ok: true, id: input.id }
  }
  const { data, error } = await admin.from('professional_commissions').insert(row).select('id').single()
  if (error || !data) return { error: error?.message ?? 'Falha ao salvar.' }
  revalidatePath('/dashboard/financial')
  return { ok: true, id: data.id }
}

export async function deleteProfessionalCommission(id: string): Promise<{ error?: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { error } = await admin.from('professional_commissions').delete().eq('id', id).eq('clinic_id', c.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/financial')
  return {}
}

export interface ResolvedCommission { rule_id: string | null; commission_type: CommissionType | null; value: number; commission_amount: number }

// Escolhe a regra ativa mais específica (serviço > produto > categoria > padrão)
// e calcula a comissão sobre base_amount.
export async function resolveCommission(input: {
  professional_id: string
  base_amount:     number
  service_id?:     string | null
  product_id?:     string | null
  category?:       string | null
}): Promise<ResolvedCommission> {
  const c = await ctx()
  if (!c) return { rule_id: null, commission_type: null, value: 0, commission_amount: 0 }
  const admin = createAdminClient()
  const { data } = await admin.from('professional_commissions')
    .select('id, applies_to, service_id, product_id, category, commission_type, value')
    .eq('clinic_id', c.clinicId).eq('professional_id', input.professional_id).eq('is_active', true)
  const rules = (data ?? []) as Array<Record<string, unknown>>

  const pick =
    (input.service_id  && rules.find(r => r.applies_to === 'service'  && r.service_id === input.service_id)) ||
    (input.product_id  && rules.find(r => r.applies_to === 'product'  && r.product_id === input.product_id)) ||
    (input.category    && rules.find(r => r.applies_to === 'category' && r.category   === input.category))   ||
    rules.find(r => r.applies_to === 'default') || null

  if (!pick) return { rule_id: null, commission_type: null, value: 0, commission_amount: 0 }
  const type = pick.commission_type as CommissionType
  const value = Number(pick.value)
  const amount = type === 'percent'
    ? Math.round(input.base_amount * value) / 100
    : Math.min(value, input.base_amount)   // fixo nunca passa da base
  return { rule_id: pick.id as string, commission_type: type, value, commission_amount: Math.round(amount * 100) / 100 }
}
