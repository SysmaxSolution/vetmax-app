import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

// GET /api/cron/wpp-appointment-reminders
// Cron de confirmação de consultas 24h antes via WhatsApp.
// Disparar a cada hora — ex.: vercel.json { "path": "/api/cron/wpp-appointment-reminders", "schedule": "0 * * * *" }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.KEEPALIVE_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instanceId = process.env.EVOLUTION_INSTANCE ?? 'SysVetMax'

  if (!apiUrl || !apiKey) {
    console.error('[wpp-appointment-reminders] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados.')
    return NextResponse.json({ error: 'Evolution API not configured' }, { status: 500 })
  }

  const admin = createAdminClient()

  const now = new Date()
  const windowStart = new Date(now.getTime() + 22 * 60 * 60 * 1000) // agora + 22h
  const windowEnd   = new Date(now.getTime() + 26 * 60 * 60 * 1000) // agora + 26h

  // Busca consultas na janela de 22h–26h a partir de agora que ainda não receberam lembrete
  const { data: consultations, error: fetchError } = await admin
    .from('consultations')
    .select(`
      id,
      clinic_id,
      scheduled_date,
      tutor:tutors!inner (
        id,
        name,
        phone
      ),
      pet:patients!inner (
        id,
        name
      )
    `)
    .gte('scheduled_date', windowStart.toISOString())
    .lte('scheduled_date', windowEnd.toISOString())
    .is('wpp_confirmation_sent_at', null)
    .not('status', 'in', '("completed","cancelled")')

  if (fetchError) {
    console.error('[wpp-appointment-reminders] Erro ao buscar consultas:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!consultations || consultations.length === 0) {
    return NextResponse.json({ sent: 0, errors: 0 })
  }

  let sent   = 0
  let errors = 0

  for (const consultation of consultations) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tutor = consultation.tutor as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pet   = consultation.pet as any

      const tutorName = tutor?.name ?? 'Tutor'
      const petName   = pet?.name   ?? 'seu pet'
      const phone     = tutor?.phone

      if (!phone) {
        console.warn(`[wpp-appointment-reminders] Consulta ${consultation.id}: tutor sem telefone, pulando.`)
        continue
      }

      // Verifica se há conversa ativa para este telefone na clínica
      const { data: conversation } = await admin
        .from('whatsapp_conversations')
        .select('id')
        .eq('clinic_id', consultation.clinic_id)
        .eq('tutor_phone', phone)
        .neq('status', 'closed')
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!conversation) {
        console.info(`[wpp-appointment-reminders] Consulta ${consultation.id}: sem conversa WPP ativa para ${phone}, pulando.`)
        continue
      }

      // Formata hora no horário de Brasília (UTC-3)
      const scheduledDate = new Date(consultation.scheduled_date as string)
      const hora = scheduledDate.toLocaleTimeString('pt-BR', {
        hour:     '2-digit',
        minute:   '2-digit',
        timeZone: 'America/Sao_Paulo',
      })

      const message =
        `Olá ${tutorName}! 😊 Lembrete: você tem consulta de ${petName} amanhã às ${hora}. ` +
        `Responda *1* para CONFIRMAR ou *2* para CANCELAR.`

      await evolutionSendText(
        { apiUrl, instanceId, apiKey },
        phone,
        message,
      )

      // Marca como enviado
      const { error: updateError } = await admin
        .from('consultations')
        .update({
          wpp_confirmation_sent_at:  new Date().toISOString(),
          wpp_confirmation_status:   'pending',
        })
        .eq('id', consultation.id)

      if (updateError) {
        console.error(`[wpp-appointment-reminders] Erro ao marcar consulta ${consultation.id}:`, updateError.message)
        errors++
      } else {
        console.info(`[wpp-appointment-reminders] Lembrete enviado para consulta ${consultation.id} (${phone}).`)
        sent++
      }
    } catch (err) {
      console.error(`[wpp-appointment-reminders] Erro ao processar consulta ${consultation.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ sent, errors })
}
