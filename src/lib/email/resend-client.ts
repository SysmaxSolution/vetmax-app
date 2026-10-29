// Cliente do Resend. Aceita a chave em RESEND_API_KEY (nome usado na Vercel) ou
// RESEND_API_TOKEN (nome usado no .env.local de produção em 29/10/2026) — o
// e-mail parou por 13 dias porque a chave antiga foi revogada e ninguém viu.

import { Resend } from 'resend'

export const REMETENTE_PADRAO = 'SysVetMax <noreply@sysmaxsolutions.com>'

export function chaveResend(): string | null {
  const k = process.env.RESEND_API_KEY?.trim() || process.env.RESEND_API_TOKEN?.trim() || ''
  return k.startsWith('re_') ? k : null
}

export function getResend(): Resend | null {
  const k = chaveResend()
  return k ? new Resend(k) : null
}

/** Erro do provedor → frase para o operador + o detalhe para o log. */
export function traduzirErroResend(e: unknown): { texto: string; detalhe: string } {
  const detalhe = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const l = detalhe.toLowerCase()
  if (l.includes('api key is invalid') || l.includes('missing api key') || l.includes('restricted_api_key'))
    return { texto: 'A chave do serviço de e-mail está inválida. Avise o suporte SysMax.', detalhe }
  if (l.includes('domain') && (l.includes('not verified') || l.includes('verify')))
    return { texto: 'O domínio de envio não está verificado no serviço de e-mail. Avise o suporte SysMax.', detalhe }
  if (l.includes('rate') || l.includes('too many') || l.includes('quota'))
    return { texto: 'O serviço de e-mail atingiu o limite de envios. Tente mais tarde.', detalhe }
  if (l.includes('invalid') && l.includes('to'))
    return { texto: 'O endereço de e-mail do destinatário é inválido.', detalhe }
  return { texto: 'O serviço de e-mail recusou o envio.', detalhe }
}
