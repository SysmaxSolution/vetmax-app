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

/** Dados de pagamento devolvidos quando a cobrança é gerada no gateway (PIX). */
export interface AsaasCheckout {
  /** Página de fatura do Asaas (QR + copia-e-cola) — onde o cliente paga. */
  invoiceUrl?: string
  /** Copia-e-cola PIX. */
  pixPayload?: string
  /** QR Code PIX em base64 (PNG, sem prefixo data:). */
  pixImage?: string
}

export interface SubscriptionOverview {
  subscription: TenantSubscription | null
  contractedKeys: string[]
  catalog: SubscriptionModuleCatalogRow[]
  config: SubscriptionPlanConfig
  businessType: BusinessType
}
