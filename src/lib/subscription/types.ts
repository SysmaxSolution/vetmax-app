// Tipos da assinatura SaaS — módulo PURO (regra do projeto: tipos nunca são
// exportados de arquivos 'use server'; Turbopack/Next 16 derruba as actions).

import type {
  BusinessType,
  SubscriptionModuleCatalogRow,
  SubscriptionPlanConfig,
  TenantSubscription,
} from '@/types'

export interface DummyPaymentPayload {
  method: 'card' | 'pix'
  /** Apenas dados simulados/truncados — NUNCA o número completo do cartão. */
  card?: { holder: string; last4: string; brand: string }
  terms_accepted: boolean
}

export interface SubscriptionOverview {
  subscription: TenantSubscription | null
  contractedKeys: string[]
  catalog: SubscriptionModuleCatalogRow[]
  config: SubscriptionPlanConfig
  businessType: BusinessType
}
