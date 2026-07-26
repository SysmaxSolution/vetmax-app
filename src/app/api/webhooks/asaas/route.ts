import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAsaasWebhookToken } from '@/lib/billing/asaas'
import { activatePaidSubscription, attemptSuspendSubscription } from '@/lib/billing/provision'

// POST /api/webhooks/asaas
// Recebe eventos de cobrança do Asaas (Monetização SaaS — Fase 2).
// Autenticação: header `asaas-access-token` == token do ambiente ativo
//   (sandbox: SANDBOX_ASAAS_WEBHOOK_TOKEN | produção: ASAAS_WEBHOOK_TOKEN),
//   resolvido por getAsaasWebhookToken() conforme ASAAS_ENV.
// Idempotente: usa asaas_payment_id (UNIQUE) em subscription_invoices.
//
// Cadastrar no painel do Asaas: Configurações > Webhooks
//   URL:   https://<app>/api/webhooks/asaas
//   Token: o MESMO valor da variável de webhook do ambiente

interface AsaasPayment {
  id: string
  customer?: string
  subscription?: string
  billingType?: string
  value?: number
  status?: string
  dueDate?: string
  paymentDate?: string
  invoiceUrl?: string
}

// Eventos que confirmam recebimento (libera/mantém a clínica ativa).
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
// Eventos de inadimplência (marca atraso; suspensão é decidida pelo cron).
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE'])
// Estorno / chargeback — vai direto para suspensão (respeitando a carência D3).
// Nome real do evento no Asaas é PAYMENT_CHARGEBACK_REQUESTED (não existe
// PAYMENT_CHARGEBACK — a API rejeita esse nome no cadastro do webhook).
const REVERSAL_EVENTS = new Set(['PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REFUNDED'])

export async function POST(request: NextRequest) {
  // 1. Autenticação do webhook
  const token = request.headers.get('asaas-access-token') ?? ''
  const expected = getAsaasWebhookToken()
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { event?: string; payment?: AsaasPayment }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'invalid payload' }, { status: 400 }) }

  const event = (body.event ?? '').toUpperCase()
  const payment = body.payment
  if (!event || !payment?.id) return NextResponse.json({ received: true })

  const admin = createAdminClient()

  // 2. Localiza a clínica pelo customer/subscription
  const { data: sub } = await admin
    .from('tenant_subscriptions')
    .select('clinic_id, plan_name, lifecycle_state, billing_cycle')
    .or(
      [
        payment.subscription ? `asaas_subscription_id.eq.${payment.subscription}` : null,
        payment.customer ? `asaas_customer_id.eq.${payment.customer}` : null,
      ].filter(Boolean).join(',')
    )
    .maybeSingle()

  if (!sub?.clinic_id) {
    // Sem vínculo conhecido — aceita p/ não reentregar, mas registra nada.
    return NextResponse.json({ received: true, matched: false })
  }

  // 3. Registra/atualiza a cobrança (idempotente por asaas_payment_id)
  await admin
    .from('subscription_invoices')
    .upsert(
      {
        clinic_id: sub.clinic_id,
        asaas_payment_id: payment.id,
        asaas_subscription_id: payment.subscription ?? null,
        billing_type: payment.billingType ?? null,
        value: payment.value ?? 0,
        status: payment.status ?? event.replace('PAYMENT_', ''),
        due_date: payment.dueDate ?? null,
        paid_at: PAID_EVENTS.has(event) ? new Date().toISOString() : null,
        invoice_url: payment.invoiceUrl ?? null,
      },
      { onConflict: 'asaas_payment_id' }
    )

  // 4. Reflete o status na assinatura do tenant
  const patch: Record<string, unknown> = {
    last_payment_status: payment.status ?? event.replace('PAYMENT_', ''),
  }
  if (PAID_EVENTS.has(event)) {
    patch.last_payment_at = new Date().toISOString()
    patch.status = 'active'
  } else if (OVERDUE_EVENTS.has(event)) {
    patch.status = 'past_due'
    // R6/R7: marca o estado e ancora o relógio dos 7 dias (past_due_since) só na
    // ENTRADA em atraso. A suspensão após carência (7d) + carência clínica D3 é
    // feita pelo cron de dunning, não aqui no evento.
    patch.lifecycle_state = 'past_due'
    if (sub.lifecycle_state !== 'past_due' && sub.lifecycle_state !== 'grace') {
      patch.past_due_since = new Date().toISOString()
    }
  }

  await admin
    .from('tenant_subscriptions')
    .update(patch)
    .eq('clinic_id', sub.clinic_id)

  // R6: pagamento confirmado → ativa módulos (mesma lógica do checkout) e marca
  // lifecycle_state='active'. Idempotente: reentrega do webhook não duplica nada.
  if (PAID_EVENTS.has(event)) {
    const activated = await activatePaidSubscription(admin, sub.clinic_id)
    if (activated.error) {
      // Não falha o webhook (evita reentrega infinita); a cobrança já foi
      // registrada e o status atualizado. Loga p/ investigação.
      console.error('[asaas-webhook] ativação pós-pagamento falhou:', activated.error)
    }
  }

  // R7: estorno/chargeback → suspende já (anual → expired). Respeita a carência
  // clínica D3: se há internação/prontuário aberto, não corta módulos — entra
  // em 'grace' e o cron reavalia quando os registros fecharem.
  if (REVERSAL_EVENTS.has(event)) {
    const target = sub.billing_cycle === 'yearly' ? 'expired' : 'suspended'
    const result = await attemptSuspendSubscription(admin, sub.clinic_id, target)
    if (result.deferred) {
      await admin
        .from('tenant_subscriptions')
        .update({ lifecycle_state: 'grace', past_due_since: new Date().toISOString() })
        .eq('clinic_id', sub.clinic_id)
    } else if (result.error) {
      console.error('[asaas-webhook] suspensão por estorno falhou:', result.error)
    }
    // TODO Item 7: cancelar a NFS-e correspondente ao estorno.
  }

  return NextResponse.json({ received: true, matched: true })
}
