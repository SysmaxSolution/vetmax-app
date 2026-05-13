import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

// GET /api/cron/daily-schedule-alert
// Vercel Cron — executa a cada hora (0 * * * *).
// Filtra clínicas cujo daily_schedule_alert_time corresponde à hora atual (UTC),
// agrupa agendamentos do dia por profissional e dispara WhatsApp.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin  = createAdminClient()
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ ok: false, reason: 'evolution_api_not_configured' })
  }

  // Hora atual UTC no formato HH:MM
  const nowUTC  = new Date()
  const currentHour = String(nowUTC.getUTCHours()).padStart(2, '0')
  const todayStr    = nowUTC.toISOString().split('T')[0]   // yyyy-MM-dd UTC

  // Clínicas com horário de disparo na hora atual
  const { data: settingsList } = await admin
    .from('clinic_settings')
    .select('clinic_id, daily_schedule_alert_time')
    .not('daily_schedule_alert_time', 'is', null)

  const targetClinics = (settingsList ?? []).filter(s => {
    // daily_schedule_alert_time retorna como "HH:MM:SS" do Postgres
    const hh = (s.daily_schedule_alert_time as string).slice(0, 2)
    return hh === currentHour
  })

  if (!targetClinics.length) {
    return NextResponse.json({ ok: true, dispatched: 0, reason: 'no_clinics_this_hour' })
  }

  let totalDispatched = 0

  for (const setting of targetClinics) {
    const clinicId = setting.clinic_id

    // Instância Evolution API da clínica
    const { data: wppSettings } = await admin
      .from('clinic_whatsapp_settings')
      .select('evolution_instance_name')
      .eq('clinic_id', clinicId)
      .maybeSingle()

    const instanceName = wppSettings?.evolution_instance_name
    if (!instanceName) continue

    // Agendamentos do dia, não cancelados, com profissional definido
    const dayStart = `${todayStr}T00:00:00`
    const dayEnd   = `${todayStr}T23:59:59`

    const { data: appointments } = await admin
      .from('appointments')
      .select(`
        appointment_datetime,
        reason,
        professional_id,
        profiles:professional_id ( full_name, phone ),
        patients:pet_id ( name )
      `)
      .eq('clinic_id', clinicId)
      .not('professional_id', 'is', null)
      .neq('status', 'cancelled')
      .gte('appointment_datetime', dayStart)
      .lte('appointment_datetime', dayEnd)
      .order('appointment_datetime')

    if (!appointments?.length) continue

    // Agrupa por profissional
    const byProf = new Map<string, {
      name:  string
      phone: string
      items: { time: string; petName: string; reason: string }[]
    }>()

    for (const appt of appointments) {
      const profId = appt.professional_id as string
      const prof   = (Array.isArray(appt.profiles) ? appt.profiles[0] : appt.profiles) as
        { full_name: string; phone: string | null } | null
      const pet    = (Array.isArray(appt.patients) ? appt.patients[0] : appt.patients) as
        { name: string } | null

      if (!prof?.phone) continue

      if (!byProf.has(profId)) {
        byProf.set(profId, { name: prof.full_name, phone: prof.phone, items: [] })
      }

      const dt   = new Date(appt.appointment_datetime)
      const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
      const reasonLabel = REASON_LABELS[appt.reason as string] ?? appt.reason ?? ''

      byProf.get(profId)!.items.push({ time, petName: pet?.name ?? 'Animal', reason: reasonLabel })
    }

    // Envia mensagem para cada profissional
    for (const [, prof] of byProf) {
      const count  = prof.items.length
      const plural = count !== 1 ? 'atendimentos' : 'atendimento'
      const list   = prof.items
        .map((i, idx) => `*${idx + 1}.* ${i.time} — ${i.petName} (${i.reason})`)
        .join('\n')

      const message =
        `Olá, ${prof.name.split(' ')[0]}! 🐾\n` +
        `Você tem *${count} ${plural}* hoje:\n\n` +
        `${list}\n\n` +
        `_Bom atendimento!_ 🏥`

      try {
        await evolutionSendText(
          { apiUrl, instanceId: instanceName, apiKey },
          prof.phone,
          message,
        )
        totalDispatched++
        await new Promise(r => setTimeout(r, 400))
      } catch (err) {
        console.error('[DailyAlert] Erro ao enviar para', prof.phone, err)
      }
    }
  }

  console.info(`[DailyAlert] dispatched=${totalDispatched}`)
  return NextResponse.json({ ok: true, dispatched: totalDispatched })
}

const REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
  grooming:     'Banho e Tosa',
}
