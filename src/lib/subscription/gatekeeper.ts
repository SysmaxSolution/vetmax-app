// Gatekeeper centralizado de plano/módulos (Monetização SaaS Fase 1).
// Server-only por construção: usa createAdminClient (SUPABASE_SERVICE_ROLE_KEY).
//
// Regra de acesso (sem bypass por plano — o backfill 0365 garante paridade):
//   1. moduleKey ∈ FREE_MODULES[businessType]  → liberado (core sempre grátis)
//   2. módulo contratado ativo cobre a key     → liberado
//      (linha do catálogo expande via included_module_keys; linha sem entrada
//       no catálogo é tratada como key técnica direta — compat backfill/legado)
//   3. status da assinatura ∉ {active, trialing} → só free tier
//
// A camada por usuário (user_module_access) continua composta em AND pelo
// proxy/layout — este gatekeeper decide apenas o que a CLÍNICA pode usar.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { FREE_MODULES } from '@/config/access-matrix'
import type {
  BillingCycle,
  BusinessType,
  PlanName,
  SubscriptionModuleCatalogRow,
  SubscriptionStatus,
} from '@/types'

export interface ClinicSubscriptionState {
  planName: PlanName
  status: SubscriptionStatus
  billingCycle: BillingCycle | null
  customPrice: number | null
  currentPeriodEnd: string | null
  businessType: BusinessType
  /** Chaves COMERCIAIS contratadas ativas (clinic_contracted_modules). */
  contractedCommercialKeys: string[]
  /** Keys TÉCNICAS liberadas: FREE_MODULES[bt] ∪ expansão dos contratados. */
  allowedTechnicalKeys: Set<string>
}

// cache() deduplica entre layout/template na mesma navegação (mesmo request).
export const getClinicSubscriptionState = cache(
  async (clinicId: string): Promise<ClinicSubscriptionState> => {
    const admin = createAdminClient()

    const [subResult, clinicResult, contractedResult, catalogResult] = await Promise.all([
      admin
        .from('tenant_subscriptions')
        .select('plan_name, status, billing_cycle, custom_price, current_period_end')
        .eq('clinic_id', clinicId)
        .maybeSingle(),
      admin.from('clinics').select('business_type').eq('id', clinicId).single(),
      admin
        .from('clinic_contracted_modules')
        .select('module_key')
        .eq('clinic_id', clinicId)
        .eq('is_active', true),
      admin
        .from('subscription_module_catalog')
        .select('module_key, included_module_keys'),
    ])

    const planName = (subResult.data?.plan_name ?? 'free') as PlanName
    const status = (subResult.data?.status ?? 'active') as SubscriptionStatus
    const businessType = (clinicResult.data?.business_type ?? 'vet_clinic') as BusinessType

    const freeKeys = FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic
    const allowedTechnicalKeys = new Set<string>(freeKeys)

    const contractedKeys = (contractedResult.data ?? []).map(r => r.module_key as string)
    const subscriptionUsable = status === 'active' || status === 'trialing'

    if (subscriptionUsable) {
      const catalogByKey = new Map(
        (catalogResult.data ?? []).map(r => [r.module_key as string, r.included_module_keys as string[]])
      )
      for (const key of contractedKeys) {
        const included = catalogByKey.get(key)
        if (included && included.length > 0) {
          included.forEach(k => allowedTechnicalKeys.add(k))
        } else if (!catalogByKey.has(key)) {
          // Key técnica legada do backfill (sem entrada no catálogo)
          allowedTechnicalKeys.add(key)
        }
      }
    }

    return {
      planName,
      status,
      billingCycle: (subResult.data?.billing_cycle ?? null) as BillingCycle | null,
      customPrice: subResult.data?.custom_price != null ? Number(subResult.data.custom_price) : null,
      currentPeriodEnd: subResult.data?.current_period_end ?? null,
      businessType,
      contractedCommercialKeys: contractedKeys,
      allowedTechnicalKeys,
    }
  }
)

/** Checa se a clínica tem acesso ao módulo (key TÉCNICA de active_modules). */
export async function checkModuleAccess(clinicId: string, moduleKey: string): Promise<boolean> {
  const state = await getClinicSubscriptionState(clinicId)
  return state.allowedTechnicalKeys.has(moduleKey)
}

export interface SubscriptionSummary {
  planName: PlanName
  status: SubscriptionStatus
  billingCycle: BillingCycle | null
  customPrice: number | null
  currentPeriodEnd: string | null
  businessType: BusinessType
  contractedModules: Array<Pick<SubscriptionModuleCatalogRow, 'module_key' | 'label' | 'monthly_price'>>
}

/** Resumo para a UI da aba Assinatura (labels e preços resolvidos). */
export async function getSubscriptionSummary(clinicId: string): Promise<SubscriptionSummary> {
  const state = await getClinicSubscriptionState(clinicId)
  const admin = createAdminClient()
  const { data: catalog } = await admin
    .from('subscription_module_catalog')
    .select('module_key, label, monthly_price')
    .in('module_key', state.contractedCommercialKeys.length ? state.contractedCommercialKeys : ['__none__'])

  return {
    planName: state.planName,
    status: state.status,
    billingCycle: state.billingCycle,
    customPrice: state.customPrice,
    currentPeriodEnd: state.currentPeriodEnd,
    businessType: state.businessType,
    contractedModules: (catalog ?? []).map(r => ({
      module_key: r.module_key as string,
      label: r.label as string,
      monthly_price: Number(r.monthly_price),
    })),
  }
}
