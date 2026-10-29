// Envia um e-mail pelo Resend e deixa registro em email_deliveries, antes e
// depois: a linha nasce como `queued`, vira `sent` com o id do provedor ou
// `failed` com o motivo. O webhook (/api/webhooks/resend) atualiza depois para
// delivered / bounced / complained / delayed.
//
// Servidor, sem auth: quem chama já conferiu usuário e clínica.

import { createAdminClient } from '@/lib/supabase/admin'
import { getResend, traduzirErroResend, REMETENTE_PADRAO } from '@/lib/email/resend-client'

export type TipoEmail = 'convite' | 'exame_rejeitado' | 'imagens_disponiveis' | 'laudo_liberado' | 'outro'

export interface EnvioEmail {
  clinicId:     string | null
  kind:         TipoEmail
  to:           string
  subject:      string
  html:         string
  from?:        string
  referenceId?: string | null
  createdBy?:   string | null
}

export type ResultadoEnvio =
  | { ok: true;  deliveryId: string | null; providerId: string | null }
  | { ok: false; deliveryId: string | null; error: string }

export async function enviarEmailRegistrado(p: EnvioEmail): Promise<ResultadoEnvio> {
  const admin = createAdminClient()
  const to = p.to.trim().toLowerCase()

  // Registro primeiro: se o processo morrer no meio, fica a fila e não o silêncio.
  const { data: linha } = await admin
    .from('email_deliveries')
    .insert({ clinic_id: p.clinicId, kind: p.kind, recipient: to, subject: p.subject, provider: 'resend', status: 'queued', reference_id: p.referenceId ?? null, created_by: p.createdBy ?? null })
    .select('id')
    .maybeSingle()
  const deliveryId = (linha?.id as string | undefined) ?? null
  const marcar = async (campos: Record<string, unknown>) => {
    if (!deliveryId) return
    await admin.from('email_deliveries').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', deliveryId)
  }

  const resend = getResend()
  if (!resend) {
    const error = 'O serviço de e-mail não está configurado (chave ausente). Avise o suporte SysMax.'
    console.error('[email] RESEND_API_KEY ausente ao enviar', p.kind, 'para', to)
    await marcar({ status: 'failed', error, last_event: 'config', last_event_at: new Date().toISOString() })
    return { ok: false, deliveryId, error }
  }

  try {
    const { data, error } = await resend.emails.send({ from: p.from ?? REMETENTE_PADRAO, to, subject: p.subject, html: p.html })
    if (error) {
      const t = traduzirErroResend(error)
      console.error('[email] Resend recusou', p.kind, 'para', to, '→', t.detalhe)
      await marcar({ status: 'failed', error: `${t.texto} (${t.detalhe.slice(0, 180)})`, last_event: 'rejected', last_event_at: new Date().toISOString() })
      return { ok: false, deliveryId, error: t.texto }
    }
    await marcar({ status: 'sent', provider_message_id: data?.id ?? null, last_event: 'accepted', last_event_at: new Date().toISOString() })
    return { ok: true, deliveryId, providerId: data?.id ?? null }
  } catch (e) {
    const t = traduzirErroResend(e)
    console.error('[email] falha ao chamar o Resend', p.kind, 'para', to, '→', t.detalhe)
    await marcar({ status: 'failed', error: `Erro ao conectar com o serviço de e-mail (${t.detalhe.slice(0, 180)})`, last_event: 'exception', last_event_at: new Date().toISOString() })
    return { ok: false, deliveryId, error: 'Erro ao conectar com o serviço de e-mail. Tente de novo em instantes.' }
  }
}
