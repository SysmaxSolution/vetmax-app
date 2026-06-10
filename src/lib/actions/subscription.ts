'use server'

// Server Actions da assinatura SaaS (Monetização Fase 1 — sem gateway).
// Checkout dummy: persiste payload simulado (termos + last4/brand), NUNCA
// dados completos de cartão. Preço SEMPRE recalculado no servidor.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FREE_MODULES } from '@/config/access-matrix'
import { computePremiumPrice, type PriceTotals } from '@/lib/subscription/pricing'
import type {
  BillingCycle,
  BusinessType,
  SubscriptionModuleCatalogRow,
  SubscriptionPlanConfig,
  TenantSubscription,
} from '@/types'

// ─── Context ──────────────────────────────────────────────────────────────────

type Ctx = { clinicId: string; userId: string; isSysmax: boolean }

async function getAdminCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (profile.role !== 'admin' && !profile.is_sysmax) {
    return { error: 'Apenas administradores podem gerenciar a assinatura.' }
  }
  return { clinicId: profile.clinic_id, userId: user.id, isSysmax: !!profile.is_sysmax }
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export interface SubscriptionOverview {
  subscription: TenantSubscription | null
  contractedKeys: string[]
  catalog: SubscriptionModuleCatalogRow[]
  config: SubscriptionPlanConfig
  businessType: BusinessType
}

export async function getSubscriptionOverview(): Promise<SubscriptionOverview | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const [subResult, clinicResult, contractedResult, catalogResult, configResult] = await Promise.all([
    admin.from('tenant_subscriptions').select('*').eq('clinic_id', ctx.clinicId).maybeSingle(),
    admin.from('clinics').select('business_type').eq('id', ctx.clinicId).single(),
    admin.from('clinic_contracted_modules').select('module_key').eq('clinic_id', ctx.clinicId).eq('is_active', true),
    admin.from('subscription_module_catalog').select('*').eq('is_available', true).order('sort_order'),
    admin.from('subscription_plan_config').select('premium_base_price, annual_discount_percent').eq('id', 1).single(),
  ])

  return {
    subscription: (subResult.data as TenantSubscription | null) ?? null,
    contractedKeys: (contractedResult.data ?? []).map(r => r.module_key as string),
    catalog: (catalogResult.data ?? []).map(r => ({
      ...r,
      monthly_price: Number(r.monthly_price),
    })) as SubscriptionModuleCatalogRow[],
    config: {
      premium_base_price: Number(configResult.data?.premium_base_price ?? 99),
      annual_discount_percent: Number(configResult.data?.annual_discount_percent ?? 20),
    },
    businessType: (clinicResult.data?.business_type ?? 'vet_clinic') as BusinessType,
  }
}

// ─── Sync das camadas legadas ─────────────────────────────────────────────────

// Recalcula clinics.active_modules e flow_config a partir do contrato.
// Preserva keys/flags NÃO geridas pelo catálogo (mentor, registry,
// pdv_unified_with_cashier, liberações manuais do suporte etc.).
async function syncClinicModulesFromContract(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string
): Promise<{ error?: string }> {
  const [clinicResult, contractedResult, catalogResult] = await Promise.all([
    admin.from('clinics').select('business_type, active_modules, flow_config').eq('id', clinicId).single(),
    admin.from('clinic_contracted_modules').select('module_key').eq('clinic_id', clinicId).eq('is_active', true),
    admin.from('subscription_module_catalog').select('module_key, included_module_keys, flow_flags'),
  ])
  if (!clinicResult.data) return { error: 'Clínica não encontrada para sincronização.' }

  const businessType = (clinicResult.data.business_type ?? 'vet_clinic') as BusinessType
  const currentModules = (clinicResult.data.active_modules as string[]) ?? []
  const currentFlow = (clinicResult.data.flow_config as Record<string, unknown>) ?? {}

  const catalog = catalogResult.data ?? []
  const contracted = new Set((contractedResult.data ?? []).map(r => r.module_key as string))

  // Universo gerido pelo catálogo (keys técnicas + flags)
  const managedKeys = new Set<string>()
  const managedFlags = new Set<string>()
  for (const row of catalog) {
    ;((row.included_module_keys as string[]) ?? []).forEach(k => managedKeys.add(k))
    ;((row.flow_flags as string[]) ?? []).forEach(f => managedFlags.add(f))
  }

  // Coberto pelo contrato atual
  const grantedKeys = new Set<string>(FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
  const grantedFlags = new Set<string>()
  for (const row of catalog) {
    if (!contracted.has(row.module_key as string)) continue
    ;((row.included_module_keys as string[]) ?? []).forEach(k => grantedKeys.add(k))
    ;((row.flow_flags as string[]) ?? []).forEach(f => grantedFlags.add(f))
  }
  // Keys técnicas legadas contratadas sem entrada no catálogo (backfill)
  const catalogKeys = new Set(catalog.map(r => r.module_key as string))
  for (const key of contracted) {
    if (!catalogKeys.has(key)) grantedKeys.add(key)
  }

  // active_modules: concedidas + atuais não geridas (preserva liberações manuais)
  const nextModules = Array.from(
    new Set([...grantedKeys, ...currentModules.filter(k => !managedKeys.has(k))])
  )

  // flow_config: só mexe nas flags geridas
  const nextFlow: Record<string, unknown> = { ...currentFlow }
  for (const flag of managedFlags) nextFlow[flag] = grantedFlags.has(flag)

  const { error } = await admin
    .from('clinics')
    .update({ active_modules: nextModules, flow_config: nextFlow })
    .eq('id', clinicId)
  if (error) return { error: 'Erro ao sincronizar módulos: ' + error.message }
  return {}
}

// ─── Mutações ─────────────────────────────────────────────────────────────────

export interface DummyPaymentPayload {
  method: 'card' | 'pix'
  card?: { holder: string; last4: string; brand: string }
  terms_accepted: boolean
}

export async function subscribeToPremium(input: {
  moduleKeys: string[]
  cycle: BillingCycle
  payment: DummyPaymentPayload
}): Promise<{ ok: true; totals: PriceTotals } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  if (input.payment?.terms_accepted !== true) {
    return { error: 'Aceite os Termos de Uso para continuar.' }
  }
  if (input.cycle !== 'monthly' && input.cycle !== 'yearly') {
    return { error: 'Ciclo de cobrança inválido.' }
  }

  const admin = createAdminClient()
  const [catalogResult, configResult] = await Promise.all([
    admin.from('subscription_module_catalog').select('module_key, monthly_price, is_available'),
    admin.from('subscription_plan_config').select('premium_base_price, annual_discount_percent').eq('id', 1).single(),
  ])
  const catalog = catalogResult.data ?? []
  const available = new Set(catalog.filter(r => r.is_available).map(r => r.module_key as string))

  const moduleKeys = Array.from(new Set(input.moduleKeys ?? []))
  for (const key of moduleKeys) {
    if (!available.has(key)) return { error: `Módulo inválido ou indisponível: ${key}` }
  }

  // Autoridade de preço: SEMPRE o servidor (o total do client é só display)
  const totals = computePremiumPrice({
    basePrice: Number(configResult.data?.premium_base_price ?? 99),
    annualDiscountPercent: Number(configResult.data?.annual_discount_percent ?? 20),
    catalog: catalog.map(r => ({ module_key: r.module_key as string, monthly_price: Number(r.monthly_price) })),
    selectedKeys: moduleKeys,
    cycle: input.cycle,
  })

  // Payload dummy — truncamento defensivo: nunca persistir número completo
  const card = input.payment.card
    ? {
        holder: String(input.payment.card.holder ?? '').slice(0, 120),
        last4: String(input.payment.card.last4 ?? '').replace(/\D/g, '').slice(-4),
        brand: String(input.payment.card.brand ?? '').slice(0, 40),
      }
    : undefined

  const periodEnd = new Date()
  if (input.cycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  else periodEnd.setMonth(periodEnd.getMonth() + 1)

  const { error: subError } = await admin
    .from('tenant_subscriptions')
    .upsert(
      {
        clinic_id: ctx.clinicId,
        plan_name: 'premium',
        status: 'active',
        billing_cycle: input.cycle,
        custom_price: null,
        cancelled_at: null,
        current_period_end: periodEnd.toISOString(),
        payment_payload: {
          gateway: 'dummy_phase1',
          method: input.payment.method,
          card,
          terms_accepted: true,
          accepted_at: new Date().toISOString(),
          accepted_by: ctx.userId,
          totals,
          module_keys: moduleKeys,
        },
      },
      { onConflict: 'clinic_id' }
    )
  if (subError) return { error: 'Erro ao registrar assinatura: ' + subError.message }

  // Sincroniza módulos contratados: desativa não selecionados do catálogo,
  // upsert dos selecionados. Keys legadas (fora do catálogo) ficam intactas.
  const keysToDeactivate = catalog
    .map(r => r.module_key as string)
    .filter(k => !moduleKeys.includes(k))
  if (keysToDeactivate.length > 0) {
    const { error: deactivateError } = await admin
      .from('clinic_contracted_modules')
      .update({ is_active: false })
      .eq('clinic_id', ctx.clinicId)
      .in('module_key', keysToDeactivate)
    if (deactivateError) return { error: 'Erro ao atualizar módulos: ' + deactivateError.message }
  }
  if (moduleKeys.length > 0) {
    const { error: upsertError } = await admin
      .from('clinic_contracted_modules')
      .upsert(
        moduleKeys.map(key => ({
          clinic_id: ctx.clinicId,
          module_key: key,
          is_active: true,
          contracted_at: new Date().toISOString(),
        })),
        { onConflict: 'clinic_id,module_key' }
      )
    if (upsertError) return { error: 'Erro ao contratar módulos: ' + upsertError.message }
  }

  const sync = await syncClinicModulesFromContract(admin, ctx.clinicId)
  if (sync.error) return { error: sync.error }

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard/management')
  return { ok: true, totals }
}

export async function downgradeToFree(): Promise<{ ok: true } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  const { error: subError } = await admin
    .from('tenant_subscriptions')
    .upsert(
      {
        clinic_id: ctx.clinicId,
        plan_name: 'free',
        status: 'active',
        billing_cycle: null,
        custom_price: null,
        current_period_end: null,
        cancelled_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id' }
    )
  if (subError) return { error: 'Erro ao alterar plano: ' + subError.message }

  // Desativa TODAS as contratadas (preserva histórico/contracted_at)
  const { error: deactivateError } = await admin
    .from('clinic_contracted_modules')
    .update({ is_active: false })
    .eq('clinic_id', ctx.clinicId)
  if (deactivateError) return { error: 'Erro ao desativar módulos: ' + deactivateError.message }

  const sync = await syncClinicModulesFromContract(admin, ctx.clinicId)
  if (sync.error) return { error: sync.error }

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard/management')
  return { ok: true }
}
