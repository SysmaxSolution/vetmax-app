// Status de entrega de e-mail (email_deliveries) e a frase para a tela.
// Sem dependência de Node: pode ser importado por componentes 'use client'.

export const EMAIL_STATUS = ['queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'] as const
export type EmailStatus = typeof EMAIL_STATUS[number]

/** Frase para a tela, no vocabulário de quem opera. */
export function textoDoStatus(status: string | null | undefined): string {
  switch (status) {
    case 'sent':       return 'E-mail enviado, aguardando confirmação de entrega'
    case 'delivered':  return 'E-mail entregue'
    case 'delayed':    return 'Entrega atrasada pelo provedor do destinatário'
    case 'bounced':    return 'E-mail devolvido: endereço inválido ou caixa cheia'
    case 'complained': return 'Marcado como spam pelo destinatário'
    case 'failed':     return 'O e-mail não pôde ser enviado'
    case 'suppressed': return 'Endereço bloqueado por devoluções anteriores'
    case 'queued':     return 'Na fila de envio'
    default:           return 'Sem registro de envio'
  }
}

/** Cor semântica do status para badges. */
export function tomDoStatus(status: string | null | undefined): 'ok' | 'atencao' | 'erro' | 'neutro' {
  switch (status) {
    case 'delivered': return 'ok'
    case 'sent': case 'queued': case 'delayed': return 'atencao'
    case 'bounced': case 'complained': case 'failed': case 'suppressed': return 'erro'
    default: return 'neutro'
  }
}
