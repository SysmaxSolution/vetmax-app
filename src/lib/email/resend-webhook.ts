// Webhook do Resend — módulo puro (sem I/O), testável.
//
// O Resend assina cada chamada no padrão Svix: cabeçalhos `svix-id`,
// `svix-timestamp` e `svix-signature` ("v1,<base64>" — pode vir mais de uma,
// separadas por espaço). O conteúdo assinado é `${id}.${timestamp}.${corpo}`
// com HMAC-SHA256, chave = base64 do secret sem o prefixo "whsec_".

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EmailStatus } from '@/lib/email/email-status'

export { textoDoStatus, EMAIL_STATUS } from '@/lib/email/email-status'
export type { EmailStatus } from '@/lib/email/email-status'

export function verificarAssinaturaSvix(p: {
  secret: string
  msgId: string | null
  timestamp: string | null
  signature: string | null
  body: string
  agoraMs?: number
  toleranciaSeg?: number
}): boolean {
  const { secret, msgId, timestamp, signature, body } = p
  if (!secret || !msgId || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const agora = Math.floor((p.agoraMs ?? Date.now()) / 1000)
  if (Math.abs(agora - ts) > (p.toleranciaSeg ?? 300)) return false

  const chave = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const esperado = createHmac('sha256', chave).update(`${msgId}.${timestamp}.${body}`).digest()
  for (const parte of signature.split(' ')) {
    const [versao, valor] = parte.split(',')
    if (versao !== 'v1' || !valor) continue
    const recebido = Buffer.from(valor, 'base64')
    if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) return true
  }
  return false
}

/** Assina como o Resend assinaria — usado nos testes e em simulações. */
export function assinarSvix(secret: string, msgId: string, timestamp: string, body: string): string {
  const chave = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return 'v1,' + createHmac('sha256', chave).update(`${msgId}.${timestamp}.${body}`).digest('base64')
}

/** Tipo do evento → status da entrega. Abertura e clique não mudam o status. */
export function statusDoEvento(tipo: string): EmailStatus | null {
  switch (tipo) {
    case 'email.sent':             return 'sent'
    case 'email.delivered':        return 'delivered'
    case 'email.delivery_delayed': return 'delayed'
    case 'email.bounced':          return 'bounced'
    case 'email.complained':       return 'complained'
    case 'email.failed':           return 'failed'
    case 'email.suppressed':       return 'suppressed'
    default:                       return null
  }
}

export interface EventoResend {
  tipo:       string
  emailId:    string | null
  destino:    string | null
  assunto:    string | null
  quando:     string | null
  status:     EmailStatus | null
  abriu:      boolean
  clicou:     boolean
  motivo:     string | null
}

/** Lê o payload do webhook sem confiar em campo nenhum (tudo opcional). */
export function interpretarEvento(payload: unknown): EventoResend | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> }
  const tipo = typeof p.type === 'string' ? p.type : ''
  if (!tipo.startsWith('email.')) return null
  const d = p.data ?? {}
  const to = Array.isArray(d.to) ? String(d.to[0] ?? '') : typeof d.to === 'string' ? d.to : null
  const bounce = d.bounce as { message?: string; type?: string } | undefined
  const motivo = bounce?.message ?? (typeof d.reason === 'string' ? d.reason : null) ?? (typeof d.error === 'string' ? d.error : null)
  return {
    tipo,
    emailId: typeof d.email_id === 'string' ? d.email_id : null,
    destino: to || null,
    assunto: typeof d.subject === 'string' ? d.subject : null,
    quando:  typeof p.created_at === 'string' ? p.created_at : null,
    status:  statusDoEvento(tipo),
    abriu:   tipo === 'email.opened',
    clicou:  tipo === 'email.clicked',
    motivo:  motivo ?? null,
  }
}

// textoDoStatus vive em email-status.ts (sem Node), para a tela poder importar.
