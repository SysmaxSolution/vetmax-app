'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WppConversation {
  id:               string
  tutor_phone:      string
  tutor_name:       string | null
  status:           'bot' | 'human' | 'closed'
  last_message_at:  string | null
  created_at:       string
  unread_count:     number
  pinned_at:        string | null
  pin_order:        number | null
  assigned_to:      string | null
  is_urgent:        boolean
  lgpd_accepted_at: string | null
}

export interface StaffMember {
  id:        string
  full_name: string | null
}

export interface WppMessage {
  id:         string
  direction:  'inbound' | 'outbound'
  content:    string
  sent_by:    'bot' | 'human' | 'client'
  created_at: string
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getClinicId(): Promise<{ clinicId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  return { clinicId: profile.clinic_id }
}

// ─── List conversations ───────────────────────────────────────────────────────

export async function getWhatsappConversations(
  statusFilter?: 'bot' | 'human' | 'closed' | 'all',
): Promise<WppConversation[] | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  let query = admin
    .from('whatsapp_conversations')
    .select('id, tutor_phone, tutor_name, status, last_message_at, created_at, unread_count, pinned_at, pin_order, assigned_to, is_urgent, lgpd_accepted_at')
    .eq('clinic_id', auth.clinicId)
    .order('is_urgent', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50)

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return (data ?? []) as WppConversation[]
}

// ─── Messages for a conversation ─────────────────────────────────────────────

export async function getConversationMessages(
  conversationId: string,
): Promise<WppMessage[] | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()

  // Verifica que a conversa pertence à clínica
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('id, direction, content, sent_by, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return { error: error.message }
  return (data ?? []) as WppMessage[]
}

// ─── Send human reply ─────────────────────────────────────────────────────────

export async function sendHumanMessage(
  conversationId: string,
  text: string,
): Promise<{ success: true } | { error: string }> {
  if (!text.trim()) return { error: 'Mensagem vazia.' }

  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id, tutor_phone, status')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }
  if (conv.status !== 'human') return { error: 'Conversa não está em modo humano.' }

  const { error: msgErr } = await admin.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    clinic_id:       auth.clinicId,
    direction:       'outbound',
    content:         text.trim(),
    sent_by:         'human',
  })
  if (msgErr) return { error: msgErr.message }

  await admin.from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // Envia via Evolution API (falha silenciosa — mensagem já foi salva no banco)
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (apiUrl && apiKey) {
    const { data: settings } = await admin
      .from('clinic_whatsapp_settings')
      .select('evolution_instance_name')
      .eq('clinic_id', auth.clinicId)
      .maybeSingle()

    if (settings?.evolution_instance_name) {
      try {
        await evolutionSendText(
          { apiUrl, instanceId: settings.evolution_instance_name, apiKey },
          conv.tutor_phone,
          text.trim(),
        )
      } catch (err) {
        console.error('[Human reply] Erro ao enviar via Evolution API:', err)
      }
    }
  }

  return { success: true }
}

// ─── Take over (bot → human) ──────────────────────────────────────────────────

export async function takeOverConversation(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ status: 'human' })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Return to bot ────────────────────────────────────────────────────────────

export async function returnToBot(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ status: 'bot' })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Bulk actions ─────────────────────────────────────────────────────────────

/**
 * Aplica em lote uma transição de status sobre múltiplas conversas da clínica.
 * Não permite mexer em conversas de OUTRA clínica (filtro clinic_id no UPDATE).
 */
async function bulkUpdateStatus(
  conversationIds: string[],
  status: 'bot' | 'human' | 'closed',
): Promise<{ updated: number } | { error: string }> {
  if (!conversationIds || conversationIds.length === 0) {
    return { error: 'Nenhuma conversa selecionada.' }
  }

  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .update({ status })
    .eq('clinic_id', auth.clinicId)
    .in('id', conversationIds)
    .select('id')

  if (error) return { error: error.message }
  return { updated: (data ?? []).length }
}

export async function takeOverConversationsBulk(
  conversationIds: string[],
): Promise<{ updated: number } | { error: string }> {
  return bulkUpdateStatus(conversationIds, 'human')
}

export async function returnConversationsToBotBulk(
  conversationIds: string[],
): Promise<{ updated: number } | { error: string }> {
  return bulkUpdateStatus(conversationIds, 'bot')
}

// ─── Close conversation ───────────────────────────────────────────────────────

export async function closeConversation(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ status: 'closed' })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Reopen conversation ──────────────────────────────────────────────────────

export async function reopenConversation(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ status: 'bot' })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Unread / read ────────────────────────────────────────────────────────────

export async function markWppRead(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function markWppUnread(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ unread_count: 1 })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function markAllWppRead(): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('clinic_id', auth.clinicId)
    .gt('unread_count', 0)
  if (error) return { error: error.message }
  return { success: true }
}

export async function markWppReadBulk(
  conversationIds: string[],
): Promise<{ updated: number } | { error: string }> {
  if (!conversationIds.length) return { error: 'Nenhuma conversa selecionada.' }
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('clinic_id', auth.clinicId)
    .in('id', conversationIds)
    .select('id')
  if (error) return { error: error.message }
  return { updated: (data ?? []).length }
}

export async function markWppUnreadBulk(
  conversationIds: string[],
): Promise<{ updated: number } | { error: string }> {
  if (!conversationIds.length) return { error: 'Nenhuma conversa selecionada.' }
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .update({ unread_count: 1 })
    .eq('clinic_id', auth.clinicId)
    .in('id', conversationIds)
    .select('id')
  if (error) return { error: error.message }
  return { updated: (data ?? []).length }
}

// ─── Pin / unpin ──────────────────────────────────────────────────────────────

// ─── Staff list (Feature 1) ───────────────────────────────────────────────────

export async function getClinicStaff(): Promise<StaffMember[] | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('clinic_id', auth.clinicId)
    .order('full_name')
  if (error) return { error: error.message }
  return (data ?? []) as StaffMember[]
}

export async function assignWppConversation(
  conversationId: string,
  userId: string | null,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ assigned_to: userId })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Urgency (Feature 6) ──────────────────────────────────────────────────────

export async function markWppUrgent(
  conversationId: string,
  urgent: boolean,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ is_urgent: urgent })
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Clinical context (Feature 5) ────────────────────────────────────────────

import type { ClinicalContext } from '@/types/whatsapp'

export async function getTutorClinicalContext(phone: string): Promise<ClinicalContext | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '').slice(-8)

  const { data: tutor } = await admin
    .from('tutors')
    .select('id, name, phone')
    .eq('clinic_id', auth.clinicId)
    .ilike('phone', `%${cleanPhone}%`)
    .limit(1)
    .maybeSingle()

  if (!tutor) return { tutor: null, patients: [] }

  const { data: rawPatients } = await admin
    .from('patients')
    .select('id, name, species, breed, weight_kg')
    .eq('clinic_id', auth.clinicId)
    .eq('tutor_id', tutor.id)
    .order('name')
    .limit(8)

  if (!rawPatients?.length) {
    return { tutor: { id: tutor.id, name: tutor.name ?? null, phone: tutor.phone ?? null }, patients: [] }
  }

  const today = new Date().toISOString().split('T')[0]

  const enriched = await Promise.all(rawPatients.map(async (pet) => {
    const [lastRes, upcomingRes] = await Promise.all([
      admin.from('consultations')
        .select('scheduled_date, visit_reason, status')
        .eq('clinic_id', auth.clinicId)
        .eq('patient_id', pet.id)
        .not('status', 'in', '("cancelled")')
        .lt('scheduled_date', today)
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('consultations')
        .select('scheduled_date, visit_reason')
        .eq('clinic_id', auth.clinicId)
        .eq('patient_id', pet.id)
        .not('status', 'in', '("cancelled","completed")')
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      id:    pet.id,
      name:  pet.name,
      species: pet.species,
      breed: pet.breed ?? null,
      last_weight: typeof pet.weight_kg === 'number' ? pet.weight_kg : null,
      last_consultation: lastRes.data
        ? { date: lastRes.data.scheduled_date as string, visit_reason: lastRes.data.visit_reason as string, status: lastRes.data.status as string }
        : null,
      upcoming_consultation: upcomingRes.data
        ? { date: upcomingRes.data.scheduled_date as string, visit_reason: upcomingRes.data.visit_reason as string }
        : null,
    }
  }))

  return {
    tutor: { id: tutor.id, name: tutor.name ?? null, phone: tutor.phone ?? null },
    patients: enriched,
  }
}

// ─── Message → Prontuário link (Feature 8) ────────────────────────────────────

export async function linkWppMessage(
  messageId: string,
  consultationId: string,
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('whatsapp_messages')
    .select('id, conversation_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg) return { error: 'Mensagem não encontrada.' }

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', msg.conversation_id)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Acesso negado.' }

  const { error } = await admin.from('whatsapp_message_links').insert({
    clinic_id:       auth.clinicId,
    conversation_id: msg.conversation_id,
    message_id:      messageId,
    consultation_id: consultationId,
    note:            note ?? null,
    created_by:      user?.id ?? null,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function getConversationConsultations(
  conversationId: string,
): Promise<Array<{ id: string; scheduled_date: string | null; visit_reason: string | null; status: string }> | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('tutor_phone')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  const cleanPhone = conv.tutor_phone.replace('@s.whatsapp.net', '').replace(/\D/g, '').slice(-8)
  const { data: tutor } = await admin
    .from('tutors')
    .select('id')
    .eq('clinic_id', auth.clinicId)
    .ilike('phone', `%${cleanPhone}%`)
    .limit(1)
    .maybeSingle()
  if (!tutor) return []

  const { data: patients } = await admin
    .from('patients')
    .select('id, name')
    .eq('clinic_id', auth.clinicId)
    .eq('tutor_id', tutor.id)

  const petIds = (patients ?? []).map((p: { id: string }) => p.id)
  if (!petIds.length) return []

  const { data, error } = await admin
    .from('consultations')
    .select('id, scheduled_date, visit_reason, status, patients!inner(name)')
    .eq('clinic_id', auth.clinicId)
    .in('patient_id', petIds)
    .not('status', 'in', '("cancelled")')
    .order('scheduled_date', { ascending: false })
    .limit(8)

  if (error) return { error: error.message }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:             r.id as string,
    scheduled_date: r.scheduled_date as string | null,
    visit_reason:   r.visit_reason as string | null,
    status:         r.status as string,
    pet_name:       (r.patients as { name: string } | null)?.name ?? '',
  })) as Array<{ id: string; scheduled_date: string | null; visit_reason: string | null; status: string }>
}

export async function toggleWppPin(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('pinned_at, pin_order')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  if (conv.pinned_at !== null) {
    const { error } = await admin
      .from('whatsapp_conversations')
      .update({ pinned_at: null, pin_order: null })
      .eq('id', conversationId)
      .eq('clinic_id', auth.clinicId)
    if (error) return { error: error.message }
  } else {
    const { data: maxRow } = await admin
      .from('whatsapp_conversations')
      .select('pin_order')
      .eq('clinic_id', auth.clinicId)
      .not('pin_order', 'is', null)
      .order('pin_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = ((maxRow?.pin_order as number | null) ?? 0) + 1
    const { error } = await admin
      .from('whatsapp_conversations')
      .update({ pinned_at: new Date().toISOString(), pin_order: nextOrder })
      .eq('id', conversationId)
      .eq('clinic_id', auth.clinicId)
    if (error) return { error: error.message }
  }

  return { success: true }
}
