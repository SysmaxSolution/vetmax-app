// Webhook do Resend: entregue, atrasado, devolvido, spam, aberto, clicado.
// Atualiza email_deliveries pelo id do e-mail no provedor.
//
// Assinatura Svix obrigatória (RESEND_WEBHOOK_SECRET). Sem secret configurado
// a rota recusa tudo: aceitar evento não assinado permitiria forjar "entregue".
// A conta do Resend é compartilhada com outros sistemas da Sysmax; eventos de
// e-mails que não são nossos simplesmente não casam com nenhuma linha.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarAssinaturaSvix, interpretarEvento } from '@/lib/email/resend-webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error('[webhook resend] RESEND_WEBHOOK_SECRET ausente — evento recusado')
    return NextResponse.json({ error: 'webhook não configurado' }, { status: 503 })
  }

  const body = await req.text()
  const ok = verificarAssinaturaSvix({
    secret,
    msgId:     req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
    body,
  })
  if (!ok) {
    console.warn('[webhook resend] assinatura inválida — request rejeitada')
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  let payload: unknown
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'json inválido' }, { status: 400 }) }
  const ev = interpretarEvento(payload)
  if (!ev || !ev.emailId) return NextResponse.json({ ignored: true })

  const admin = createAdminClient()
  const quando = ev.quando ?? new Date().toISOString()
  const patch: Record<string, unknown> = { last_event: ev.tipo, last_event_at: quando, updated_at: new Date().toISOString() }
  if (ev.status) patch.status = ev.status
  if (ev.abriu)  patch.opened_at = quando
  if (ev.clicou) patch.clicked_at = quando
  if (ev.motivo && (ev.status === 'bounced' || ev.status === 'failed' || ev.status === 'suppressed')) patch.error = ev.motivo.slice(0, 300)

  // O id do provedor é único por e-mail (índice uq_email_deliveries_provider_message).
  const { data, error } = await admin
    .from('email_deliveries')
    .update(patch)
    .eq('provider', 'resend')
    .eq('provider_message_id', ev.emailId)
    .select('id')
  if (error) {
    console.error('[webhook resend] falha ao gravar evento', ev.tipo, ev.emailId, error.message)
    return NextResponse.json({ error: 'falha ao gravar' }, { status: 500 })
  }
  return NextResponse.json({ updated: (data ?? []).length })
}
