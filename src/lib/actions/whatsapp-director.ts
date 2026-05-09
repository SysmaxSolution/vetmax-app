'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhatsappDirectorStats {
  open_bot:       number
  awaiting_human: number
  total_open:     number
  campaigns_week: number
  response_rate:  number   // 0–100 inteiro
  recent: {
    id:              string
    tutor_phone:     string
    tutor_name:      string | null
    status:          string
    last_message_at: string | null
  }[]
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getWhatsappDirectorStats(
  clinicId: string,
): Promise<WhatsappDirectorStats> {
  const admin = createAdminClient()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [
    { data: conversations },
    { count: campaignsWeek },
    { data: campaignLogs },
  ] = await Promise.all([
    admin
      .from('whatsapp_conversations')
      .select('id, tutor_phone, tutor_name, status, last_message_at')
      .eq('clinic_id', clinicId)
      .neq('status', 'closed')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100),
    admin
      .from('whatsapp_campaign_logs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('sent_at', weekAgo),
    admin
      .from('whatsapp_campaign_logs')
      .select('response_received')
      .eq('clinic_id', clinicId)
      .gte('sent_at', monthAgo),
  ])

  const open_bot       = (conversations ?? []).filter(c => c.status === 'bot').length
  const awaiting_human = (conversations ?? []).filter(c => c.status === 'human').length
  const total_open     = (conversations ?? []).length

  const logs          = campaignLogs ?? []
  const response_rate = logs.length
    ? Math.round((logs.filter(l => l.response_received).length / logs.length) * 100)
    : 0

  return {
    open_bot,
    awaiting_human,
    total_open,
    campaigns_week: campaignsWeek ?? 0,
    response_rate,
    recent: (conversations ?? []).slice(0, 6).map(c => ({
      id:              c.id,
      tutor_phone:     c.tutor_phone,
      tutor_name:      c.tutor_name,
      status:          c.status,
      last_message_at: c.last_message_at,
    })),
  }
}
