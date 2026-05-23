'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WppConversation {
  id:              string
  tutor_phone:     string
  tutor_name:      string | null
  status:          'bot' | 'human' | 'closed'
  last_message_at: string | null
  created_at:      string
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
    .select('id, tutor_phone, tutor_name, status, last_message_at, created_at')
    .eq('clinic_id', auth.clinicId)
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
