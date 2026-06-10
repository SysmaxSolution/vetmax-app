'use server'

// Server Actions da assinatura SaaS (Fase 1.5 — 4 tiers, sem gateway).
// Checkout dummy: persiste payload simulado (termos + last4/brand), NUNCA
// dados completos de cartão. Preço SEMPRE recalculado no servidor.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FREE_MODULES } from '@/config/access-matrix'
import { computePlanPrice, type PriceTotals } from '@/lib/subscription/pricing'
import { PLAN_LIMITS, type LimitedPlan } from '@/lib/subscription/plan-limits'
import type { DummyPaymentPayload, SubscriptionOverview } from '@/lib/subscription/types'
import type {
  BillingCycle,
  BusinessType,
  SubscriptionModuleCatalogRow,
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
// Tipos (SubscriptionOverview, DummyPaymentPayload) vivem em
// src/lib/subscription/types.ts — NUNCA exportar tipos de arquivo 'use server'.

export async function getSubscriptionOverview(): Promise<SubscriptionOverview | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const [subResult, clinicResult, contractedResult, catalogResult, configResult] = await Promise.all([
    admin.from('tenant_subscriptions').select('*').eq('clinic_id', ctx.clinicId).maybeSingle(),
    admin.from('clinics').select('business_type').eq('id', ctx.clinicId).single(),
    admin.from('clinic_contracted_modules').select('module_key').eq('clinic_id', ctx.clinicId).eq('is_active', true),
    admin.from('subscription_module_catalog').select('*').order('sort_order'),
    admin.from('subscription_plan_config').select('premium_base_price, enterprise_base_price, annual_discount_percent').eq('id', 1).single(),
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
      enterprise_base_price: Number(configResult.data?.enterprise_base_price ?? 299),
      annual_discount_percent: Number(configResult.data?.annual_discount_percent ?? 20),
    },
    businessType: (clinicResult.data?.business_type ?? 'vet_clinic') as BusinessType,
  }
}

// ─── Sync das camadas legadas + quotas ────────────────────────────────────────

// Recalcula clinics.active_modules e flow_config a partir do PLANO (bundles)
// + módulos contratados (addons/grants), e ajusta user_limit + quota de
// documentos por plano. Preserva keys/flags NÃO geridas pelo catálogo
// (mentor, registry, pdv_unified_with_cashier, liberações manuais).
// Specialized: módulos via contratados; user_limit/quotas NÃO são tocados
// (sob medida — runbook).
async function syncClinicModulesFromContract(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string
): Promise<{ error?: string }> {
  const [clinicResult, subResult, contractedResult, catalogResult] = await Promise.all([
    admin.from('clinics').select('business_type, active_modules, flow_config').eq('id', clinicId).single(),
    admin.from('tenant_subscriptions').select('plan_name, status').eq('clinic_id', clinicId).maybeSingle(),
    admin.from('clinic_contracted_modules').select('module_key').eq('clinic_id', clinicId).eq('is_active', true),
    admin.from('subscription_module_catalog').select('module_key, included_module_keys, flow_flags, included_in_plan'),
  ])
  if (!clinicResult.data) return { error: 'Clínica não encontrada para sincronização.' }

  const businessType = (clinicResult.data.business_type ?? 'vet_clinic') as BusinessType
  const planName = (subResult.data?.plan_name ?? 'free') as string
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

  // Coberto por bundle do plano + contratos
  const grantedKeys = new Set<string>(FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
  const grantedFlags = new Set<string>()
  for (const row of catalog) {
    const tier = row.included_in_plan as string | null
    const byPlan =
      (tier === 'premium' && (planName === 'premium' || planName === 'enterprise')) ||
      (tier === 'enterprise' && planName === 'enterprise')
    if (!byPlan && !contracted.has(row.module_key as string)) continue
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

  // Quotas por plano (specialized é sob medida — não tocar)
  if (planName !== 'specialized') {
    const limits = PLAN_LIMITS[(planName in PLAN_LIMITS ? planName : 'free') as LimitedPlan]
    const { error: limitError } = await admin
      .from('clinics')
      .update({ user_limit: limits.users })
      .eq('id', clinicId)
    if (limitError) return { error: 'Erro ao ajustar limite de usuários: ' + limitError.message }

    const { error: quotaError } = await admin
      .from('tenant_quotas')
      .upsert(
        { clinic_id: clinicId, resource_name: 'custom_documents', limit_amount: limits.documents, reset_date: null },
        { onConflict: 'clinic_id,resource_name' }
      )
    if (quotaError) return { error: 'Erro ao ajustar quota de documentos: ' + quotaError.message }
  }
  return {}
}

// ─── Mutações ─────────────────────────────────────────────────────────────────

export async function subscribeToPlan(input: {
  plan: 'premium' | 'enterprise'
  addonKeys: string[]
  cycle: BillingCycle
  payment: DummyPaymentPayload
}): Promise<{ ok: true; totals: PriceTotals } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  if (input.plan !== 'premium' && input.plan !== 'enterprise') {
    return { error: 'Plano inválido.' }
  }
  if (input.payment?.terms_accepted !== true) {
    return { error: 'Aceite os Termos de Uso para continuar.' }
  }
  if (input.cycle !== 'monthly' && input.cycle !== 'yearly') {
    return { error: 'Ciclo de cobrança inválido.' }
  }

  const addonKeys = Array.from(new Set(input.addonKeys ?? []))
  if (input.plan === 'enterprise' && addonKeys.length > 0) {
    return { error: 'O plano Enterprise já inclui todos os módulos — não há adicionais.' }
  }

  const admin = createAdminClient()
  const [catalogResult, configResult] = await Promise.all([
    admin.from('subscription_module_catalog').select('module_key, monthly_price, is_available, included_in_plan'),
    admin.from('subscription_plan_config').select('premium_base_price, enterprise_base_price, annual_discount_percent').eq('id', 1).single(),
  ])
  const catalog = catalogResult.data ?? []

  if (input.plan === 'premium') {
    const purchasable = new Set(
      catalog
        .filter(r => r.is_available && r.included_in_plan === 'enterprise')
        .map(r => r.module_key as string)
    )
    for (const key of addonKeys) {
      if (!purchasable.has(key)) return { error: `Módulo adicional inválido ou indisponível: ${key}` }
    }
  }

  // Autoridade de preço: SEMPRE o servidor (o total do client é só display)
  const totals = computePlanPrice({
    plan: input.plan,
    premiumBase: Number(configResult.data?.premium_base_price ?? 99),
    enterpriseBase: Number(configResult.data?.enterprise_base_price ?? 299),
    annualDiscountPercent: Number(configResult.data?.annual_discount_percent ?? 20),
    catalog: catalog.map(r => ({
      module_key: r.module_key as string,
      monthly_price: Number(r.monthly_price),
      included_in_plan: (r.included_in_plan ?? null) as 'premium' | 'enterprise' | null,
    })),
    addonKeys,
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
        plan_name: input.plan,
        status: 'active',
        billing_cycle: input.cycle,
        custom_price: null,
        cancelled_at: null,
        current_period_end: periodEnd.toISOString(),
        payment_payload: {
          gateway: 'dummy_phase1',
          plan: input.plan,
          method: input.payment.method,
          card,
          terms_accepted: true,
          accepted_at: new Date().toISOString(),
          accepted_by: ctx.userId,
          totals,
          addon_keys: addonKeys,
        },
      },
      { onConflict: 'clinic_id' }
    )
  if (subError) return { error: 'Erro ao registrar assinatura: ' + subError.message }

  // Contratos: só linhas 'enterprise' viram addon. Premium-bundle nunca vira
  // contrato (bundle vem do plano); keys técnicas legadas ficam intactas.
  // Enterprise: desativa todos os addons (bundle cobre tudo, preserva histórico).
  const enterpriseLines = catalog
    .filter(r => r.included_in_plan === 'enterprise')
    .map(r => r.module_key as string)
  const keysToDeactivate = enterpriseLines.filter(k => !addonKeys.includes(k))
  if (keysToDeactivate.length > 0) {
    const { error: deactivateError } = await admin
      .from('clinic_contracted_modules')
      .update({ is_active: false })
      .eq('clinic_id', ctx.clinicId)
      .in('module_key', keysToDeactivate)
    if (deactivateError) return { error: 'Erro ao atualizar módulos: ' + deactivateError.message }
  }
  if (addonKeys.length > 0) {
    const { error: upsertError } = await admin
      .from('clinic_contracted_modules')
      .upsert(
        addonKeys.map(key => ({
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

// ─── Pricing admin (SysMax-only) ──────────────────────────────────────────────

export async function updateSubscriptionPricing(input: {
  modules: Array<{ module_key: string; monthly_price: number; is_available: boolean }>
  config: {
    premium_base_price: number
    enterprise_base_price: number
    annual_discount_percent: number
  }
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx
  if (!ctx.isSysmax) return { error: 'Apenas o time SysMax pode alterar o pricing.' }

  const { premium_base_price, enterprise_base_price, annual_discount_percent } = input.config
  for (const [label, v] of [
    ['preço base Premium', premium_base_price],
    ['preço base Enterprise', enterprise_base_price],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) return { error: `Valor inválido para ${label}.` }
  }
  if (!Number.isFinite(annual_discount_percent) || annual_discount_percent < 0 || annual_discount_percent > 100) {
    return { error: 'Desconto anual deve estar entre 0 e 100%.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('subscription_module_catalog')
    .select('module_key')
  const validKeys = new Set((existing ?? []).map(r => r.module_key as string))

  for (const mod of input.modules ?? []) {
    if (!validKeys.has(mod.module_key)) return { error: `Módulo desconhecido: ${mod.module_key}` }
    if (!Number.isFinite(mod.monthly_price) || mod.monthly_price < 0) {
      return { error: `Preço inválido para ${mod.module_key}.` }
    }
  }

  for (const mod of input.modules ?? []) {
    const { error } = await admin
      .from('subscription_module_catalog')
      .update({ monthly_price: mod.monthly_price, is_available: mod.is_available })
      .eq('module_key', mod.module_key)
    if (error) return { error: `Erro ao salvar ${mod.module_key}: ` + error.message }
  }

  const { error: cfgError } = await admin
    .from('subscription_plan_config')
    .update({ premium_base_price, enterprise_base_price, annual_discount_percent })
    .eq('id', 1)
  if (cfgError) return { error: 'Erro ao salvar configuração de preços: ' + cfgError.message }

  revalidatePath('/dashboard/management')
  return { ok: true }
}
