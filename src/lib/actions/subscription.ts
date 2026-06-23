'use server'

// Server Actions da assinatura SaaS (Fase 1.5 — 4 tiers, sem gateway).
// Checkout dummy: persiste payload simulado (termos + last4/brand), NUNCA
// dados completos de cartão. Preço SEMPRE recalculado no servidor.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertLegalAcceptanceRaw, getRequestMeta } from '@/lib/actions/legal'
import { computePlanPrice, chargeValueFor, STARTER_ADDON_KEYS, type PriceTotals } from '@/lib/subscription/pricing'
import { syncClinicModulesFromContract } from '@/lib/billing/provision'
import {
  getAsaasConfig,
  createAsaasCustomer,
  createAsaasSubscription,
  cancelAsaasSubscription,
  getAsaasSubscriptionPayments,
  getAsaasPixQrCode,
  asaasCycle,
} from '@/lib/billing/asaas'
import type { DummyPaymentPayload, SubscriptionOverview, AsaasCheckout, SubscriptionLead } from '@/lib/subscription/types'
import type {
  BillingCycle,
  BusinessType,
  SubscriptionModuleCatalogRow,
  TenantSubscription,
} from '@/types'

// ─── Context ──────────────────────────────────────────────────────────────────

type Ctx = { clinicId: string; userId: string; isSysmax: boolean; email: string | null }

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
  return { clinicId: profile.clinic_id, userId: user.id, isSysmax: !!profile.is_sysmax, email: user.email ?? null }
}

// Data de hoje em YYYY-MM-DD (fuso local do servidor) para nextDueDate do Asaas.
function ymdToday(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Provisiona customer + subscription no Asaas e devolve a fatura (hospedada) da
// primeira cobrança. Reusa o customer se a clínica já tiver um. Não persiste
// nada — quem grava os IDs é o subscribeToPlan (no mesmo upsert da assinatura).
//
// CARTÃO = fatura HOSPEDADA do Asaas (PCI-safe, D5/LGPD): NÃO enviamos o PAN
// pelo servidor. Criamos a subscription CREDIT_CARD sem dados de cartão; o
// cliente preenche o cartão na página segura do Asaas, que tokeniza e auto-cobra
// os ciclos seguintes. Mesma mecânica de invoiceUrl do PIX.
async function provisionAsaasCheckout(args: {
  admin: ReturnType<typeof createAdminClient>
  clinicId: string
  userEmail: string | null
  plan: 'starter' | 'premium' | 'enterprise'
  cycle: BillingCycle
  method: 'pix' | 'card'
  value: number
}): Promise<
  | { checkout: AsaasCheckout; ids: { asaas_customer_id: string; asaas_subscription_id: string } }
  | { error: string }
> {
  try { getAsaasConfig() } catch { return { error: 'Gateway de pagamento não configurado. Contate o suporte.' } }

  const [clinicRes, fiscalRes, existingRes] = await Promise.all([
    args.admin.from('clinics').select('name, cnpj, phone').eq('id', args.clinicId).single(),
    args.admin.from('clinic_fiscal_config').select('cnpj, razao_social').eq('clinic_id', args.clinicId).maybeSingle(),
    args.admin.from('tenant_subscriptions').select('asaas_customer_id, asaas_subscription_id').eq('clinic_id', args.clinicId).maybeSingle(),
  ])

  const cnpj = String(clinicRes.data?.cnpj ?? fiscalRes.data?.cnpj ?? '').replace(/\D/g, '')
  if (cnpj.length !== 14) {
    return { error: 'Cadastre o CNPJ da clínica (Gestão → Contábil) antes de assinar.' }
  }
  const name = String(clinicRes.data?.name ?? fiscalRes.data?.razao_social ?? 'Clínica').trim()
  const phone = String(clinicRes.data?.phone ?? '').replace(/\D/g, '') || undefined

  // 1. Customer (reusa o existente p/ não duplicar na conta da Sysmax)
  let customerId = existingRes.data?.asaas_customer_id ?? ''
  if (!customerId) {
    try {
      const customer = await createAsaasCustomer({
        name,
        cpfCnpj: cnpj,
        email: args.userEmail ?? undefined,
        mobilePhone: phone,
        externalReference: args.clinicId,
      })
      customerId = customer.id
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Falha ao criar cliente no gateway.' }
    }
  }

  // Cancela a subscription anterior (re-assinatura / mudança de plano-ciclo)
  // para não acumular cobranças recorrentes duplicadas na conta do cliente.
  const previousSubId = existingRes.data?.asaas_subscription_id
  if (previousSubId) {
    try { await cancelAsaasSubscription(previousSubId) } catch { /* já cancelada/inexistente — segue */ }
  }

  // 2. Subscription recorrente (valor já vem com o desconto do método aplicado).
  //    Cartão = CREDIT_CARD sem dados de cartão → fatura hospedada (PCI-safe).
  const billingType = args.method === 'card' ? 'CREDIT_CARD' : 'PIX'
  let subscriptionId = ''
  try {
    const sub = await createAsaasSubscription({
      customer: customerId,
      billingType,
      value: args.value,
      nextDueDate: ymdToday(),
      cycle: asaasCycle(args.cycle === 'yearly' ? 'yearly' : 'monthly'),
      description: `SysVetMax — Plano ${args.plan === 'enterprise' ? 'Enterprise' : args.plan === 'starter' ? 'Starter' : 'Premium'} (${args.cycle === 'yearly' ? 'anual' : 'mensal'})`,
      externalReference: args.clinicId,
    })
    subscriptionId = sub.id
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao criar assinatura no gateway.' }
  }

  // 3. Primeira cobrança → fatura hospedada (não-fatal se ainda não disponível).
  //    PIX também busca o QR copia-e-cola; cartão só usa a invoiceUrl (o cliente
  //    digita o cartão na página segura do Asaas).
  const checkout: AsaasCheckout = {}
  try {
    const payments = await getAsaasSubscriptionPayments(subscriptionId)
    const first = payments.data?.[0]
    if (first?.id) {
      checkout.invoiceUrl = first.invoiceUrl
      if (args.method === 'pix') {
        try {
          const qr = await getAsaasPixQrCode(first.id)
          checkout.pixPayload = qr.payload
          checkout.pixImage = qr.encodedImage
        } catch { /* QR opcional — invoiceUrl já permite pagar */ }
      }
    }
  } catch { /* fatura pode ser consultada depois; assinatura já existe */ }

  return { checkout, ids: { asaas_customer_id: customerId, asaas_subscription_id: subscriptionId } }
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
    admin.from('subscription_plan_config').select('starter_base_price, premium_base_price, enterprise_base_price, annual_discount_percent').eq('id', 1).single(),
  ])

  return {
    subscription: (subResult.data as TenantSubscription | null) ?? null,
    contractedKeys: (contractedResult.data ?? []).map(r => r.module_key as string),
    catalog: (catalogResult.data ?? []).map(r => ({
      ...r,
      monthly_price: Number(r.monthly_price),
    })) as SubscriptionModuleCatalogRow[],
    config: {
      starter_base_price: Number(configResult.data?.starter_base_price ?? 189),
      premium_base_price: Number(configResult.data?.premium_base_price ?? 359.9),
      enterprise_base_price: Number(configResult.data?.enterprise_base_price ?? 1299),
      annual_discount_percent: Number(configResult.data?.annual_discount_percent ?? 20),
    },
    businessType: (clinicResult.data?.business_type ?? 'vet_clinic') as BusinessType,
  }
}

// ─── Mutações ─────────────────────────────────────────────────────────────────

export async function subscribeToPlan(input: {
  plan: 'starter' | 'premium' | 'enterprise'
  addonKeys: string[]
  cycle: BillingCycle
  payment: DummyPaymentPayload
}): Promise<{ ok: true; totals: PriceTotals; checkout?: AsaasCheckout } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  if (input.plan !== 'starter' && input.plan !== 'premium' && input.plan !== 'enterprise') {
    return { error: 'Plano inválido.' }
  }
  if (input.payment?.terms_accepted !== true) {
    return { error: 'Aceite os Termos de Uso para continuar.' }
  }
  if (input.cycle !== 'monthly' && input.cycle !== 'yearly') {
    return { error: 'Ciclo de cobrança inválido.' }
  }
  const method = input.payment.method
  if (method !== 'pix' && method !== 'card') {
    return { error: 'Método de pagamento inválido.' }
  }

  const addonKeys = Array.from(new Set(input.addonKeys ?? []))
  // Enterprise: bundle fechado, sem avulsos. Starter: só a whitelist (NFS-e).
  if (input.plan === 'enterprise' && addonKeys.length > 0) {
    return { error: 'O plano Enterprise não suporta adicionais avulsos.' }
  }
  if (input.plan === 'starter' && addonKeys.some(k => !STARTER_ADDON_KEYS.has(k))) {
    return { error: 'O plano Starter só aceita a NFS-e como adicional.' }
  }

  const admin = createAdminClient()
  const [catalogResult, configResult] = await Promise.all([
    admin.from('subscription_module_catalog').select('module_key, monthly_price, is_available, included_in_plan'),
    admin.from('subscription_plan_config').select('starter_base_price, premium_base_price, enterprise_base_price, annual_discount_percent').eq('id', 1).single(),
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
    starterBase: Number(configResult.data?.starter_base_price ?? 189),
    premiumBase: Number(configResult.data?.premium_base_price ?? 359.9),
    enterpriseBase: Number(configResult.data?.enterprise_base_price ?? 1299),
    annualDiscountPercent: Number(configResult.data?.annual_discount_percent ?? 20),
    catalog: catalog.map(r => ({
      module_key: r.module_key as string,
      monthly_price: Number(r.monthly_price),
      included_in_plan: (r.included_in_plan ?? null) as 'starter' | 'premium' | 'enterprise' | null,
    })),
    addonKeys,
    cycle: input.cycle,
  })

  // Gateway real (PIX e CARTÃO): cria customer + subscription no Asaas e obtém
  // a fatura hospedada. O valor a cobrar depende do método (anual cartão = 10%,
  // anual PIX = 20%, mensal = igual). Cartão nunca trafega o PAN aqui — fatura
  // hospedada (PCI-safe). Ambos nascem 'pending' → módulos só no PAYMENT_CONFIRMED.
  const chargeValue = chargeValueFor(totals, input.cycle, method)
  const provisioned = await provisionAsaasCheckout({
    admin,
    clinicId: ctx.clinicId,
    userEmail: ctx.email,
    plan: input.plan,
    cycle: input.cycle,
    method,
    value: chargeValue,
  })
  if ('error' in provisioned) return provisioned
  const checkout: AsaasCheckout | undefined = provisioned.checkout
  const asaasIds = provisioned.ids

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
        // R6/D5: PIX e CARTÃO (gateway real) nascem 'pending' → módulos só no
        // PAYMENT_CONFIRMED (activatePaidSubscription no webhook). O opt-in encerra
        // o grandfathering: a partir daqui a clínica é regida pela máquina de estados.
        lifecycle_state: 'pending',
        is_grandfathered: false,
        billing_cycle: input.cycle,
        custom_price: null,
        cancelled_at: null,
        current_period_end: periodEnd.toISOString(),
        asaas_customer_id: asaasIds.asaas_customer_id,
        asaas_subscription_id: asaasIds.asaas_subscription_id,
        last_payment_status: 'PENDING',
        payment_payload: {
          gateway: 'asaas',
          plan: input.plan,
          method,
          billing_type: method === 'card' ? 'CREDIT_CARD' : 'PIX',
          charge_value: chargeValue,
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

  // Ativação de módulos (R6): NÃO ativa agora — nem PIX nem cartão. Os módulos
  // liberam só no PAYMENT_CONFIRMED (activatePaidSubscription no webhook). O
  // intento (plano + addon_keys) fica em payment_payload. Não revoga o que a
  // clínica já possui — preserva o acesso de quem faz opt-in/upgrade no pending.

  // Persiste evidência legal do aceite dos termos de assinatura (LGPD Art. 7º)
  const { ip, userAgent } = await getRequestMeta()
  await insertLegalAcceptanceRaw({
    clinicId:     ctx.clinicId,
    userId:       ctx.userId,
    documentType: 'subscription_terms',
    ip,
    userAgent,
  })

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard/management')
  return { ok: true, totals, ...(checkout ? { checkout } : {}) }
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
        lifecycle_state: 'active',
        is_grandfathered: false,
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
  const [{ data: existing }, { data: oldConfig }] = await Promise.all([
    admin.from('subscription_module_catalog').select('module_key, monthly_price'),
    admin.from('subscription_plan_config')
      .select('premium_base_price, enterprise_base_price, annual_discount_percent').eq('id', 1).single(),
  ])
  const oldPrice = new Map((existing ?? []).map(r => [r.module_key as string, Number(r.monthly_price)]))
  const validKeys = new Set(oldPrice.keys())

  for (const mod of input.modules ?? []) {
    if (!validKeys.has(mod.module_key)) return { error: `Módulo desconhecido: ${mod.module_key}` }
    if (!Number.isFinite(mod.monthly_price) || mod.monthly_price < 0) {
      return { error: `Preço inválido para ${mod.module_key}.` }
    }
  }

  // Trilha de auditoria (D4): registra cada preço que de fato mudou.
  const auditRows: PriceAuditRow[] = []
  for (const mod of input.modules ?? []) {
    const { error } = await admin
      .from('subscription_module_catalog')
      .update({ monthly_price: mod.monthly_price, is_available: mod.is_available })
      .eq('module_key', mod.module_key)
    if (error) return { error: `Erro ao salvar ${mod.module_key}: ` + error.message }
    const prev = oldPrice.get(mod.module_key)
    if (prev != null && Number(prev) !== Number(mod.monthly_price)) {
      auditRows.push({ scope: 'catalog_module', target_key: mod.module_key, old_value: prev, new_value: mod.monthly_price })
    }
  }

  const { error: cfgError } = await admin
    .from('subscription_plan_config')
    .update({ premium_base_price, enterprise_base_price, annual_discount_percent })
    .eq('id', 1)
  if (cfgError) return { error: 'Erro ao salvar configuração de preços: ' + cfgError.message }

  for (const [key, oldV, newV] of [
    ['premium_base', Number(oldConfig?.premium_base_price), premium_base_price],
    ['enterprise_base', Number(oldConfig?.enterprise_base_price), enterprise_base_price],
    ['annual_discount', Number(oldConfig?.annual_discount_percent), annual_discount_percent],
  ] as const) {
    if (Number.isFinite(oldV) && oldV !== newV) {
      auditRows.push({ scope: 'plan_config', target_key: key, old_value: oldV, new_value: newV })
    }
  }
  await writePriceAudit(admin, ctx, auditRows)

  revalidatePath('/dashboard/management')
  return { ok: true }
}

// ─── Especializado: lead + preço sob medida com auditoria (R5/D4) ──────────────

type PriceAuditRow = {
  scope: 'specialized_clinic' | 'catalog_module' | 'plan_config'
  clinic_id?: string | null
  target_key?: string | null
  old_value?: number | null
  new_value: number | null
}

// Insere linhas de auditoria de preço (append-only). Falha de auditoria nunca
// derruba a operação de negócio — apenas loga (o preço já foi gravado).
async function writePriceAudit(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { userId: string; email: string | null },
  rows: PriceAuditRow[]
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('subscription_price_audit').insert(
    rows.map(r => ({
      scope: r.scope,
      clinic_id: r.clinic_id ?? null,
      target_key: r.target_key ?? null,
      old_value: r.old_value ?? null,
      new_value: r.new_value,
      changed_by: ctx.userId,
      changed_by_email: ctx.email,
    }))
  )
  if (error) console.error('[price-audit] falha ao gravar trilha:', error.message)
}

// Clínica solicita proposta do Especializado a partir do configurador.
export async function requestSpecializedQuote(input: {
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  desiredModuleKeys: string[]
  estimateMonthly?: number
  message?: string
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx

  const moduleKeys = Array.from(new Set(input.desiredModuleKeys ?? [])).filter(Boolean).slice(0, 100)
  const estimate = Number(input.estimateMonthly)

  const admin = createAdminClient()
  const { error } = await admin.from('subscription_leads').insert({
    clinic_id: ctx.clinicId,
    requested_by: ctx.userId,
    contact_name: input.contactName?.trim().slice(0, 160) || null,
    contact_email: input.contactEmail?.trim().slice(0, 160) || null,
    contact_phone: input.contactPhone?.replace(/\D/g, '').slice(0, 20) || null,
    desired_module_keys: moduleKeys,
    estimate_monthly: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
    message: input.message?.trim().slice(0, 2000) || null,
    status: 'new',
  })
  if (error) return { error: 'Não foi possível registrar a solicitação: ' + error.message }
  return { ok: true }
}

// Lista os leads do Especializado para o time Sysmax (funil comercial).
export async function listSubscriptionLeads(): Promise<{ leads: SubscriptionLead[] } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx
  if (!ctx.isSysmax) return { error: 'Apenas o time SysMax pode ver os leads.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscription_leads')
    .select('id, clinic_id, contact_name, contact_email, contact_phone, desired_module_keys, estimate_monthly, message, status, created_at, clinics(name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { error: 'Erro ao carregar leads: ' + error.message }

  const leads = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    clinic_id: r.clinic_id as string,
    clinic_name: (r.clinics as { name?: string } | null)?.name ?? null,
    contact_name: (r.contact_name as string) ?? null,
    contact_email: (r.contact_email as string) ?? null,
    contact_phone: (r.contact_phone as string) ?? null,
    desired_module_keys: (r.desired_module_keys as string[]) ?? [],
    estimate_monthly: r.estimate_monthly != null ? Number(r.estimate_monthly) : null,
    message: (r.message as string) ?? null,
    status: (r.status as SubscriptionLead['status']) ?? 'new',
    created_at: r.created_at as string,
  }))
  return { leads }
}

// Time Sysmax avança o lead no funil (new → contacted → won/lost).
export async function updateLeadStatus(input: {
  leadId: string
  status: 'new' | 'contacted' | 'won' | 'lost'
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx
  if (!ctx.isSysmax) return { error: 'Apenas o time SysMax pode gerenciar leads.' }
  if (!['new', 'contacted', 'won', 'lost'].includes(input.status)) return { error: 'Status inválido.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('subscription_leads')
    .update({ status: input.status, handled_by: ctx.userId })
    .eq('id', input.leadId)
  if (error) return { error: 'Erro ao atualizar lead: ' + error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

// Time Sysmax define o preço sob medida do Especializado de uma clínica, com
// trilha de auditoria (quem/quando/valor anterior→novo). NUNCA preço em branco.
export async function setSpecializedPrice(input: {
  clinicId: string
  monthlyPrice: number
  note?: string
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getAdminCtx()
  if ('error' in ctx) return ctx
  if (!ctx.isSysmax) return { error: 'Apenas o time SysMax pode definir o preço do Especializado.' }

  const price = Number(input.monthlyPrice)
  if (!Number.isFinite(price) || price <= 0) return { error: 'Informe um valor mensal válido (> 0).' }
  if (!input.clinicId) return { error: 'Clínica não informada.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('tenant_subscriptions')
    .select('custom_price')
    .eq('clinic_id', input.clinicId)
    .maybeSingle()
  const oldPrice = current?.custom_price != null ? Number(current.custom_price) : null

  const { error } = await admin
    .from('tenant_subscriptions')
    .upsert(
      {
        clinic_id: input.clinicId,
        plan_name: 'specialized',
        status: 'active',
        lifecycle_state: 'active',
        billing_cycle: null,
        custom_price: price,
        cancelled_at: null,
      },
      { onConflict: 'clinic_id' }
    )
  if (error) return { error: 'Erro ao definir preço: ' + error.message }

  await writePriceAudit(admin, ctx, [{
    scope: 'specialized_clinic',
    clinic_id: input.clinicId,
    target_key: 'custom_price',
    old_value: oldPrice,
    new_value: price,
  }])

  revalidatePath('/dashboard/management')
  return { ok: true }
}
