'use server'

import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? '')
}

interface SendInviteParams {
  to:         string
  clinicName: string
  inviterName: string
  role:       string
  inviteUrl:  string
}

const ROLE_LABELS: Record<string, string> = {
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Técnico',
}

export async function sendInviteEmail(params: SendInviteParams): Promise<{ error?: string }> {
  const { to, clinicName, inviterName, role, inviteUrl } = params
  const roleLabel = ROLE_LABELS[role] ?? role

  try {
    const { error } = await getResend().emails.send({
      from: 'SysVetMax <noreply@sysmaxsolutions.com>',
      to,
      subject: `Convite para ingressar na ${clinicName} — SysVetMax`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">

    <div style="background:#0d9488;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">SysVetMax</h1>
      <p style="margin:8px 0 0;color:#ccfbf1;font-size:14px;">Plataforma Veterinária Inteligente</p>
    </div>

    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:700;">Você foi convidado!</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.5;">
        <strong style="color:#0f172a;">${inviterName}</strong> convidou você para ingressar na equipe da clínica veterinária.
      </p>

      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Clínica</td>
            <td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${clinicName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Função</td>
            <td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${roleLabel}</td>
          </tr>
        </table>
      </div>

      <a href="${inviteUrl}" style="display:block;background:#0d9488;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">
        Criar minha conta e ingressar
      </a>

      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
        Este convite é válido por 7 dias.<br>
        Caso não reconheça este convite, ignore este e-mail.
      </p>
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        SysMax Solutions · suporte@sysmaxsolutions.com
      </p>
    </div>
  </div>
</body>
</html>`,
    })

    if (error) {
      console.error('[send-invite-email]', error)
      return { error: 'Falha ao enviar e-mail. Tente novamente.' }
    }

    return {}
  } catch (err) {
    console.error('[send-invite-email]', err)
    return { error: 'Erro ao conectar com o serviço de e-mail.' }
  }
}
