import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

// POST /api/webhooks/whatsapp/director
// Recebe mensagens da Evolution API para o número do Diretor (P0_ALERT_PHONE).
// Interpreta "SIM [id]" / "NAO [id]" para aprovar/rejeitar fix_plans.

function normalizeEvent(event: string | undefined): string {
  return (event ?? '').toUpperCase().replace(/\./g, '_')
}

function extractText(body: Record<string, unknown>): string | null {
  try {
    const data = body?.data as Record<string, unknown>
    const msg  = data?.message as Record<string, unknown>
    return (
      (msg?.conversation as string) ??
      (msg?.extendedTextMessage as Record<string, unknown>)?.text as string ??
      null
    )
  } catch { return null }
}

function extractSender(body: Record<string, unknown>): string | null {
  try {
    const data = body?.data as Record<string, unknown>
    const key  = data?.key as Record<string, unknown>
    const jid  = key?.remoteJid as string
    // jid formato: "5511999999999@s.whatsapp.net"
    return jid?.replace('@s.whatsapp.net', '').replace('@c.us', '') ?? null
  } catch { return null }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

async function replyToDirector(text: string) {
  const alertPhone = process.env.P0_ALERT_PHONE
  const apiUrl     = process.env.EVOLUTION_API_URL
  const apiKey     = process.env.EVOLUTION_API_KEY
  const instance   = process.env.P0_ALERT_INSTANCE ?? process.env.EVOLUTION_INSTANCE
  if (!alertPhone || !apiUrl || !apiKey || !instance) return
  try {
    await evolutionSendText({ apiUrl, instanceId: instance, apiKey }, alertPhone, text)
  } catch { /* silencioso */ }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }) }

  const event = normalizeEvent(body?.event as string)

  // Só processa mensagens recebidas
  if (event !== 'MESSAGES_UPSERT') {
    return NextResponse.json({ received: true })
  }

  const text   = extractText(body)?.trim()
  const sender = extractSender(body)

  if (!text || !sender) return NextResponse.json({ received: true })

  // Só aceita mensagens do número do Diretor
  const alertPhone = normalizePhone(process.env.P0_ALERT_PHONE ?? '')
  if (!alertPhone || !normalizePhone(sender).endsWith(alertPhone.slice(-10))) {
    return NextResponse.json({ received: true })
  }

  // Ignora mensagens enviadas pelo próprio sistema (fromMe)
  const fromMe = ((body?.data as Record<string, unknown>)?.key as Record<string, unknown>)?.fromMe
  if (fromMe) return NextResponse.json({ received: true })

  const upper = text.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const admin  = createAdminClient()

  // Extrai comando e ID opcional: "SIM ABC12345" ou "NAO ABC12345" ou só "SIM"/"NAO"
  const approveMatch = /^(SIM|APROVAR)\s*([A-F0-9]{8})?/i.exec(upper)
  const rejectMatch  = /^(NAO|NÃO|REJEITAR|NEGAR)\s*([A-F0-9]{8})?/i.exec(upper)

  if (!approveMatch && !rejectMatch) {
    return NextResponse.json({ received: true })
  }

  const isApprove = !!approveMatch
  const shortId   = (approveMatch?.[2] ?? rejectMatch?.[2])?.toUpperCase()

  // Busca o plano — por short ID ou o mais recente pending_approval
  let planId: string | null = null

  if (shortId) {
    // UUID começa com os 8 chars do shortId
    const { data } = await admin
      .from('fix_plans')
      .select('id, title, status')
      .ilike('id', `${shortId.toLowerCase()}%`)
      .single()
    planId = data?.id ?? null
    if (!planId) {
      await replyToDirector(`❌ Plano com ID *${shortId}* não encontrado.`)
      return NextResponse.json({ received: true })
    }
    if (data?.status !== 'pending_approval') {
      await replyToDirector(`⚠️ Plano *${data?.title}* já está com status _${data?.status}_.`)
      return NextResponse.json({ received: true })
    }
  } else {
    // Sem ID: pega o plano pending_approval mais recente
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
      return NextResponse.json({ received: true })
    }
  }

  // Executa aprovação ou rejeição
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
      console.info(`[Director Webhook] Plano ${planId} APROVADO via WhatsApp`)
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
      console.info(`[Director Webhook] Plano ${planId} REJEITADO via WhatsApp`)
    }
  }

  return NextResponse.json({ received: true })
}
