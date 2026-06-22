'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'
import type { AppointmentRequest } from '@/types'

async function getClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('clinic_id').eq('id', user.id).single()
  return data?.clinic_id ?? null
}

export async function getAppointmentRequests(
  status: 'pending_reception_validation' | 'all' = 'pending_reception_validation'
): Promise<AppointmentRequest[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  let q = admin
    .from('appointment_requests')
    .select(`
      *,
      tutor:tutors ( name, phone ),
      pet:patients ( name )
    `)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data, error } = await q
  if (error) return { error: error.message }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const tutor = (Array.isArray(row.tutor) ? row.tutor[0] : row.tutor) as Record<string, string> | null
    const pet   = (Array.isArray(row.pet)   ? row.pet[0]   : row.pet)   as Record<string, string> | null
    const { tutor: _t, pet: _p, ...rest } = row
    void _t; void _p
    return {
      ...(rest as unknown as AppointmentRequest),
      tutor_name:  tutor?.name  ?? null,
      tutor_phone: tutor?.phone ?? null,
      pet_name:    pet?.name    ?? (row.pet_name_free as string | null) ?? null,
    }
  })
}

export async function approveAppointmentRequest(
  requestId: string,
  opts: { vetId?: string; notes?: string } = {}
): Promise<{ ok: true; appointmentId: string } | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: req } = await admin
    .from('appointment_requests')
    .select('*')
    .eq('id', requestId)
    .eq('clinic_id', clinicId)
    .single()

  if (!req) return { error: 'Solicitação não encontrada.' }
  if (req.status !== 'pending_reception_validation') return { error: 'Solicitação já processada.' }

  // Cria o appointment real
  const datetime = `${req.preferred_date}T${req.preferred_time}:00`
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      clinic_id:            clinicId,
      pet_id:               req.pet_id,
      tutor_id:             req.tutor_id,
      appointment_datetime: datetime,
      reason:               req.visit_reason ?? 'consultation',
      status:               'scheduled',
      source:               'whatsapp',
      vet_id:               opts.vetId ?? req.vet_id ?? null,
    })
    .select('id')
    .single()

  if (apptErr || !appt) return { error: apptErr?.message ?? 'Erro ao criar agendamento.' }

  await admin
    .from('appointment_requests')
    .update({
      status:                 'approved',
      validated_by_id:        user?.id ?? null,
      validated_at:           new Date().toISOString(),
      validation_notes:       opts.notes ?? null,
      created_appointment_id: appt.id,
    })
    .eq('id', requestId)

  await _notifyTutor(admin, clinicId, req, 'approved', { appointmentDatetime: datetime })

  return { ok: true, appointmentId: appt.id }
}

export async function proposeAlternativeSlot(
  requestId: string,
  proposedDate: string,
  proposedTime: string,
  notes?: string
): Promise<{ ok: true } | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: req } = await admin
    .from('appointment_requests')
    .select('*')
    .eq('id', requestId)
    .eq('clinic_id', clinicId)
    .single()

  if (!req) return { error: 'Solicitação não encontrada.' }
  if (req.status !== 'pending_reception_validation') return { error: 'Solicitação já processada.' }

  await admin
    .from('appointment_requests')
    .update({
      status:          'proposed_alternative',
      validated_by_id: user?.id ?? null,
      validated_at:    new Date().toISOString(),
      validation_notes: notes ?? null,
      proposed_date:   proposedDate,
      proposed_time:   proposedTime,
    })
    .eq('id', requestId)

  await _notifyTutor(admin, clinicId, req, 'proposed_alternative', { proposedDate, proposedTime })

  return { ok: true }
}

export async function rejectAppointmentRequest(
  requestId: string,
  notes: string
): Promise<{ ok: true } | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: req } = await admin
    .from('appointment_requests')
    .select('*')
    .eq('id', requestId)
    .eq('clinic_id', clinicId)
    .single()

  if (!req) return { error: 'Solicitação não encontrada.' }
  if (req.status !== 'pending_reception_validation') return { error: 'Solicitação já processada.' }

  await admin
    .from('appointment_requests')
    .update({
      status:           'rejected',
      validated_by_id:  user?.id ?? null,
      validated_at:     new Date().toISOString(),
      validation_notes: notes,
    })
    .eq('id', requestId)

  await _notifyTutor(admin, clinicId, req, 'rejected', { notes })

  return { ok: true }
}

// Notificação outbound sem depender de conversa ativa
async function _notifyTutor(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  req: Record<string, unknown>,
  outcome: 'approved' | 'proposed_alternative' | 'rejected',
  ctx: { appointmentDatetime?: string; proposedDate?: string; proposedTime?: string; notes?: string }
) {
  const { data: tutor } = await admin
    .from('tutors')
    .select('phone, name')
    .eq('id', req.tutor_id as string)
    .single()
  if (!tutor?.phone) return

  const { data: wpp } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!wpp?.evolution_instance_name) return

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return

  const tutorName = (tutor.name ?? 'Tutor').split(' ')[0]
  const petName   = (req.pet_name_free as string | null) ?? 'seu pet'

  let msg = ''
  if (outcome === 'approved' && ctx.appointmentDatetime) {
    const dt = new Date(ctx.appointmentDatetime)
    const dateLabel = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    msg = `Ola, ${tutorName}! Sua solicitacao de agendamento para ${petName} foi CONFIRMADA para ${dateLabel} as ${timeLabel}. Te esperamos!`
  } else if (outcome === 'proposed_alternative' && ctx.proposedDate && ctx.proposedTime) {
    const dt = new Date(`${ctx.proposedDate}T${ctx.proposedTime}`)
    const dateLabel = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    msg = `Ola, ${tutorName}! Infelizmente o horario solicitado para ${petName} nao esta disponivel. Podemos oferecer ${dateLabel} as ${timeLabel}. Deseja confirmar? Responda SIM para aceitar ou entre em contato para outro horario.`
  } else if (outcome === 'rejected') {
    msg = `Ola, ${tutorName}! Infelizmente nao conseguimos atender sua solicitacao de agendamento para ${petName} no momento. ${ctx.notes ? ctx.notes + ' ' : ''}Entre em contato para verificar disponibilidade.`
  }

  if (!msg) return

  try {
    await evolutionSendText(
      { apiUrl, instanceId: wpp.evolution_instance_name, apiKey },
      tutor.phone,
      msg,
    )
  } catch { /* best effort */ }
}
