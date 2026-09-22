// E-mails transacionais do fluxo de imagem (Resend). Módulo server-only, sem
// 'use server' (é importado apenas pela server action imaging.ts). Segue o
// padrão visual de send-invite-email.ts.
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? '')
}

const FROM = 'SysVetMax <noreply@sysmaxsolutions.com>'

interface ImagingEmailParams {
  to:          string
  vetName?:    string | null
  clinicName:  string
  petName:     string
  modality?:   string | null
  studyTitle?: string | null
  linkUrl:     string
}

function shell(inner: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0d9488;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">SysVetMax</h1>
      <p style="margin:6px 0 0;color:#ccfbf1;font-size:13px;">Centro de Diagnóstico</p>
    </div>
    <div style="padding:28px 24px;">${inner}</div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">SysMax Solutions · suporte@sysmaxsolutions.com</p>
    </div>
  </div>
</body></html>`
}

function detailsBox(p: ImagingEmailParams): string {
  const rows = [
    ['Paciente', p.petName],
    ['Exame', p.studyTitle || p.modality || 'Exame de imagem'],
    ['Solicitado por', p.vetName || '—'],
    ['Local', p.clinicName],
  ]
  return `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px;margin:16px 0;">
    <table style="width:100%;border-collapse:collapse;">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:4px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">${k}</td>
        <td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${v}</td>
      </tr>`).join('')}
    </table>
  </div>`
}

function cta(url: string, label: string): string {
  return `<a href="${url}" style="display:block;background:#0d9488;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>`
}

/** E-mail #1 — imagens disponíveis (ANTES do laudo). */
export async function sendImagesReadyEmail(p: ImagingEmailParams): Promise<{ error?: string }> {
  const greeting = p.vetName ? `Dr(a). ${p.vetName},` : 'Olá,'
  const inner = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:19px;font-weight:700;">Imagens disponíveis</h2>
    <p style="margin:0 0 4px;color:#0f172a;font-size:14px;">${greeting}</p>
    <p style="margin:0 0 4px;color:#64748b;font-size:14px;line-height:1.5;">
      As imagens do exame do paciente <strong>${p.petName}</strong> já estão disponíveis online.
      <strong>O laudo assinado será enviado assim que ficar pronto.</strong>
    </p>
    ${detailsBox(p)}
    ${cta(p.linkUrl, 'Ver as imagens')}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
      Link de acesso seguro. Não compartilhe com terceiros não autorizados.
    </p>`
  try {
    const { error } = await getResend().emails.send({
      from: FROM, to: p.to,
      subject: `Imagens disponíveis — ${p.petName} (${p.clinicName})`,
      html: shell(inner),
    })
    if (error) { console.error('[imaging-email:images]', error); return { error: 'Falha ao enviar e-mail.' } }
    return {}
  } catch (err) {
    console.error('[imaging-email:images]', err); return { error: 'Erro no serviço de e-mail.' }
  }
}

/** E-mail #2 — laudo liberado. */
export async function sendLaudoReadyEmail(p: ImagingEmailParams): Promise<{ error?: string }> {
  const greeting = p.vetName ? `Dr(a). ${p.vetName},` : 'Olá,'
  const inner = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:19px;font-weight:700;">Laudo liberado</h2>
    <p style="margin:0 0 4px;color:#0f172a;font-size:14px;">${greeting}</p>
    <p style="margin:0 0 4px;color:#64748b;font-size:14px;line-height:1.5;">
      O laudo assinado do exame do paciente <strong>${p.petName}</strong> já está disponível,
      junto com as imagens.
    </p>
    ${detailsBox(p)}
    ${cta(p.linkUrl, 'Ver laudo e imagens')}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
      Link de acesso seguro. Não compartilhe com terceiros não autorizados.
    </p>`
  try {
    const { error } = await getResend().emails.send({
      from: FROM, to: p.to,
      subject: `Laudo liberado — ${p.petName} (${p.clinicName})`,
      html: shell(inner),
    })
    if (error) { console.error('[imaging-email:laudo]', error); return { error: 'Falha ao enviar e-mail.' } }
    return {}
  } catch (err) {
    console.error('[imaging-email:laudo]', err); return { error: 'Erro no serviço de e-mail.' }
  }
}
