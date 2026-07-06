import { evolutionSendText } from '@/lib/evolution-api-client'

// ─────────────────────────────────────────────────────────────────────────────
// Alerta comercial: notifica o time no WhatsApp quando uma nova clínica nasce no
// plano Free (self-signup PLG). Espelha o padrão de p0-alert.ts. Falha SEMPRE em
// silêncio — nunca pode quebrar o cadastro do cliente.
// Destino: COMMERCIAL_WHATSAPP (fallback P0_ALERT_PHONE). Instância:
// COMMERCIAL_ALERT_INSTANCE ?? P0_ALERT_INSTANCE ?? EVOLUTION_INSTANCE.
// ─────────────────────────────────────────────────────────────────────────────
export interface FreeSignupAlertOptions {
  clinicName: string
  adminName?: string | null
  phone?: string | null
  cnpj?: string | null
}

export async function sendFreeSignupAlert(opts: FreeSignupAlertOptions): Promise<void> {
  const alertPhone = process.env.COMMERCIAL_WHATSAPP ?? process.env.P0_ALERT_PHONE
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance =
    process.env.COMMERCIAL_ALERT_INSTANCE ?? process.env.P0_ALERT_INSTANCE ?? process.env.EVOLUTION_INSTANCE

  if (!alertPhone || !apiUrl || !apiKey || !instance) {
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
    opts.cnpj ? `CNPJ: ${opts.cnpj}` : '',
    `Cadastro: ${when}`,
    ``,
    `Entre em contato para ativar e apresentar os planos. 🐾`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    await evolutionSendText({ apiUrl, instanceId: instance, apiKey }, alertPhone, message)
    console.info(`[Signup Alert] Enviado para ${alertPhone} — clínica=${opts.clinicName}`)
  } catch (err) {
    console.error('[Signup Alert] Falha ao enviar alerta de cadastro:', err)
  }
}
