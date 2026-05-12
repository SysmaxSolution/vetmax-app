import { evolutionSendText } from '@/lib/evolution-api-client'

export interface P0AlertOptions {
  path: string
  errorMessage: string
  module: string | null
  occurrenceCount: number
  severityReason: string
}

/**
 * Envia alerta WhatsApp para o número configurado em P0_ALERT_PHONE.
 * Usa a instância global da Evolution API (EVOLUTION_INSTANCE).
 * Falha silenciosamente — nunca impede o fluxo principal.
 */
export async function sendP0Alert(opts: P0AlertOptions): Promise<void> {
  const alertPhone = process.env.P0_ALERT_PHONE
  const apiUrl     = process.env.EVOLUTION_API_URL
  const apiKey     = process.env.EVOLUTION_API_KEY
  const instance   = process.env.EVOLUTION_INSTANCE

  if (!alertPhone || !apiUrl || !apiKey || !instance) {
    console.warn(
      '[P0 Alert] Variáveis não configuradas (P0_ALERT_PHONE / EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE) — alerta ignorado'
    )
    return
  }

  const moduleLine = opts.module ? `\nMódulo: *${opts.module}*` : ''
  const countLine  = opts.occurrenceCount > 1
    ? `\nOcorrências: *${opts.occurrenceCount}* (erro recorrente)`
    : ''

  const message = [
    `🚨 *ERRO CRÍTICO (P0) — SysVetMax*`,
    ``,
    `Rota: \`${opts.path}\`${moduleLine}`,
    `Erro: ${opts.errorMessage.slice(0, 220)}`,
    countLine,
    `Motivo: _${opts.severityReason}_`,
    ``,
    `Plano de correção em geração automática...`,
  ].filter(l => l !== undefined).join('\n')

  try {
    await evolutionSendText(
      { apiUrl, instanceId: instance, apiKey },
      alertPhone,
      message,
    )
    console.info(`[P0 Alert] Alerta enviado para ${alertPhone} — path=${opts.path}`)
  } catch (err) {
    // Nunca lançar exceção: falha do alerta não deve derrubar o webhook
    console.error('[P0 Alert] Falha ao enviar alerta WhatsApp:', err)
  }
}
