import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

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
 * Retorna true se a mensagem era um comando válido (mesmo que o plano não seja encontrado).
 * Retorna false se a mensagem não corresponde ao padrão e deve ser tratada normalmente.
 */
export async function handleDirectorCommand(
  messageText: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<boolean> {
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
      await replyToDirector(
        `✅ *Plano Aprovado!*\n_${plan?.title}_\n\nA Mozart Routine vai executar a correção em breve e abrir um PR para sua revisão.`
      )
      console.info(`[Director Command] Plano ${planId} APROVADO via WhatsApp`)
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
