// Notificação de exame não realizado. Módulo server-only SEM 'use server'
// (é importado apenas por server actions). Reaproveita os canais existentes:
// Evolution API (WhatsApp) e Resend (e-mail) — nada novo de infraestrutura.
//
// Best-effort por princípio: uma falha de WhatsApp/e-mail NUNCA pode derrubar
// o registro da rejeição, senão o laboratório fica sem conseguir marcar o exame.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'
import { sendTutorPortalWhatsApp } from '@/lib/actions/tutor-portal'
import { buildRejectionMessage, type Recipient } from '@/lib/exams/rejection-flow'

const FROM = 'SysVetMax <noreply@sysmaxsolutions.com>'

export interface NotifyInput {
  clinicId:   string
  clinicName: string
  petName:    string
  examName:   string
  reason:     string
  note?:      string | null
  /** Link do Portal do Parceiro (onde a clínica parceira / MV responde). */
  partnerLink?: string | null
}

export interface NotifyOutcome {
  sent:   Array<{ kind: Recipient['kind']; channel: 'whatsapp' | 'email'; name: string }>
  failed: Array<{ kind: Recipient['kind']; name: string; why: string }>
}

function emailHtml(i: NotifyInput, canDecide: boolean, link?: string | null): string {
  const rows: Array<[string, string]> = [
    ['Pet', i.petName],
    ['Exame', i.examName],
    ['Motivo', i.reason],
  ]
  if (i.note?.trim()) rows.push(['Observação', i.note.trim()])
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#b45309;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${i.clinicName}</h1>
      <p style="margin:6px 0 0;color:#fde68a;font-size:13px;">Exame não realizado</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 12px;color:#0f172a;font-size:14px;line-height:1.5;">
        Não foi possível realizar o exame abaixo. <strong>Este exame não será cobrado.</strong>
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:16px 0;">
        <table style="width:100%;border-collapse:collapse;">
          ${rows.map(([k, v]) => `<tr>
            <td style="padding:4px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">${k}</td>
            <td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${v}</td>
          </tr>`).join('')}
        </table>
      </div>
      ${canDecide ? `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.5;">
        Deseja <strong>recoletar</strong> a amostra ou <strong>não recoletar</strong>?
      </p>` : ''}
      ${canDecide && link ? `<a href="${link}" style="display:block;background:#b45309;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">Responder no portal</a>` : ''}
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">SysMax Solutions · suporte@sysmaxsolutions.com</p>
    </div>
  </div>
</body></html>`
}

/**
 * Avisa todos os destinatários resolvidos. Cada canal é independente: quem tem
 * telefone recebe WhatsApp, quem tem e-mail recebe e-mail, o tutor recebe pelo
 * canal do portal (que já respeita portal_enabled).
 */
export async function notifyExamRejection(
  input: NotifyInput,
  recipients: Recipient[],
): Promise<NotifyOutcome> {
  const out: NotifyOutcome = { sent: [], failed: [] }
  if (recipients.length === 0) return out

  const admin = createAdminClient()

  // Credenciais de WhatsApp da clínica (mesma origem usada em tutor-portal.ts).
  let creds: { apiUrl: string; instanceId: string; apiKey: string } | null = null
  try {
    const { data: wpp } = await admin
      .from('clinic_whatsapp_settings')
      .select('evolution_instance_name')
      .eq('clinic_id', input.clinicId)
      .maybeSingle()
    const instanceId = (wpp as { evolution_instance_name?: string } | null)?.evolution_instance_name
    const apiUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    if (instanceId && apiUrl && apiKey) creds = { apiUrl, instanceId, apiKey }
  } catch { /* segue sem WhatsApp */ }

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

  for (const r of recipients) {
    const msg = buildRejectionMessage({
      petName: input.petName, examName: input.examName, reason: input.reason,
      note: input.note, clinicName: input.clinicName,
      link: r.kind === 'tutor' ? null : input.partnerLink, canDecide: r.canDecide,
    })

    let reached = false

    // Tutor: canal do portal (já embute o link de login e o gate portal_enabled).
    if (r.kind === 'tutor') {
      try {
        const res = await sendTutorPortalWhatsApp(r.id, msg)
        if (res.ok) { out.sent.push({ kind: r.kind, channel: 'whatsapp', name: r.name }); reached = true }
      } catch { /* best-effort */ }
      if (!reached) out.failed.push({ kind: r.kind, name: r.name, why: 'Tutor sem WhatsApp/portal ativo.' })
      continue
    }

    if (r.phone && creds) {
      try {
        const id = await evolutionSendText(creds, r.phone, msg)
        if (id) { out.sent.push({ kind: r.kind, channel: 'whatsapp', name: r.name }); reached = true }
      } catch { /* best-effort */ }
    }

    if (r.email && resend) {
      try {
        const { error } = await resend.emails.send({
          from: FROM, to: r.email,
          subject: `Exame não realizado — ${input.petName} (${input.clinicName})`,
          html: emailHtml(input, r.canDecide, input.partnerLink),
        })
        if (!error) { out.sent.push({ kind: r.kind, channel: 'email', name: r.name }); reached = true }
      } catch { /* best-effort */ }
    }

    if (!reached) out.failed.push({ kind: r.kind, name: r.name, why: 'Sem telefone/e-mail utilizável.' })
  }

  return out
}
