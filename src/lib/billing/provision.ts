// Provisionamento de módulos da assinatura — módulo PURO de servidor (NÃO é
// 'use server'): compartilhado entre as Server Actions (subscribeToPlan) e o
// webhook do Asaas (ativação pós-pagamento, R6). Centraliza a regra de "o que
// o plano + contratos liberam" para que a ativação por PAGAMENTO confirmado
// (webhook) reuse exatamente a mesma lógica do checkout.

import { createAdminClient } from '@/lib/supabase/admin'
import { FREE_MODULES } from '@/config/access-matrix'
import { PLAN_LIMITS, type LimitedPlan } from '@/lib/subscription/plan-limits'
import type { BusinessType } from '@/types'

type Admin = ReturnType<typeof createAdminClient>

// Recalcula clinics.active_modules e flow_config a partir do PLANO (bundles)
// + módulos contratados (addons/grants), e ajusta user_limit + quota de
// documentos por plano. Preserva keys/flags NÃO geridas pelo catálogo
// (mentor, registry, pdv_unified_with_cashier, liberações manuais).
// Specialized: módulos via contratados; user_limit/quotas NÃO são tocados.
export async function syncClinicModulesFromContract(
  admin: Admin,
  clinicId: string
): Promise<{ error?: string }> {
  const [clinicResult, subResult, contractedResult, catalogResult] = await Promise.all([
    admin.from('clinics').select('business_type, active_modules, flow_config').eq('id', clinicId).single(),
    admin.from('tenant_subscriptions').select('plan_name, status, lifecycle_state').eq('clinic_id', clinicId).maybeSingle(),
    admin.from('clinic_contracted_modules').select('module_key').eq('clinic_id', clinicId).eq('is_active', true),
    admin.from('subscription_module_catalog').select('module_key, included_module_keys, flow_flags, included_in_plan'),
  ])
  if (!clinicResult.data) return { error: 'Clínica não encontrada para sincronização.' }

  const businessType = (clinicResult.data.business_type ?? 'vet_clinic') as BusinessType
  // R7: assinatura suspensa/expirada rebaixa o acesso ao núcleo Free (módulos
  // pagos OFF) — sem mexer nos contratos, para que o pagamento (reactivate)
  // restaure tudo. Demais estados usam o plano real.
  const lifecycle = (subResult.data?.lifecycle_state ?? null) as string | null
  const suspendedView = lifecycle === 'suspended' || lifecycle === 'expired'
  const planName = (suspendedView ? 'free' : (subResult.data?.plan_name ?? 'free')) as string
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

  // Coberto por bundle do plano + contratos. Suspenso/expirado: SÓ Free
  // (ignora bundle e contratos — os módulos pagos ficam OFF).
  const grantedKeys = new Set<string>(FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
  const grantedFlags = new Set<string>()
  if (!suspendedView) {
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

// Reconcilia clinic_contracted_modules para refletir o plano+addons escolhidos.
// Só linhas 'enterprise' do catálogo viram addon; premium-bundle nunca vira
// contrato (vem do plano). Enterprise: addonKeys vazio → desativa todos os addons.
export async function applyPlanContracts(
  admin: Admin,
  clinicId: string,
  addonKeys: string[]
): Promise<{ error?: string }> {
  const { data: catalog } = await admin
    .from('subscription_module_catalog')
    .select('module_key, included_in_plan')
  const enterpriseLines = (catalog ?? [])
    .filter(r => r.included_in_plan === 'enterprise')
    .map(r => r.module_key as string)

  const keysToDeactivate = enterpriseLines.filter(k => !addonKeys.includes(k))
  if (keysToDeactivate.length > 0) {
    const { error } = await admin
      .from('clinic_contracted_modules')
      .update({ is_active: false })
      .eq('clinic_id', clinicId)
      .in('module_key', keysToDeactivate)
    if (error) return { error: 'Erro ao atualizar módulos: ' + error.message }
  }
  if (addonKeys.length > 0) {
    const { error } = await admin
      .from('clinic_contracted_modules')
      .upsert(
        addonKeys.map(key => ({
          clinic_id: clinicId,
          module_key: key,
          is_active: true,
          contracted_at: new Date().toISOString(),
        })),
        { onConflict: 'clinic_id,module_key' }
      )
    if (error) return { error: 'Erro ao contratar módulos: ' + error.message }
  }
  return {}
}

// Ativação pós-pagamento (R6) — chamada pelo webhook no PAYMENT_CONFIRMED.
// Lê o plano pretendido + addons (guardados em payment_payload no subscribe),
// aplica os contratos, sincroniza os módulos e marca lifecycle_state='active'.
// Idempotente (webhook pode reentregar). Specialized/free: só marca ativo.
export async function activatePaidSubscription(
  admin: Admin,
  clinicId: string
): Promise<{ error?: string }> {
  const { data: sub } = await admin
    .from('tenant_subscriptions')
    .select('plan_name, payment_payload')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!sub) return { error: 'Assinatura não encontrada para ativação.' }

  // Marca ativa ANTES de sincronizar: o sync olha lifecycle_state e, se ainda
  // estivesse suspended/expired, rebaixaria os módulos para Free. Pagamento
  // confirmado encerra qualquer proteção de grandfathering e limpa o relógio de
  // inadimplência (past_due_since).
  const { error } = await admin
    .from('tenant_subscriptions')
    .update({ lifecycle_state: 'active', status: 'active', is_grandfathered: false, past_due_since: null })
    .eq('clinic_id', clinicId)
  if (error) return { error: 'Erro ao ativar assinatura: ' + error.message }

  const plan = sub.plan_name as string
  if (plan === 'premium' || plan === 'enterprise') {
    const payload = (sub.payment_payload as Record<string, unknown> | null) ?? {}
    const addonKeys = Array.isArray(payload.addon_keys) ? (payload.addon_keys as string[]) : []
    const applied = await applyPlanContracts(admin, clinicId, plan === 'enterprise' ? [] : addonKeys)
    if (applied.error) return applied
    const synced = await syncClinicModulesFromContract(admin, clinicId)
    if (synced.error) return synced
  }
  return {}
}

// ─── Dunning / inadimplência (R7) ──────────────────────────────────────────

export const DUNNING_DAY_MS = 24 * 60 * 60 * 1000
export const DUNNING_GRACE_DAYS = 7

// Lógica TEMPORAL PURA do dunning (testável sem banco). Dado o estado da
// assinatura e o instante atual, decide a transição: marcar 'expiring' (anual
// perto de vencer) ou TENTAR suspender ('suspended' mensal / 'expired' anual).
// A carência clínica D3 NÃO entra aqui — é decidida no momento da suspensão
// (attemptSuspendSubscription). Retorna null se nada a fazer.
export function planDunningTransition(
  sub: {
    lifecycle_state: string | null
    billing_cycle: string | null
    past_due_since: string | null
    current_period_end: string | null
  },
  nowMs: number
): { setState?: 'expiring'; trySuspend?: 'suspended' | 'expired' } | null {
  const state = sub.lifecycle_state
  const isYearly = sub.billing_cycle === 'yearly'
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null
  const pastDueSince = sub.past_due_since ? new Date(sub.past_due_since).getTime() : null
  const graceMs = DUNNING_GRACE_DAYS * DUNNING_DAY_MS

  // Anual: aviso de renovação (−7d) e expiração.
  if (isYearly && periodEnd && (state === 'active' || state === 'expiring')) {
    if (periodEnd <= nowMs) return { trySuspend: 'expired' }
    if (state === 'active' && periodEnd <= nowMs + graceMs) return { setState: 'expiring' }
    return null
  }
  // Mensal: atraso há ≥7d → tenta suspender.
  if (!isYearly && state === 'past_due' && pastDueSince && nowMs - pastDueSince >= graceMs) {
    return { trySuspend: 'suspended' }
  }
  // Carência (D3 adiou): retenta diariamente até os registros clínicos fecharem.
  if (state === 'grace') {
    return { trySuspend: isYearly ? 'expired' : 'suspended' }
  }
  return null
}

// D3 (CFMV) — a clínica tem registro clínico ABERTO? Internação ativa
// (observation/ward/icu) OU consulta/prontuário não finalizado. Enquanto
// houver, a suspensão por inadimplência é adiada (proteção do paciente).
export async function hasOpenClinicalRecords(
  admin: Admin,
  clinicId: string
): Promise<boolean> {
  const [hosp, cons] = await Promise.all([
    admin
      .from('hospitalizations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('status', ['observation', 'ward', 'icu']),
    // "Prontuário aberto" = atendimento INICIADO e não finalizado. Agendamentos
    // futuros (scheduled/scheduled_future) não contam — senão a agenda viraria
    // uma brecha contra a suspensão.
    admin
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('status', ['reception', 'triage', 'in_progress', 'waiting_exam', 'medication']),
  ])
  return (hosp.count ?? 0) > 0 || (cons.count ?? 0) > 0
}

// Tenta suspender (mensal → 'suspended'; anual → 'expired'). Respeita D3: se há
// registro clínico aberto, NÃO desliga módulos — devolve { deferred: true } e o
// chamador decide manter em carência. Caso contrário, marca o estado e rebaixa
// os módulos ao Free (contratos preservados → pagamento reativa).
export async function attemptSuspendSubscription(
  admin: Admin,
  clinicId: string,
  targetState: 'suspended' | 'expired'
): Promise<{ deferred?: boolean; error?: string }> {
  if (await hasOpenClinicalRecords(admin, clinicId)) {
    return { deferred: true }
  }
  const { error } = await admin
    .from('tenant_subscriptions')
    .update({ lifecycle_state: targetState })
    .eq('clinic_id', clinicId)
  if (error) return { error: 'Erro ao suspender assinatura: ' + error.message }
  // sync agora vê suspended/expired → desliga módulos pagos (mantém contratos).
  const synced = await syncClinicModulesFromContract(admin, clinicId)
  if (synced.error) return synced
  return {}
}
