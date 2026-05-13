import { evolutionSendText } from '@/lib/evolution-api-client'

export interface P0AlertOptions {
  path: string
  errorMessage: string
  module: string | null
  occurrenceCount: number
  severityReason: string
  fixPlanId?: string
  fixPlanTitle?: string
  fixPlanDescription?: string
}

function getEvolutionConfig() {
  return {
    alertPhone: process.env.P0_ALERT_PHONE,
    apiUrl:     process.env.EVOLUTION_API_URL,
    apiKey:     process.env.EVOLUTION_API_KEY,
    instance:   process.env.P0_ALERT_INSTANCE ?? process.env.EVOLUTION_INSTANCE,
  }
}

export async function sendP0Alert(opts: P0AlertOptions): Promise<void> {
  const { alertPhone, apiUrl, apiKey, instance } = getEvolutionConfig()

  if (!alertPhone || !apiUrl || !apiKey || !instance) {
    console.warn('[P0 Alert] Variáveis não configuradas — alerta ignorado')
    return
  }

  const moduleLine = opts.module ? `\nMódulo: *${opts.module}*` : ''
  const countLine  = opts.occurrenceCount > 1
    ? `\nOcorrências: *${opts.occurrenceCount}* (recorrente)`
    : ''

  const lines = [
    `🚨 *ERRO CRÍTICO (P0) — SysVetMax*`,
    ``,
    `Rota: \`${opts.path}\`${moduleLine}`,
    `Erro: ${opts.errorMessage.slice(0, 220)}`,
    countLine,
    `Motivo: _${opts.severityReason}_`,
  ]

  if (opts.fixPlanId) {
    const shortId = opts.fixPlanId.slice(0, 8).toUpperCase()
    lines.push(``)
    lines.push(`📋 *Plano de Correção Gerado*`)
    if (opts.fixPlanTitle) lines.push(`Título: ${opts.fixPlanTitle}`)
    if (opts.fixPlanDescription) lines.push(`Resumo: ${opts.fixPlanDescription.slice(0, 300)}`)
    lines.push(``)
    lines.push(`Para aprovar responda: *SIM ${shortId}*`)
    lines.push(`Para rejeitar responda: *NAO ${shortId}*`)
    lines.push(`_(ou apenas SIM / NAO para o último plano pendente)_`)
  } else {
    lines.push(``)
    lines.push(`Plano de correção em geração automática...`)
  }

  const message = lines.filter(l => l !== undefined).join('\n')

  try {
    await evolutionSendText(
      { apiUrl, instanceId: instance, apiKey },
      alertPhone,
      message,
    )
    console.info(`[P0 Alert] Enviado para ${alertPhone} — path=${opts.path}`)
  } catch (err) {
    console.error('[P0 Alert] Falha ao enviar alerta:', err)
  }
}

export async function sendP0FixPlanAlert(opts: {
  fixPlanId: string
  fixPlanTitle: string
  errorSummary: string | null
  priority: string
}): Promise<void> {
  const { alertPhone, apiUrl, apiKey, instance } = getEvolutionConfig()
  if (!alertPhone || !apiUrl || !apiKey || !instance) {
    console.warn('[Fix Plan Alert] Variáveis de Evolution API não configuradas — verifique EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE (ou P0_ALERT_INSTANCE) e P0_ALERT_PHONE no painel do Vercel')
    return
  }

  const shortId = opts.fixPlanId.slice(0, 8).toUpperCase()
  const message = [
    `📋 *Plano de Correção ${opts.priority} Gerado — SysVetMax*`,
    ``,
    `Título: *${opts.fixPlanTitle}*`,
    opts.errorSummary ? `Resumo: ${opts.errorSummary.slice(0, 280)}` : '',
    ``,
    `Para aprovar responda: *SIM ${shortId}*`,
    `Para rejeitar responda: *NAO ${shortId}*`,
    `_(ou apenas SIM / NAO para o último plano pendente)_`,
  ].filter(Boolean).join('\n')

  try {
    await evolutionSendText({ apiUrl, instanceId: instance, apiKey }, alertPhone, message)
    console.info(`[Fix Plan Alert] Plano ${shortId} enviado para ${alertPhone}`)
  } catch (err) {
    console.error('[Fix Plan Alert] Falha ao enviar:', err)
  }
}
