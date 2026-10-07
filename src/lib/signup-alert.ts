import { evolutionSendText } from '@/lib/evolution-api-client'

// ─────────────────────────────────────────────────────────────────────────────
// Alerta comercial: avisa o time quando uma nova clínica nasce no plano Free
// (self-signup PLG) e registra o cadastro como lead no painel comercial. Falha
// SEMPRE em silêncio — nunca pode quebrar o cadastro do cliente.
// WhatsApp: COMMERCIAL_WHATSAPP (lista separada por vírgula; fallback
// P0_ALERT_PHONE) na instância COMMERCIAL_ALERT_INSTANCE ?? P0_ALERT_INSTANCE ??
// EVOLUTION_INSTANCE. Painel: SALES_SIGNUP_WEBHOOK_URL + SALES_SIGNUP_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
export interface FreeSignupAlertOptions {
  clinicName: string
  adminName?: string | null
  email?: string | null
  phone?: string | null
  cnpj?: string | null
}

const WEBHOOK_TIMEOUT_MS = 4000

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 4 ? `***${digits.slice(-4)}` : '***'
}

async function notifyWhatsApp(opts: FreeSignupAlertOptions): Promise<void> {
  const recipients = (process.env.COMMERCIAL_WHATSAPP ?? process.env.P0_ALERT_PHONE ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance =
    process.env.COMMERCIAL_ALERT_INSTANCE ?? process.env.P0_ALERT_INSTANCE ?? process.env.EVOLUTION_INSTANCE

  if (recipients.length === 0 || !apiUrl || !apiKey || !instance) {
    console.warn(
      '[Signup Alert] Evolution/COMMERCIAL_WHATSAPP não configurados — alerta ignorado (verifique COMMERCIAL_WHATSAPP ou P0_ALERT_PHONE, EVOLUTION_API_URL/KEY e a instância no Vercel)',
    )
    return
  }

  let when: string
  try {
    when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } catch {
    when = new Date().toISOString()
  }

  const message = [
    `🆕 *Nova clínica no plano Free — SYSVETMAX*`,
    ``,
    `Clínica: *${opts.clinicName}*`,
    opts.adminName ? `Responsável: ${opts.adminName}` : '',
    opts.phone ? `Telefone: ${opts.phone}` : '',
    opts.email ? `E-mail: ${opts.email}` : '',
    opts.cnpj ? `CNPJ: ${opts.cnpj}` : '',
    `Cadastro: ${when}`,
    ``,
    `Entre em contato para ativar e apresentar os planos. 🐾`,
  ]
    .filter(Boolean)
    .join('\n')

  await Promise.all(
    recipients.map(async (to) => {
      try {
        await evolutionSendText({ apiUrl, instanceId: instance, apiKey }, to, message)
        console.info(`[Signup Alert] Enviado para ${maskPhone(to)}`)
      } catch (err) {
        console.error(`[Signup Alert] Falha ao enviar para ${maskPhone(to)}:`, err)
      }
    }),
  )
}

async function notifySalesPanel(opts: FreeSignupAlertOptions): Promise<void> {
  const url = process.env.SALES_SIGNUP_WEBHOOK_URL
  const secret = process.env.SALES_SIGNUP_WEBHOOK_SECRET
  if (!url || !secret) {
    console.warn('[Signup Alert] SALES_SIGNUP_WEBHOOK_URL/SECRET não configurados — painel comercial ignorado')
    return
  }

  const payload: Record<string, string> = { createdAt: new Date().toISOString() }
  if (opts.clinicName) payload.clinicName = opts.clinicName
  if (opts.adminName) payload.adminName = opts.adminName
  if (opts.email) payload.email = opts.email
  if (opts.phone) payload.phone = opts.phone
  if (opts.cnpj) payload.cnpj = opts.cnpj

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sysmax-secret': secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    if (!res.ok) console.error(`[Signup Alert] Painel comercial respondeu ${res.status}`)
  } catch (err) {
    console.error('[Signup Alert] Falha ao registrar lead no painel comercial:', err)
  }
}

export async function sendFreeSignupAlert(opts: FreeSignupAlertOptions): Promise<void> {
  await Promise.allSettled([notifyWhatsApp(opts), notifySalesPanel(opts)])
}
