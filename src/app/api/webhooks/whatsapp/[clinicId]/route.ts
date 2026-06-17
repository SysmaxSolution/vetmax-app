import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runWhatsappAgent } from '@/lib/ai/whatsapp-agent'
import { evolutionSendText, evolutionFetchContactByLid } from '@/lib/evolution-api-client'
import { handleDirectorCommand } from '@/lib/director-commands'

// POST /api/webhooks/whatsapp/[clinicId]
// Normaliza nomes de eventos (uppercase/lowercase) para compatibilidade com v1.8.4 e v2.x.

function normalizeEvent(event: string | undefined): string {
  return (event ?? '').toUpperCase().replace(/\./g, '_')
}

// ── Detecção de mídia inbound ──────────────────────────────────────────────────

type MediaDetect = {
  mediaType: string | null
  mimeType:  string | null
  fileName:  string | null
  url:       string | null
}

function detectInboundMedia(msgObj: Record<string, unknown>): MediaDetect {
  if (msgObj.imageMessage) {
    const m = msgObj.imageMessage as Record<string, unknown>
    return { mediaType: 'image', mimeType: (m.mimetype as string) ?? 'image/jpeg', fileName: null, url: (m.url as string) ?? null }
  }
  if (msgObj.audioMessage) {
    const m = msgObj.audioMessage as Record<string, unknown>
    return { mediaType: 'audio', mimeType: (m.mimetype as string) ?? 'audio/ogg', fileName: null, url: (m.url as string) ?? null }
  }
  if (msgObj.videoMessage) {
    const m = msgObj.videoMessage as Record<string, unknown>
    return { mediaType: 'video', mimeType: (m.mimetype as string) ?? 'video/mp4', fileName: null, url: (m.url as string) ?? null }
  }
  if (msgObj.documentMessage) {
    const m = msgObj.documentMessage as Record<string, unknown>
    return { mediaType: 'document', mimeType: (m.mimetype as string) ?? 'application/octet-stream', fileName: (m.fileName as string) ?? 'documento', url: (m.url as string) ?? null }
  }
  if (msgObj.stickerMessage) {
    const m = msgObj.stickerMessage as Record<string, unknown>
    return { mediaType: 'sticker', mimeType: (m.mimetype as string) ?? 'image/webp', fileName: null, url: (m.url as string) ?? null }
  }
  return { mediaType: null, mimeType: null, fileName: null, url: null }
}

// ── Lookup de tutor por phone ──────────────────────────────────────────────────

async function findTutorByPhone(
  phone: string,
  clinicId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ tutorId: string; tutorName: string | null; photoUrl: string | null; petNamesCache: string | null } | null> {
  const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '').slice(-8)
  if (!cleanPhone) return null

  const { data: tutor } = await admin
    .from('tutors')
    .select('id, name, photo_url')
    .eq('clinic_id', clinicId)
    .ilike('phone', `%${cleanPhone}%`)
    .limit(1)
    .maybeSingle()

  if (!tutor) return null

  const { data: pets } = await admin
    .from('patients')
    .select('name')
    .eq('clinic_id', clinicId)
    .eq('tutor_id', tutor.id)
    .order('name')
    .limit(5)

  const petNamesCache = pets?.length
    ? pets.map((p: { name: string }) => p.name).join(', ')
    : null

  return {
    tutorId:       tutor.id,
    tutorName:     tutor.name ?? null,
    photoUrl:      tutor.photo_url ?? null,
    petNamesCache,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  // Valida que a requisição vem do servidor Evolution API (envia apikey no header)
  const incomingKey = request.headers.get('apikey')
  const expectedKey = process.env.EVOLUTION_API_KEY
  if (expectedKey && incomingKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clinicId } = await params

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }) }

  const rawEvent = body?.event as string | undefined
  const event    = normalizeEvent(rawEvent)

  console.info(`[WPP Webhook] clinicId=${clinicId} event="${rawEvent}" normalized="${event}"`)

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('id', clinicId)
    .maybeSingle()
  if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 404 })

  // ── CONNECTION_UPDATE ───────────────────────────────────────────────────────
  if (event === 'CONNECTION_UPDATE') {
    const state = (body?.data as Record<string, unknown>)?.state as string | undefined
    console.info(`[WPP Webhook] CONNECTION_UPDATE state=${state}`)
    if (state === 'open') {
      await admin.from('clinic_whatsapp_settings')
        .update({ qr_code: null })
        .eq('clinic_id', clinicId)
    }
    return NextResponse.json({ received: true })
  }

  // ── QRCODE_UPDATED ──────────────────────────────────────────────────────────
  if (event === 'QRCODE_UPDATED') {
    const data   = body?.data as Record<string, unknown> | undefined
    const qrObj  = data?.qrcode as Record<string, unknown> | undefined
    const base64 = (qrObj?.base64 ?? data?.base64) as string | undefined
    if (base64) {
      await admin.from('clinic_whatsapp_settings')
        .update({ qr_code: base64 })
        .eq('clinic_id', clinicId)
    }
    return NextResponse.json({ received: true })
  }

  // ── MESSAGES_UPDATE (check azul / ACK) ─────────────────────────────────────
  if (event === 'MESSAGES_UPDATE') {
    const updates = Array.isArray(body?.data)
      ? (body.data as Record<string, unknown>[])
      : []

    for (const upd of updates) {
      const key    = upd.key as Record<string, unknown> | undefined
      const msgId  = key?.id as string | undefined
      const status = (upd.update as Record<string, unknown>)?.status as number | undefined
      if (msgId && typeof status === 'number') {
        await admin
          .from('whatsapp_messages')
          .update({ ack: status })
          .eq('evolution_message_id', msgId)
          .eq('clinic_id', clinicId)
      }
    }
    return NextResponse.json({ received: true })
  }

  // ── MESSAGES_UPSERT ─────────────────────────────────────────────────────────
  if (event === 'MESSAGES_UPSERT') {
    const rawData = body?.data
    const msgData: Record<string, unknown> = Array.isArray(rawData) ? rawData[0] : (rawData as Record<string, unknown>)
    if (!msgData) return NextResponse.json({ received: true })

    const key    = msgData.key as Record<string, unknown> | undefined
    const fromMe = key?.fromMe as boolean | undefined
    const jid    = key?.remoteJid as string | undefined

    if (!jid || jid.endsWith('@g.us')) return NextResponse.json({ received: true })

    let phone = jid.replace('@s.whatsapp.net', '')

    if (jid.includes('@lid')) {
      const apiUrl = process.env.EVOLUTION_API_URL
      const apiKey = process.env.EVOLUTION_API_KEY
      if (apiUrl && apiKey) {
        const { data: wppSettings } = await admin
          .from('clinic_whatsapp_settings')
          .select('evolution_instance_name')
          .eq('clinic_id', clinicId)
          .maybeSingle()
        if (wppSettings?.evolution_instance_name) {
          const resolved = await evolutionFetchContactByLid(
            { apiUrl, instanceId: wppSettings.evolution_instance_name, apiKey },
            jid,
          )
          if (resolved) phone = resolved
        }
      }
    }

    const pushName = msgData.pushName as string | null ?? null
    const msgObj   = msgData.message as Record<string, unknown> | undefined

    const messageText =
      (msgObj?.conversation as string | undefined) ??
      ((msgObj?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
      ((msgObj?.imageMessage as Record<string, unknown> | undefined)?.caption as string | undefined) ??
      ((msgObj?.videoMessage as Record<string, unknown> | undefined)?.caption as string | undefined) ??
      null

    const media = msgObj ? detectInboundMedia(msgObj) : { mediaType: null, mimeType: null, fileName: null, url: null }

    // ── HANDOFF AUTOMÁTICO (fromMe) ─────────────────────────────────────────
    if (fromMe) {
      const { data: conv } = await admin
        .from('whatsapp_conversations')
        .select('id, status')
        .eq('clinic_id', clinicId)
        .eq('tutor_phone', phone)
        .neq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!conv) return NextResponse.json({ received: true })

      if (messageText?.trim()) {
        const since = new Date(Date.now() - 60_000).toISOString()
        const { data: echo } = await admin
          .from('whatsapp_messages')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('direction', 'outbound')
          .eq('content', messageText)
          .gte('created_at', since)
          .limit(1)
          .maybeSingle()
        if (echo) return NextResponse.json({ received: true })
      }

      const updates: Record<string, unknown> = { last_message_at: new Date().toISOString() }
      if (conv.status !== 'human') updates.status = 'human'
      await admin.from('whatsapp_conversations').update(updates).eq('id', conv.id)

      if (messageText?.trim()) {
        await admin.from('whatsapp_messages').insert({
          conversation_id: conv.id,
          clinic_id:       clinicId,
          direction:       'outbound',
          content:         messageText,
          sent_by:         'human',
        })
      }
      return NextResponse.json({ received: true })
    }

    // Descarta se não tem conteúdo nem mídia
    if (!messageText?.trim() && !media.mediaType) return NextResponse.json({ received: true })

    const alertPhone = (process.env.P0_ALERT_PHONE ?? '').replace(/\D/g, '')
    if (alertPhone && phone.replace(/\D/g, '').endsWith(alertPhone.slice(-10))) {
      await handleDirectorCommand(messageText ?? '', phone, admin)
      return NextResponse.json({ received: true })
    }

    try {
      await processInboundMessage({ clinicId, phone, tutorName: pushName, messageText, media, admin })
    } catch (err) {
      console.error('[WPP Webhook] Erro ao processar mensagem:', err)
    }

    return NextResponse.json({ received: true })
  }

  console.info(`[WPP Webhook] evento ignorado: "${rawEvent}"`)
  return NextResponse.json({ received: true })
}

// ─── Processamento principal ──────────────────────────────────────────────────

async function processInboundMessage(params: {
  clinicId:    string
  phone:       string
  tutorName:   string | null
  messageText: string | null
  media:       MediaDetect
  admin:       ReturnType<typeof createAdminClient>
}) {
  const { clinicId, phone, tutorName, messageText, media, admin } = params

  const { data: botConfig } = await admin
    .from('whatsapp_bot_config')
    .select('personality_prompt, can_book, can_inform_prices, working_hours_start, working_hours_end, is_active')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (!botConfig) return

  let { data: conversation } = await admin
    .from('whatsapp_conversations')
    .select('id, status, tutor_name, pending_appointment_id, tutor_id')
    .eq('clinic_id', clinicId)
    .eq('tutor_phone', phone)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialStatus = botConfig.is_active ? 'bot' : 'human'

  if (!conversation) {
    // Busca tutor no cadastro para enriquecer a conversa
    const tutorData = await findTutorByPhone(phone, clinicId, admin)

    const { data: newConv } = await admin
      .from('whatsapp_conversations')
      .insert({
        clinic_id:         clinicId,
        tutor_phone:       phone,
        tutor_name:        tutorData?.tutorName ?? tutorName,
        tutor_id:          tutorData?.tutorId ?? null,
        pet_names_cache:   tutorData?.petNamesCache ?? null,
        tutor_photo_cache: tutorData?.photoUrl ?? null,
        status:            initialStatus,
      })
      .select('id, status, tutor_name, pending_appointment_id, tutor_id')
      .single()
    conversation = newConv
  } else {
    const updates: Record<string, unknown> = {}
    if (!conversation.tutor_name && tutorName) updates.tutor_name = tutorName
    // Tenta enriquecer com tutor_id se ainda não tiver
    if (!conversation.tutor_id) {
      const tutorData = await findTutorByPhone(phone, clinicId, admin)
      if (tutorData) {
        updates.tutor_id          = tutorData.tutorId
        updates.pet_names_cache   = tutorData.petNamesCache
        updates.tutor_photo_cache = tutorData.photoUrl
        if (!conversation.tutor_name) updates.tutor_name = tutorData.tutorName
      }
    }
    if (Object.keys(updates).length > 0) {
      await admin.from('whatsapp_conversations').update(updates).eq('id', conversation.id)
    }
  }

  if (!conversation) { console.error('[WPP Bot] Falha ao criar conversa'); return }

  // Salva mensagem inbound
  await admin.from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    clinic_id:       clinicId,
    direction:       'inbound',
    content:         messageText?.trim() ?? '',
    sent_by:         'client',
    media_type:      media.mediaType,
    media_mime_type: media.mimeType,
    media_filename:  media.fileName,
    media_url:       media.url,
  })

  await admin.from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  void admin.rpc('fn_wpp_increment_unread', { p_conv_id: conversation.id })

  // Feature 6: Urgência por palavra-chave (apenas para texto)
  if (messageText?.trim()) {
    void (async () => {
      try {
        const { data: settings } = await admin
          .from('clinic_settings')
          .select('wpp_urgency_keywords')
          .eq('clinic_id', clinicId)
          .maybeSingle()
        const keywords: string[] = (settings?.wpp_urgency_keywords as string[] | null) ?? [
          'convulsão','convulsao','sangramento','atropelado',
          'não respira','nao respira','envenenado','inconsciente',
          'dificuldade respiratoria','dificuldade respiratória',
          'desmaio','paralisia','urgente','emergência','emergencia',
          'socorro','engasgou','engasgado',
        ]
        const lower = messageText.toLowerCase()
        if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
          await admin.from('whatsapp_conversations').update({ is_urgent: true }).eq('id', conversation!.id)
        }
      } catch (e) { console.error('[WPP] urgency error:', e) }
    })()
  }

  // Feature 7: LGPD — aceitação passiva no primeiro contato
  void (async () => {
    try {
      const { data: convData } = await admin
        .from('whatsapp_conversations')
        .select('lgpd_accepted_at')
        .eq('id', conversation!.id)
        .maybeSingle()
      if (convData && !convData.lgpd_accepted_at) {
        await admin.from('whatsapp_conversations')
          .update({ lgpd_accepted_at: new Date().toISOString() })
          .eq('id', conversation!.id)
      }
    } catch (e) { console.error('[WPP] LGPD error:', e) }
  })()

  // Feature 4: Parsing resposta de confirmação (1=confirmar, 2=cancelar)
  const confirmTrimmed = (messageText ?? '').trim()
  if (confirmTrimmed === '1' || confirmTrimmed === '2') {
    void (async () => {
      try {
        const newStatus = confirmTrimmed === '1' ? 'confirmed' : 'cancelled'
        const cleanPhone = phone.replace(/\D/g, '').slice(-8)
        const { data: tutor } = await admin
          .from('tutors').select('id').eq('clinic_id', clinicId)
          .ilike('phone', `%${cleanPhone}%`).limit(1).maybeSingle()
        if (tutor) {
          const { data: pets } = await admin
            .from('patients').select('id').eq('clinic_id', clinicId).eq('tutor_id', tutor.id)
          const petIds = (pets ?? []).map((p: { id: string }) => p.id)
          if (petIds.length) {
            await admin.from('consultations')
              .update({ wpp_confirmation_status: newStatus })
              .eq('clinic_id', clinicId).eq('wpp_confirmation_status', 'pending')
              .in('patient_id', petIds)
          }
        }
      } catch (e) { console.error('[WPP] confirmation error:', e) }
    })()
  }

  if (!botConfig.is_active) return

  if (botConfig.working_hours_start && botConfig.working_hours_end) {
    const now = new Date()
    const [hStart, mStart] = botConfig.working_hours_start.split(':').map(Number)
    const [hEnd,   mEnd  ] = botConfig.working_hours_end.split(':').map(Number)
    const nowMins   = now.getUTCHours() * 60 + now.getUTCMinutes()
    const startMins = hStart * 60 + mStart
    const endMins   = hEnd   * 60 + mEnd
    if (nowMins < startMins || nowMins > endMins) {
      const reply = `Nosso horário de atendimento é das ${botConfig.working_hours_start} às ${botConfig.working_hours_end}. Assim que abrirmos, responderei sua mensagem!`
      await sendBotReply(clinicId, phone, reply, admin, conversation.id)
      return
    }
  }

  if (conversation.status === 'human') return

  // Não chama bot para mensagens de mídia sem texto
  if (!messageText?.trim()) return

  let pendingAppointmentAt: string | null = null
  if (conversation.pending_appointment_id) {
    const { data: pending } = await admin
      .from('appointments')
      .select('appointment_datetime, status')
      .eq('id', conversation.pending_appointment_id)
      .maybeSingle()
    if (pending && pending.status === 'scheduled') {
      pendingAppointmentAt = pending.appointment_datetime as string
    } else {
      await admin.from('whatsapp_conversations')
        .update({ pending_appointment_id: null })
        .eq('id', conversation.id)
      conversation.pending_appointment_id = null
    }
  }

  const result = await runWhatsappAgent({
    clinicId,
    conversationId:        conversation.id,
    userMessage:           messageText,
    tutorName:             tutorName ?? conversation.tutor_name,
    tutorPhone:            phone,
    personalityPrompt:     botConfig.personality_prompt ?? null,
    canBook:               botConfig.can_book,
    canInformPrices:       botConfig.can_inform_prices,
    pendingAppointmentId:  conversation.pending_appointment_id,
    pendingAppointmentAt,
  })

  if (result.confirmationResolved && conversation.pending_appointment_id) {
    await admin.from('whatsapp_conversations')
      .update({ pending_appointment_id: null })
      .eq('id', conversation.id)
  }

  // Salva resposta do bot
  const { data: botMsg } = await admin.from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    clinic_id:       clinicId,
    direction:       'outbound',
    content:         result.reply,
    sent_by:         'bot',
  }).select('id').single()

  if (result.handoff) {
    await admin.from('whatsapp_conversations').update({ status: 'human' }).eq('id', conversation.id)
  }

  const evolutionMsgId = await sendBotReply(clinicId, phone, result.reply, admin, conversation.id)
  if (!evolutionMsgId) {
    await admin.from('whatsapp_conversations').update({ status: 'human' }).eq('id', conversation.id)
    console.warn(`[WPP Bot] Falha ao enviar para ${phone} — movida para atendimento humano`)
  } else if (botMsg) {
    // Atualiza evolution_message_id para rastrear ACK
    await admin.from('whatsapp_messages')
      .update({ evolution_message_id: evolutionMsgId })
      .eq('id', botMsg.id)
  }
}

// ─── Envio via Evolution API ──────────────────────────────────────────────────

async function sendBotReply(
  clinicId:       string,
  phone:          string,
  text:           string,
  admin:          ReturnType<typeof createAdminClient>,
  conversationId: string,
): Promise<string | null> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return null

  const { data: settings } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  const instanceName = settings?.evolution_instance_name
  if (!instanceName) return null

  try {
    const msgId = await evolutionSendText(
      { apiUrl, instanceId: instanceName, apiKey },
      phone,
      text,
    )
    console.info(`[WPP Bot] mensagem enviada para ${phone}, msgId=${msgId}`)
    return msgId
  } catch (err) {
    console.error('[WPP Bot] Erro ao enviar mensagem:', err)
    return null
  }
}
