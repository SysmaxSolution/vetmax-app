'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText, type EvolutionCreds } from '@/lib/evolution-api-client'

// Formata hora "HH:MM" a partir de datetime ISO
function fmtTime(dt: string): string {
  return dt.split('T')[1]?.substring(0, 5) ?? dt
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

export type DailyScheduleResult = {
  sent:   number
  skipped: number
  errors:  string[]
}

export async function sendDailyScheduleToVets(): Promise<DailyScheduleResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const clinicId = profile.clinic_id
  const admin    = createAdminClient()

  // Configuração de WhatsApp da clínica
  const { data: whatsappCfg } = await admin
    .from('whatsapp_instances')
    .select('instance_id, api_url, token, provider_name')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .single()

  if (!whatsappCfg) return { error: 'WhatsApp não configurado para esta clínica.' }

  const today     = new Date().toISOString().split('T')[0]   // yyyy-MM-dd
  const todayStart = `${today}T00:00:00`
  const todayEnd   = `${today}T23:59:59`

  // Busca consultas/agendamentos de hoje com professional_id
  const { data: appointments } = await admin
    .from('appointments')
    .select(`
      id,
      appointment_datetime,
      reason,
      professional_id,
      patient:patients!patient_id(name, species),
      tutor:tutors!tutor_id(name)
    `)
    .eq('clinic_id', clinicId)
    .gte('appointment_datetime', todayStart)
    .lte('appointment_datetime', todayEnd)
    .not('status', 'eq', 'cancelled')
    .not('professional_id', 'is', null)
    .order('appointment_datetime')

  // Busca sessões de grooming de hoje com groomer_id
  const { data: groomingSessions } = await admin
    .from('grooming_sessions')
    .select(`
      id,
      scheduled_at,
      services_requested,
      groomer_id,
      patient:patients!patient_id(name, species),
      tutor:tutors!tutor_id(name)
    `)
    .eq('clinic_id', clinicId)
    .gte('scheduled_at', todayStart)
    .lte('scheduled_at', todayEnd)
    .not('status', 'eq', 'cancelled')
    .not('groomer_id', 'is', null)

  // Agrupa por professional_id
  const byProfessional: Record<string, {
    appointments: typeof appointments
    groomings:    typeof groomingSessions
  }> = {}

  for (const appt of (appointments ?? [])) {
    const pid = appt.professional_id as string
    if (!byProfessional[pid]) byProfessional[pid] = { appointments: [], groomings: [] }
    byProfessional[pid].appointments!.push(appt)
  }

  for (const gs of (groomingSessions ?? [])) {
    const pid = gs.groomer_id as string
    if (!byProfessional[pid]) byProfessional[pid] = { appointments: [], groomings: [] }
    byProfessional[pid].groomings!.push(gs)
  }

  if (Object.keys(byProfessional).length === 0) {
    return { sent: 0, skipped: 0, errors: [] }
  }

  // Busca perfis dos profissionais (phone)
  const professionalIds = Object.keys(byProfessional)
  const { data: professionals } = await admin
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', professionalIds)

  const profMap = Object.fromEntries(
    (professionals ?? []).map(p => [p.id, p])
  )

  const [dd, mm, yyyy] = [
    today.slice(8, 10), today.slice(5, 7), today.slice(0, 4),
  ]
  const dateLabel = `${dd}/${mm}/${yyyy}`

  const result: DailyScheduleResult = { sent: 0, skipped: 0, errors: [] }

  for (const [profId, schedule] of Object.entries(byProfessional)) {
    const prof = profMap[profId]
    if (!prof?.phone) { result.skipped++; continue }

    const phone = prof.phone.replace(/\D/g, '')
    const total = (schedule.appointments?.length ?? 0) + (schedule.groomings?.length ?? 0)

    let lines = [
      `Olá, ${prof.full_name}! 🐾`,
      `Aqui está sua agenda para *${dateLabel}* (${total} atendimento${total !== 1 ? 's' : ''}):`,
      '',
    ]

    for (const appt of (schedule.appointments ?? [])) {
      const time      = fmtTime(appt.appointment_datetime as string)
      const petName   = (appt.patient as any)?.name ?? 'Pet'
      const tutorName = (appt.tutor as any)?.name ?? ''
      const label     = REASON_LABELS[(appt.reason as string)] ?? appt.reason
      lines.push(`• *${time}* — ${petName} (${label})${tutorName ? ` · Tutor: ${tutorName}` : ''}`)
    }

    for (const gs of (schedule.groomings ?? [])) {
      const time      = gs.scheduled_at ? fmtTime(gs.scheduled_at as string) : '—'
      const petName   = (gs.patient as any)?.name ?? 'Pet'
      const tutorName = (gs.tutor as any)?.name ?? ''
      const services  = ((gs.services_requested as string[]) ?? []).join(', ')
      lines.push(`• *${time}* — ✂️ ${petName} (${services})${tutorName ? ` · Tutor: ${tutorName}` : ''}`)
    }

    lines.push('', 'Bom atendimento! 🩺')
    const message = lines.join('\n')

    const creds: EvolutionCreds = {
      apiUrl:     whatsappCfg.api_url,
      instanceId: whatsappCfg.instance_id,
      apiKey:     whatsappCfg.token,
    }

    try {
      await evolutionSendText(creds, phone, message)
      result.sent++
    } catch (err: any) {
      result.errors.push(`${prof.full_name}: ${err?.message ?? 'Erro desconhecido'}`)
    }
  }

  return result
}
