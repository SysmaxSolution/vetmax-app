import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runWhatsappAgent } from '@/lib/ai/whatsapp-agent'
import { evolutionSendText } from '@/lib/evolution-api-client'

// POST /api/webhooks/whatsapp/[clinicId]
// Recebe eventos da Evolution API v1.8.4.
// Normaliza nomes de eventos (uppercase/lowercase) para compatibilidade.

// v1.8.x pode enviar "messages.upsert" ou "MESSAGES_UPSERT"
function normalizeEvent(event: string | undefined): string {
  return (event ?? '').toUpperCase().replace(/\./g, '_')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }) }

  const rawEvent = body?.event as string | undefined
  const event    = normalizeEvent(rawEvent)

  console.info(`[WPP Webhook] clinicId=${clinicId} event="${rawEvent}" normalized="${event}"`)

  // ── Valida clínica ─────────────────────────────────────────────────────────
  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('id', clinicId)
    .maybeSingle()
  if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 404 })

  // ── CONNECTION_UPDATE ──────────────────────────────────────────────────────
  if (event === 'CONNECTION_UPDATE') {
    const state = (body?.data as Record<string, unknown>)?.state as string | undefined
    console.info(`[WPP Webhook] clinicId=${clinicId} CONNECTION_UPDATE state=${state}`)
    // Quando conectado, limpa o QR salvo (já não é mais necessário)
    if (state === 'open') {
      await admin.from('clinic_whatsapp_settings')
        .update({ qr_code: null })
        .eq('clinic_id', clinicId)
    }
    return NextResponse.json({ received: true })
  }

  // ── QRCODE_UPDATED ─────────────────────────────────────────────────────────
  if (event === 'QRCODE_UPDATED') {
    const data    = body?.data as Record<string, unknown> | undefined
    const qrObj   = data?.qrcode as Record<string, unknown> | undefined
    const base64  = (qrObj?.base64 ?? data?.base64) as string | undefined
    console.info(`[WPP Webhook] clinicId=${clinicId} QRCODE_UPDATED base64=${base64 ? 'sim' : 'não'} dataKeys=${Object.keys(data ?? {}).join(',')}`)
    if (base64) {
      await admin.from('clinic_whatsapp_settings')
        .update({ qr_code: base64 })
        .eq('clinic_id', clinicId)
    }
    return NextResponse.json({ received: true })
  }

  // ── MESSAGES_UPSERT ────────────────────────────────────────────────────────
  if (event === 'MESSAGES_UPSERT') {
    // data pode ser array (baileys) ou objeto único
    const rawData = body?.data
    const msgData: Record<string, unknown> = Array.isArray(rawData) ? rawData[0] : (rawData as Record<string, unknown>)
    if (!msgData) return NextResponse.json({ received: true })

    const key    = msgData.key as Record<string, unknown> | undefined
    const fromMe = key?.fromMe as boolean | undefined
    const jid    = key?.remoteJid as string | undefined

    console.info(`[WPP Webhook] MESSAGES_UPSERT jid=${jid} fromMe=${fromMe}`)

    // Ignora mensagens do próprio bot e de grupos
    if (fromMe) return NextResponse.json({ received: true })
    if (!jid || jid.endsWith('@g.us')) return NextResponse.json({ received: true })

    // body.sender = número da clínica (instância), não do remetente — não usar para phone
    const phone = jid.replace('@s.whatsapp.net', '')   // @lid permanece como @lid (resolvido no envio)

    if (jid.includes('@lid')) {
      console.info(`[WPP Webhook] @lid detectado: ${jid} — resolução tentada no momento do envio`)
    }

    const pushName = msgData.pushName as string | null ?? null
    const msgObj   = msgData.message as Record<string, unknown> | undefined

    // Extrai texto da mensagem (suporta conversation, extendedTextMessage e imageMessage com caption)
    const messageText =
      (msgObj?.conversation as string | undefined) ??
      ((msgObj?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
      ((msgObj?.imageMessage as Record<string, unknown> | undefined)?.caption as string | undefined) ??
      null

    console.info(`[WPP Webhook] phone=${phone} pushName=${pushName} messageText="${messageText?.substring(0, 50)}"`)

    if (!messageText?.trim()) return NextResponse.json({ received: true })

    try {
      await processInboundMessage({ clinicId, phone, tutorName: pushName, messageText, admin })
    } catch (err) {
      console.error('[WPP Webhook] Erro ao processar mensagem:', err)
    }

    return NextResponse.json({ received: true })
  }

  // Evento não reconhecido — loga para diagnóstico
  console.info(`[WPP Webhook] clinicId=${clinicId} evento ignorado: "${rawEvent}"`)
  return NextResponse.json({ received: true })
}

// ─── Processamento principal ──────────────────────────────────────────────────

async function processInboundMessage(params: {
  clinicId:    string
  phone:       string
  tutorName:   string | null
  messageText: string
  admin:       ReturnType<typeof createAdminClient>
}) {
  const { clinicId, phone, tutorName, messageText, admin } = params

  // 1. Busca config do bot
  const { data: botConfig } = await admin
    .from('whatsapp_bot_config')
    .select('personality_prompt, can_book, can_inform_prices, working_hours_start, working_hours_end, is_active')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  console.info(`[WPP Bot] clinicId=${clinicId} is_active=${botConfig?.is_active ?? 'sem config'}`)

  // Sem config salva → bot ainda não foi configurado, não responde
  if (!botConfig) {
    console.info(`[WPP Bot] clinicId=${clinicId} — configuração não encontrada, ignorando`)
    return
  }

  // 2. Busca ou cria conversa — quando bot inativo cria como 'human' para atendimento manual
  let { data: conversation } = await admin
    .from('whatsapp_conversations')
    .select('id, status, tutor_name')
    .eq('clinic_id', clinicId)
    .eq('tutor_phone', phone)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) {
    const { data: newConv } = await admin
      .from('whatsapp_conversations')
      .insert({ clinic_id: clinicId, tutor_phone: phone, tutor_name: tutorName, status: botConfig.is_active ? 'bot' : 'human' })
      .select('id, status, tutor_name')
      .single()
    conversation = newConv
  } else if (!conversation.tutor_name && tutorName) {
    await admin.from('whatsapp_conversations').update({ tutor_name: tutorName }).eq('id', conversation.id)
  }

  if (!conversation) { console.error('[WPP Bot] Falha ao criar conversa'); return }

  // 3. Salva mensagem inbound
  await admin.from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    clinic_id:       clinicId,
    direction:       'inbound',
    content:         messageText,
    sent_by:         'client',
  })

  await admin.from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  // 4. Bot inativo: mensagem salva, clínica responde manualmente — sem IA
  if (!botConfig.is_active) {
    console.info(`[WPP Bot] clinicId=${clinicId} — bot inativo, mensagem salva para atendimento manual`)
    return
  }

  // 5. Verifica horário de funcionamento (UTC — Vercel roda em UTC)
  if (botConfig.working_hours_start && botConfig.working_hours_end) {
    const now        = new Date()
    const [hStart, mStart] = botConfig.working_hours_start.split(':').map(Number)
    const [hEnd,   mEnd  ] = botConfig.working_hours_end.split(':').map(Number)
    const nowMins    = now.getUTCHours() * 60 + now.getUTCMinutes()
    const startMins  = hStart * 60 + mStart
    const endMins    = hEnd   * 60 + mEnd

    console.info(`[WPP Bot] horário UTC=${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2,'0')} janela=${botConfig.working_hours_start}-${botConfig.working_hours_end}`)

    if (nowMins < startMins || nowMins > endMins) {
      await sendBotReply(clinicId, phone, `Nosso horário de atendimento é das ${botConfig.working_hours_start} às ${botConfig.working_hours_end}. Assim que abrirmos, responderei sua mensagem!`, admin)
      return
    }
  }

  // 6. Se conversa em modo 'human', não chama o bot
  if (conversation.status === 'human') {
    console.info(`[WPP Bot] clinicId=${clinicId} — conversa em modo human, ignorando bot`)
    return
  }

  // 7. Chama o agente IA
  console.info(`[WPP Bot] clinicId=${clinicId} — chamando agente IA`)
  const result = await runWhatsappAgent({
    clinicId,
    conversationId:    conversation.id,
    userMessage:       messageText,
    tutorName:         tutorName ?? conversation.tutor_name,
    tutorPhone:        phone,
    personalityPrompt: botConfig.personality_prompt ?? null,
  })

  console.info(`[WPP Bot] resposta="${result.reply.substring(0, 80)}" handoff=${result.handoff}`)

  // 8. Salva resposta no banco
  await admin.from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    clinic_id:       clinicId,
    direction:       'outbound',
    content:         result.reply,
    sent_by:         'bot',
  })

  // 9. Se handoff, atualiza status da conversa
  if (result.handoff) {
    await admin.from('whatsapp_conversations').update({ status: 'human' }).eq('id', conversation.id)
  }

  // 10. Envia resposta via Evolution API
  await sendBotReply(clinicId, phone, result.reply, admin)
}

// ─── Envio via Evolution API ──────────────────────────────────────────────────

async function sendBotReply(
  clinicId: string,
  phone:    string,
  text:     string,
  admin:    ReturnType<typeof createAdminClient>,
): Promise<void> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) { console.warn('[WPP Bot] EVOLUTION_API_URL não configurado'); return }

  const { data: settings } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  const instanceName = settings?.evolution_instance_name
  if (!instanceName) { console.warn('[WPP Bot] Instância não encontrada para clínica', clinicId); return }

  try {
    await evolutionSendText({ apiUrl, instanceId: instanceName, apiKey }, phone, text)
    console.info(`[WPP Bot] mensagem enviada para ${phone}`)
  } catch (err) {
    console.error('[WPP Bot] Erro ao enviar mensagem:', err)
  }
}
