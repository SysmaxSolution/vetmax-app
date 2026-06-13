import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'
import { getAppUrl } from '@/lib/app-url'

function triggerBackgroundApply(planId: string): void {
  const url    = `${getAppUrl()}/api/cron/apply-approved-fixes`
  const secret = process.env.CRON_SECRET
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) headers.Authorization = `Bearer ${secret}`
  fetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ planId }),
    signal:  AbortSignal.timeout(5_000),
  }).then(() => {
    console.info(`[director] Background apply disparado para ${planId}`)
  }).catch((e: unknown) => {
    console.warn(`[director] Background apply falhou (cron periódico recupera): ${e instanceof Error ? e.message : e}`)
  })
}

async function replyToDirector(text: string): Promise<void> {
  const alertPhone = process.env.P0_ALERT_PHONE
  const apiUrl     = process.env.EVOLUTION_API_URL
  const apiKey     = process.env.EVOLUTION_API_KEY
  const instance   = process.env.P0_ALERT_INSTANCE ?? process.env.EVOLUTION_INSTANCE
  if (!alertPhone || !apiUrl || !apiKey || !instance) return
  try {
    await evolutionSendText({ apiUrl, instanceId: instance, apiKey }, alertPhone, text)
  } catch { /* silencioso */ }
}

/**
 * Processa comandos SIM/NAO do Diretor para aprovar ou rejeitar fix_plans.
 * Valida internamente que o remetente é P0_ALERT_PHONE — qualquer caller não autorizado
 * recebe false imediatamente, independente do filtro externo do webhook.
 *
 * @param senderPhone  Número do remetente (será normalizado internamente).
 * @returns true se a mensagem era um comando válido; false caso contrário.
 */
export async function handleDirectorCommand(
  messageText: string,
  senderPhone: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<boolean> {
  // ── Validação de autorização ────────────────────────────────────────────────
  const authorizedPhone = (process.env.P0_ALERT_PHONE ?? '').replace(/\D/g, '')
  if (!authorizedPhone) {
    console.warn('[Director Commands] P0_ALERT_PHONE não configurado — comando ignorado')
    return false
  }
  const normalizedSender = senderPhone.replace(/[^\d]/g, '')
  // Compara os últimos 11 dígitos (DDD + 9 dígitos) — protege contra ataques de sufixo curto
  const tail11Auth   = authorizedPhone.slice(-11)
  const tail11Sender = normalizedSender.slice(-11)
  if (!normalizedSender || tail11Auth.length < 11 || tail11Auth !== tail11Sender) {
    console.warn(`[Director Commands] Remetente não autorizado: "${senderPhone}" — comando SIM/NAO ignorado`)
    return false
  }

  const upper = messageText.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const approveMatch = /^(SIM|APROVAR)\s*([A-F0-9]{8})?/.exec(upper)
  const rejectMatch  = /^(NAO|NAO|REJEITAR|NEGAR)\s*([A-F0-9]{8})?/.exec(upper)

  if (!approveMatch && !rejectMatch) return false

  const isApprove = !!approveMatch
  const shortId   = (approveMatch?.[2] ?? rejectMatch?.[2])?.toUpperCase()

  let planId: string | null = null

  if (shortId) {
    const { data } = await admin
      .from('fix_plans')
      .select('id, title, status')
      .ilike('id', `${shortId.toLowerCase()}%`)
      .single()
    planId = data?.id ?? null
    if (!planId) {
      await replyToDirector(`❌ Plano com ID *${shortId}* não encontrado.`)
      return true
    }
    if (data?.status !== 'pending_approval') {
      await replyToDirector(`⚠️ Plano *${data?.title}* já está com status _${data?.status}_.`)
      return true
    }
  } else {
    const { data } = await admin
      .from('fix_plans')
      .select('id, title')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    planId = data?.id ?? null
    if (!planId) {
      await replyToDirector(`ℹ️ Nenhum plano aguardando aprovação no momento.`)
      return true
    }
  }

  if (isApprove) {
    const { error } = await admin
      .from('fix_plans')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('status', 'pending_approval')

    if (error) {
      await replyToDirector(`❌ Erro ao aprovar plano: ${error.message}`)
    } else {
      const { data: plan } = await admin.from('fix_plans').select('title').eq('id', planId).single()
      // Dispara aplicação em background. Cron periódico (15min) recupera se falhar.
      if (planId) triggerBackgroundApply(planId)
      await replyToDirector(
        `✅ *Plano Aprovado!*\n_${plan?.title}_\n\nA correção foi disparada em background — você receberá o link do PR quando estiver pronto.`
      )
      console.info(`[Director Command] Plano ${planId} APROVADO via WhatsApp + apply disparado`)
    }
  } else {
    const { error } = await admin
      .from('fix_plans')
      .update({ status: 'rejected' })
      .eq('id', planId)

    if (error) {
      await replyToDirector(`❌ Erro ao rejeitar plano: ${error.message}`)
    } else {
      const { data: plan } = await admin.from('fix_plans').select('title').eq('id', planId).single()
      await replyToDirector(`🚫 *Plano Rejeitado.*\n_${plan?.title}_`)
      console.info(`[Director Command] Plano ${planId} REJEITADO via WhatsApp`)
    }
  }

  return true
}
