'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText, evolutionSendMedia } from '@/lib/evolution-api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WppConversation {
  id:                string
  tutor_phone:       string
  tutor_name:        string | null
  status:            'bot' | 'human' | 'closed'
  last_message_at:   string | null
  created_at:        string
  unread_count:      number
  pinned_at:         string | null
  pin_order:         number | null
  assigned_to:       string | null
  is_urgent:         boolean
  lgpd_accepted_at:  string | null
  tutor_id:          string | null
  pet_names_cache:   string | null
  tutor_photo_cache: string | null
}

export interface StaffMember {
  id:        string
  full_name: string | null
  photo_url: string | null
}

export interface WppMessage {
  id:                string
  direction:         'inbound' | 'outbound'
  content:           string
  sent_by:           'bot' | 'human' | 'client'
  created_at:        string
  ack:               number
  media_url:         string | null
  media_type:        string | null
  media_mime_type:   string | null
  media_filename:    string | null
  sender_profile_id: string | null
  sender_name:       string | null
}

export interface WppParticipant {
  profile_id: string
  full_name:  string | null
  photo_url:  string | null
  added_at:   string
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────

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

async function getClinicAndUser(): Promise<{ clinicId: string; userId: string; userName: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  return { clinicId: profile.clinic_id, userId: user.id, userName: profile.full_name ?? null }
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
    .select('id, tutor_phone, tutor_name, status, last_message_at, created_at, unread_count, pinned_at, pin_order, assigned_to, is_urgent, lgpd_accepted_at, tutor_id, pet_names_cache, tutor_photo_cache')
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

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('id, direction, content, sent_by, created_at, ack, media_url, media_type, media_mime_type, media_filename, sender_profile_id, sender_name')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { error: error.message }
  return (data ?? []) as WppMessage[]
}

// ─── Send human reply ─────────────────────────────────────────────────────────

export async function sendHumanMessage(
  conversationId: string,
  text: string,
): Promise<{ success: true } | { error: string }> {
  if (!text.trim()) return { error: 'Mensagem vazia.' }

  const auth = await getClinicAndUser()
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

  const { data: savedMsg, error: msgErr } = await admin
    .from('whatsapp_messages')
    .insert({
      conversation_id:   conversationId,
      clinic_id:         auth.clinicId,
      direction:         'outbound',
      content:           text.trim(),
      sent_by:           'human',
      sender_profile_id: auth.userId,
      sender_name:       auth.userName,
    })
    .select('id')
    .single()

  if (msgErr) return { error: msgErr.message }

  await admin.from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

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
        const evolutionMsgId = await evolutionSendText(
          { apiUrl, instanceId: settings.evolution_instance_name, apiKey },
          conv.tutor_phone,
          text.trim(),
        )
        if (evolutionMsgId && savedMsg) {
          await admin.from('whatsapp_messages')
            .update({ evolution_message_id: evolutionMsgId })
            .eq('id', savedMsg.id)
        }
      } catch (err) {
        console.error('[Human reply] Erro ao enviar via Evolution API:', err)
      }
    }
  }

  return { success: true }
}

// ─── Send media ───────────────────────────────────────────────────────────────

export async function sendMediaMessage(
  conversationId: string,
  params: {
    mediaUrl:  string
    mimeType:  string
    fileName:  string
    caption?:  string
  },
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicAndUser()
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

  const mediaType =
    params.mimeType.startsWith('image/') ? 'image' :
    params.mimeType.startsWith('video/') ? 'video' :
    params.mimeType.startsWith('audio/') ? 'audio' :
    'document'

  const { data: savedMsg, error: msgErr } = await admin
    .from('whatsapp_messages')
    .insert({
      conversation_id:   conversationId,
      clinic_id:         auth.clinicId,
      direction:         'outbound',
      content:           params.caption ?? '',
      sent_by:           'human',
      sender_profile_id: auth.userId,
      sender_name:       auth.userName,
      media_url:         params.mediaUrl,
      media_type:        mediaType,
      media_mime_type:   params.mimeType,
      media_filename:    params.fileName,
    })
    .select('id')
    .single()

  if (msgErr) return { error: msgErr.message }

  await admin.from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

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
        const evolutionMsgId = await evolutionSendMedia(
          { apiUrl, instanceId: settings.evolution_instance_name, apiKey },
          conv.tutor_phone,
          params,
        )
        if (evolutionMsgId && savedMsg) {
          await admin.from('whatsapp_messages')
            .update({ evolution_message_id: evolutionMsgId })
            .eq('id', savedMsg.id)
        }
      } catch (err) {
        console.error('[Media reply] Erro ao enviar via Evolution API:', err)
      }
    }
  }

  return { success: true }
}

// ─── Take over / Return to bot ────────────────────────────────────────────────

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

// ─── Close / Reopen ───────────────────────────────────────────────────────────

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

// ─── Bulk actions ─────────────────────────────────────────────────────────────

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

export async function takeOverConversationsBulk(ids: string[]) { return bulkUpdateStatus(ids, 'human') }
export async function returnConversationsToBotBulk(ids: string[]) { return bulkUpdateStatus(ids, 'bot') }

// ─── Unread / read ────────────────────────────────────────────────────────────

export async function markWppRead(conversationId: string): Promise<{ success: true } | { error: string }> {
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

export async function markWppUnread(conversationId: string): Promise<{ success: true } | { error: string }> {
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

export async function markWppReadBulk(conversationIds: string[]): Promise<{ updated: number } | { error: string }> {
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

export async function markWppUnreadBulk(conversationIds: string[]): Promise<{ updated: number } | { error: string }> {
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

export async function toggleWppPin(conversationId: string): Promise<{ success: true } | { error: string }> {
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

// ─── Staff list ───────────────────────────────────────────────────────────────

export async function getClinicStaff(): Promise<StaffMember[] | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, photo_url')
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

// ─── Urgency ──────────────────────────────────────────────────────────────────

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

// ─── Clinical context ─────────────────────────────────────────────────────────

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
      id:      pet.id,
      name:    pet.name,
      species: pet.species,
      breed:   pet.breed ?? null,
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

// ─── Message → Prontuário link ────────────────────────────────────────────────

export async function linkWppMessage(
  messageId: string,
  consultationId: string,
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicAndUser()
  if ('error' in auth) return auth

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
    created_by:      auth.userId,
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

// ─── Participants ─────────────────────────────────────────────────────────────

export async function getConversationParticipants(
  conversationId: string,
): Promise<WppParticipant[] | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  // Verifica acesso
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  // Busca participantes explícitos
  const { data: explicit } = await admin
    .from('whatsapp_conversation_participants')
    .select('profile_id, added_at, profiles!inner(full_name, photo_url)')
    .eq('conversation_id', conversationId)
    .eq('clinic_id', auth.clinicId)

  // Busca remetentes únicos das mensagens (participação implícita)
  const { data: senders } = await admin
    .from('whatsapp_messages')
    .select('sender_profile_id, sender_name')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sent_by', 'human')
    .not('sender_profile_id', 'is', null)

  const seen = new Set<string>()
  const participants: WppParticipant[] = []

  for (const row of (explicit ?? [])) {
    const p = row.profiles as { full_name: string | null; photo_url: string | null } | null
    if (!seen.has(row.profile_id)) {
      seen.add(row.profile_id)
      participants.push({ profile_id: row.profile_id, full_name: p?.full_name ?? null, photo_url: p?.photo_url ?? null, added_at: row.added_at })
    }
  }

  for (const s of (senders ?? [])) {
    if (s.sender_profile_id && !seen.has(s.sender_profile_id)) {
      seen.add(s.sender_profile_id)
      // Busca dados do perfil
      const { data: prof } = await admin.from('profiles').select('full_name, photo_url').eq('id', s.sender_profile_id).maybeSingle()
      participants.push({
        profile_id: s.sender_profile_id,
        full_name:  prof?.full_name ?? s.sender_name ?? null,
        photo_url:  prof?.photo_url ?? null,
        added_at:   new Date().toISOString(),
      })
    }
  }

  return participants
}

export async function addConversationParticipant(
  conversationId: string,
  profileId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicAndUser()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada.' }

  const { error } = await admin
    .from('whatsapp_conversation_participants')
    .insert({
      conversation_id: conversationId,
      profile_id:      profileId,
      clinic_id:       auth.clinicId,
      added_by:        auth.userId,
    })
    .select('id')
    .single()

  if (error && !error.message.includes('unique')) return { error: error.message }
  return { success: true }
}

export async function removeConversationParticipant(
  conversationId: string,
  profileId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth
  const admin = createAdminClient()

  const { error } = await admin
    .from('whatsapp_conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
    .eq('clinic_id', auth.clinicId)

  if (error) return { error: error.message }
  return { success: true }
}
