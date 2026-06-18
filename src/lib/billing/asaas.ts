/**
 * Cliente REST PURO do gateway Asaas (Monetização SaaS — Fase 2).
 *
 * Módulo SEM 'use server' — exports síncronos (const/helpers) não podem viver
 * num arquivo de server actions. As server actions de assinatura
 * (src/lib/actions/subscription.ts) consomem estas funções.
 *
 * Modelo de cobrança: a Sysmax Software é a merchant (UMA conta Asaas).
 * Cada clínica vira um `customer`; cada plano vira uma `subscription`.
 *
 * Autenticação: header `access_token` com a API Key da conta.
 * Ambiente controlado por ASAAS_ENV (sandbox | production).
 */

export const ASAAS_ENDPOINTS = {
  sandbox:    'https://api-sandbox.asaas.com',
  production: 'https://api.asaas.com',
} as const

export type AsaasEnv = keyof typeof ASAAS_ENDPOINTS

export interface AsaasConfig {
  env: AsaasEnv
  baseUrl: string
  apiKey: string
}

/**
 * Lê a config do ambiente. Lança se a API Key não estiver configurada —
 * o checkout real deve tratar isso e cair no aviso "gateway não configurado".
 *
 * Seleção por ASAAS_ENV: `production` usa `ASAAS_API_KEY`; qualquer outro
 * valor (default) usa o conjunto `SANDBOX_*`. Assim alterna-se sandbox↔prod
 * trocando apenas ASAAS_ENV, sem reescrever as chaves.
 */
export function getAsaasConfig(): AsaasConfig {
  const isProd = process.env.ASAAS_ENV === 'production'
  const env: AsaasEnv = isProd ? 'production' : 'sandbox'
  const apiKey = (isProd ? process.env.ASAAS_API_KEY : process.env.SANDBOX_ASAAS_API_KEY) ?? ''
  if (!apiKey) {
    throw new Error(`ASAAS_API_KEY (${env}) não configurada. Cadastre a chave de API do Asaas no ambiente.`)
  }
  // baseUrl sempre derivado do host por ambiente (ASAAS_ENDPOINTS); os paths já
  // incluem /v3. NÃO usar ASAAS_BASE_URL do .env (contém /v3 → duplicaria).
  return { env, baseUrl: ASAAS_ENDPOINTS[env], apiKey }
}

/**
 * Token esperado no header `asaas-access-token` do webhook, do ambiente ativo.
 * Sandbox usa `SANDBOX_ASAAS_WEBHOOK_TOKEN`; produção usa `ASAAS_WEBHOOK_TOKEN`.
 */
export function getAsaasWebhookToken(): string {
  const isProd = process.env.ASAAS_ENV === 'production'
  return (isProd ? process.env.ASAAS_WEBHOOK_TOKEN : process.env.SANDBOX_ASAAS_WEBHOOK_TOKEN) ?? ''
}

/** Mapeia ciclo interno (billing_cycle) → cycle do Asaas. */
export function asaasCycle(cycle: 'monthly' | 'yearly'): 'MONTHLY' | 'YEARLY' {
  return cycle === 'yearly' ? 'YEARLY' : 'MONTHLY'
}

export type AsaasBillingType = 'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'UNDEFINED'

// ─── Tipos de payload/resposta (parciais — só o que usamos) ──────────────────

export interface AsaasCustomerInput {
  name: string
  cpfCnpj: string
  email?: string
  mobilePhone?: string
  /** ID interno (clinic_id) para reconciliação reversa. */
  externalReference?: string
  notificationDisabled?: boolean
}

export interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj: string
  email?: string
}

export interface AsaasSubscriptionInput {
  customer: string
  billingType: AsaasBillingType
  value: number
  nextDueDate: string // YYYY-MM-DD
  cycle: 'MONTHLY' | 'YEARLY'
  description?: string
  externalReference?: string
  /** Dados do cartão tokenizado (só p/ billingType CREDIT_CARD). */
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  creditCardHolderInfo?: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    phone: string
  }
  /** IP do titular — exigido pelo Asaas na tokenização de cartão. */
  remoteIp?: string
}

export interface AsaasSubscription {
  id: string
  customer: string
  value: number
  cycle: string
  status: string
  nextDueDate: string
}

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

type AsaasError = { errors?: Array<{ code: string; description: string }> }

async function asaasFetch<T>(
  path: string,
  init: RequestInit & { config?: AsaasConfig } = {}
): Promise<T> {
  const cfg = init.config ?? getAsaasConfig()
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: cfg.apiKey,
      ...(init.headers ?? {}),
    },
  })

  const text = await res.text()
  const body = text ? JSON.parse(text) : {}

  if (!res.ok) {
    const err = body as AsaasError
    const msg = err.errors?.map(e => e.description).join('; ') || `Asaas HTTP ${res.status}`
    throw new Error(`Asaas: ${msg}`)
  }
  return body as T
}

// ─── Operações ───────────────────────────────────────────────────────────────

export function createAsaasCustomer(
  input: AsaasCustomerInput,
  config?: AsaasConfig
): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/v3/customers', {
    method: 'POST',
    body: JSON.stringify(input),
    config,
  })
}

export function getAsaasCustomer(id: string, config?: AsaasConfig): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(`/v3/customers/${encodeURIComponent(id)}`, { config })
}

export function createAsaasSubscription(
  input: AsaasSubscriptionInput,
  config?: AsaasConfig
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/v3/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
    config,
  })
}

export function cancelAsaasSubscription(id: string, config?: AsaasConfig): Promise<{ deleted: boolean }> {
  return asaasFetch<{ deleted: boolean }>(`/v3/subscriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    config,
  })
}
