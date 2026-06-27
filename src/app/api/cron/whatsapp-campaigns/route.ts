import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'
import { generateCampaignMessage } from '@/lib/ai/campaign-agent'
import { getAppUrl } from '@/lib/app-url'

// GET /api/cron/whatsapp-campaigns
// Invocado pelo Vercel Cron diariamente às 09:00 UTC.
// Dispara campanhas de reativação para cada clínica com módulo whatsapp_intelligent.

export async function GET(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const apiUrl      = process.env.EVOLUTION_API_URL
  const apiKey      = process.env.EVOLUTION_API_KEY

  if (!apiUrl || !apiKey) {
    console.warn('[Campaign Cron] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurado')
    return NextResponse.json({ ok: false, reason: 'evolution_api_not_configured' })
  }

  // ── Busca clínicas com módulo whatsapp_intelligent ──────────────────────────
  const { data: allClinics } = await admin
    .from('clinics')
    .select('id, name, active_modules')

  const clinics = (allClinics ?? []).filter(c => {
    const modules = c.active_modules as string[] | null
    return modules?.includes('whatsapp_intelligent')
  })

  let totalSent = 0

  for (const clinic of clinics) {
    // ── Campanhas ativas ──────────────────────────────────────────────────────
    const { data: campaigns } = await admin
      .from('whatsapp_campaigns')
      .select('id, trigger_type, days_threshold, is_active, send_hour')
      .eq('clinic_id', clinic.id)
      .eq('is_active', true)

    if (!campaigns?.length) continue

    // ── Instância Evolution API para esta clínica ─────────────────────────────
    const { data: settings } = await admin
      .from('clinic_whatsapp_settings')
      .select('evolution_instance_name')
      .eq('clinic_id', clinic.id)
      .maybeSingle()

    const instanceName = settings?.evolution_instance_name
    if (!instanceName) continue

    for (const campaign of campaigns) {
      const eligible = await getEligibleTutors(admin, clinic.id, campaign)
      if (!eligible.length) continue

      // Confirmação de agendamento usa appointment.bot_confirmation_sent_at como
      // deduplicador (cada appointment só recebe a pergunta uma vez). As demais
      // campanhas continuam evitando reenvio por tutor nas últimas 23h.
      let toSend: EligibleTarget[]
      if (campaign.trigger_type === 'appointment_confirmation') {
        toSend = eligible.slice(0, 50)
      } else {
        const { data: recentLogs } = await admin
          .from('whatsapp_campaign_logs')
          .select('tutor_id')
          .eq('campaign_id', campaign.id)
          .gte('sent_at', new Date(Date.now() - 23 * 3600_000).toISOString())

        const sentIds = new Set((recentLogs ?? []).map(l => l.tutor_id))
        toSend = eligible.filter(t => !sentIds.has(t.tutorId)).slice(0, 50)
      }

      // LGPD opt-in: só dispara para tutores que consentiram explicitamente
      // (whatsapp_consent = true). Filtro centralizado — cobre TODAS as campanhas
      // independentemente de como cada query de elegibilidade monta a lista.
      if (toSend.length) {
        const ids = [...new Set(toSend.map(t => t.tutorId))]
        const { data: consents } = await admin
          .from('tutors')
          .select('id, whatsapp_consent')
          .in('id', ids)
        const consented = new Set(
          (consents ?? []).filter(c => c.whatsapp_consent === true).map(c => c.id)
        )
        toSend = toSend.filter(t => consented.has(t.tutorId))
      }
      if (!toSend.length) continue

      for (const target of toSend) {
        try {
          let message = target.appointmentId
            ? buildConfirmationMessage(target)
            : await generateCampaignMessage({
                clinicName: clinic.name,
                tutorName:  target.tutorName,
                petName:    target.petName,
                context:    target.context,
              })

          // Anexo determinístico (link da carteira etc.) — fora do texto gerado
          // pela IA para evitar que a URL seja alterada/abreviada.
          if (target.appendText) message += `\n\n${target.appendText}`

          await evolutionSendText(
            { apiUrl, instanceId: instanceName, apiKey },
            target.phone,
            message,
          )

          if (target.appointmentId) {
            await admin
              .from('appointments')
              .update({ bot_confirmation_sent_at: new Date().toISOString() })
              .eq('id', target.appointmentId)

            // Vincula a conversa atual ao agendamento pendente (cria se não existir).
            const { data: existingConv } = await admin
              .from('whatsapp_conversations')
              .select('id')
              .eq('clinic_id', clinic.id)
              .eq('tutor_phone', target.phone)
              .maybeSingle()

            if (existingConv) {
              await admin
                .from('whatsapp_conversations')
                .update({
                  pending_appointment_id: target.appointmentId,
                  tutor_name: target.tutorName,
                  pet_name:   target.petName,
                  status:     'bot',
                  last_message_at: new Date().toISOString(),
                })
                .eq('id', existingConv.id)
            } else {
              await admin.from('whatsapp_conversations').insert({
                clinic_id:              clinic.id,
                tutor_phone:            target.phone,
                tutor_name:             target.tutorName,
                pet_name:               target.petName,
                pending_appointment_id: target.appointmentId,
                status:                 'bot',
              })
            }
          }

          await admin.from('whatsapp_campaign_logs').insert({
            clinic_id:  clinic.id,
            tutor_id:   target.tutorId,
            campaign_id: campaign.id,
          })

          totalSent++
          // Pausa entre envios para não sobrecarregar a Evolution API
          await new Promise(r => setTimeout(r, 500))
        } catch (err) {
          console.error('[Campaign Cron] Erro ao enviar para', target.phone, err)
        }
      }
    }
  }

  console.info(`[Campaign Cron] enviados=${totalSent}`)
  return NextResponse.json({ ok: true, totalSent })
}

// ─── Queries de elegibilidade ─────────────────────────────────────────────────

interface EligibleTarget {
  tutorId:        string
  tutorName:      string
  phone:          string
  petName:        string
  context:        string
  // Texto fixo anexado ao final da mensagem (ex.: link da carteira de vacinação).
  appendText?:    string
  // Preenchido apenas para o trigger appointment_confirmation:
  appointmentId?: string
  appointmentAt?: string   // ISO datetime
}

async function getEligibleTutors(
  admin:    ReturnType<typeof createAdminClient>,
  clinicId: string,
  campaign: { trigger_type: string; days_threshold: number },
): Promise<EligibleTarget[]> {
  switch (campaign.trigger_type) {
    case 'no_visit':                 return queryNoVisit(admin, clinicId, campaign.days_threshold)
    case 'vaccine_due':              return queryVaccineDue(admin, clinicId, campaign.days_threshold)
    case 'pending_return':           return queryPendingReturn(admin, clinicId, campaign.days_threshold)
    case 'grooming_due':             return queryGroomingDue(admin, clinicId, campaign.days_threshold)
    case 'appointment_confirmation': return queryAppointmentConfirmation(admin, clinicId, campaign.days_threshold)
    default: return []
  }
}

function buildConfirmationMessage(t: EligibleTarget): string {
  const dt = new Date(t.appointmentAt!)
  const dateLabel = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return [
    `Olá, ${t.tutorName}! 🐾`,
    ``,
    `Passando para confirmar o agendamento de ${t.petName} para ${dateLabel} às ${timeLabel}.`,
    ``,
    `Responda:`,
    `• CONFIRMAR — está tudo certo`,
    `• REMARCAR — escolher outra data`,
    `• CANCELAR — desmarcar`,
  ].join('\n')
}

// Tutores sem visita (consulta ou tosa) há mais de N dias
async function queryNoVisit(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  days: number,
): Promise<EligibleTarget[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  const [{ data: appts }, { data: groomings }, { data: tutors }] = await Promise.all([
    admin.from('appointments')
      .select('tutor_id')
      .eq('clinic_id', clinicId)
      .neq('status', 'cancelled')
      .gte('appointment_datetime', cutoff),
    admin.from('grooming_sessions')
      .select('tutor_id')
      .eq('clinic_id', clinicId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', cutoff),
    admin.from('tutors')
      .select('id, name, phone, patients(name)')
      .eq('clinic_id', clinicId)
      .neq('phone', ''),
  ])

  const recentIds = new Set([
    ...(appts     ?? []).map(a => a.tutor_id),
    ...(groomings ?? []).map(g => g.tutor_id),
  ])

  return (tutors ?? [])
    .filter(t => t.phone && !recentIds.has(t.id))
    .map(t => ({
      tutorId:   t.id,
      tutorName: t.name,
      phone:     t.phone,
      petName:   (t.patients as { name: string }[])?.[0]?.name ?? 'seu pet',
      context:   `não visita a clínica há mais de ${days} dias`,
    }))
}

// Tutores com vacina vencendo EXATAMENTE em N dias (boundary day) — lembrete único.
// Match exato no dia-limite evita o reenvio diário durante toda a janela (o dedup
// de 23h não impede reenvio em dias consecutivos). Tradeoff: se a cron falhar no
// dia-limite, o lembrete daquela vacina é perdido — aceitável vs. spam diário.
async function queryVaccineDue(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  days: number,
): Promise<EligibleTarget[]> {
  const target = new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]
  const appUrl = getAppUrl()

  const { data } = await admin
    .from('patient_vaccines')
    .select('vaccine_name, next_due_date, patient_id, patients:patient_id ( name, tutor_id, tutors:tutor_id ( id, name, phone ) )')
    .eq('clinic_id', clinicId)
    .eq('next_due_date', target)

  const seen = new Set<string>()
  const results: EligibleTarget[] = []

  for (const v of (data ?? [])) {
    const patient = (Array.isArray(v.patients) ? v.patients[0] : v.patients) as { name: string; tutor_id: string; tutors: unknown } | null
    const tutor   = (Array.isArray((patient as any)?.tutors) ? (patient as any)?.tutors[0] : (patient as any)?.tutors) as { id: string; name: string; phone: string } | null
    if (!tutor?.id || !tutor?.phone || seen.has(tutor.id)) continue
    seen.add(tutor.id)

    const petName = patient?.name ?? 'seu pet'
    results.push({
      tutorId:    tutor.id,
      tutorName:  tutor.name,
      phone:      tutor.phone,
      petName,
      context:    `tem a vacina ${v.vaccine_name} vencendo em ${days} dia${days !== 1 ? 's' : ''}`,
      appendText: `📋 Carteira de vacinação do ${petName}: ${appUrl}/public/vaccines/${v.patient_id}`,
    })
  }
  return results
}

// Tutores com retorno agendado que já passou e não compareceu
async function queryPendingReturn(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  days: number,
): Promise<EligibleTarget[]> {
  const createdCutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data } = await admin
    .from('appointments')
    .select('tutor_id, tutors:tutor_id ( id, name, phone ), patients:pet_id ( name )')
    .eq('clinic_id', clinicId)
    .eq('reason', 'follow_up')
    .eq('status', 'scheduled')
    .lt('appointment_datetime', new Date().toISOString())
    .lte('created_at', createdCutoff)

  const seen = new Set<string>()
  const results: EligibleTarget[] = []

  for (const a of (data ?? [])) {
    const tutor   = (Array.isArray(a.tutors)   ? a.tutors[0]   : a.tutors)   as { id: string; name: string; phone: string } | null
    const patient = (Array.isArray(a.patients) ? a.patients[0] : a.patients) as { name: string } | null
    if (!tutor?.id || !tutor?.phone || seen.has(tutor.id)) continue
    seen.add(tutor.id)
    results.push({
      tutorId:   tutor.id,
      tutorName: tutor.name,
      phone:     tutor.phone,
      petName:   patient?.name ?? 'seu pet',
      context:   'tem um retorno pendente que ainda não foi realizado',
    })
  }
  return results
}

// Tutores cujo pet não faz tosa há mais de N dias
async function queryGroomingDue(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  days: number,
): Promise<EligibleTarget[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  const [{ data: allGrooming }, { data: recentGrooming }] = await Promise.all([
    admin.from('grooming_sessions').select('tutor_id').eq('clinic_id', clinicId).neq('status', 'cancelled'),
    admin.from('grooming_sessions').select('tutor_id').eq('clinic_id', clinicId).neq('status', 'cancelled').gte('scheduled_at', cutoff),
  ])

  const hadGrooming    = new Set((allGrooming    ?? []).map(g => g.tutor_id))
  const recentGroomed  = new Set((recentGrooming ?? []).map(g => g.tutor_id))
  const eligibleIds    = [...hadGrooming].filter(id => !recentGroomed.has(id))

  if (!eligibleIds.length) return []

  const { data: tutors } = await admin
    .from('tutors')
    .select('id, name, phone, patients(name)')
    .eq('clinic_id', clinicId)
    .in('id', eligibleIds.slice(0, 50))
    .neq('phone', '')

  return (tutors ?? [])
    .filter(t => t.phone)
    .map(t => ({
      tutorId:   t.id,
      tutorName: t.name,
      phone:     t.phone,
      petName:   (t.patients as { name: string }[])?.[0]?.name ?? 'seu pet',
      context:   `não faz banho e tosa há mais de ${days} dias`,
    }))
}

// Agendamentos cuja data cai dentro da janela [now+Ndays, now+Ndays+1 dia)
// e que ainda não receberam a pergunta de confirmação do bot.
async function queryAppointmentConfirmation(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  days: number,
): Promise<EligibleTarget[]> {
  const windowStart = new Date(Date.now() + days * 86_400_000).toISOString()
  const windowEnd   = new Date(Date.now() + (days + 1) * 86_400_000).toISOString()

  const { data } = await admin
    .from('appointments')
    .select(`
      id,
      appointment_datetime,
      tutor_id,
      tutors:tutor_id ( id, name, phone ),
      patients:pet_id ( name )
    `)
    .eq('clinic_id', clinicId)
    .eq('status', 'scheduled')
    .is('bot_confirmation_sent_at', null)
    .gte('appointment_datetime', windowStart)
    .lt('appointment_datetime', windowEnd)

  const results: EligibleTarget[] = []
  for (const a of (data ?? [])) {
    const tutor   = (Array.isArray(a.tutors)   ? a.tutors[0]   : a.tutors)   as { id: string; name: string; phone: string } | null
    const patient = (Array.isArray(a.patients) ? a.patients[0] : a.patients) as { name: string } | null
    if (!tutor?.id || !tutor.phone) continue
    results.push({
      tutorId:       tutor.id,
      tutorName:     tutor.name,
      phone:         tutor.phone,
      petName:       patient?.name ?? 'seu pet',
      context:       'confirmação de agendamento',
      appointmentId: a.id,
      appointmentAt: a.appointment_datetime as string,
    })
  }
  return results
}
