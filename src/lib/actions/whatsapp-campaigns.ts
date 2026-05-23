'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'no_visit'
  | 'vaccine_due'
  | 'pending_return'
  | 'grooming_due'
  | 'appointment_confirmation'

export interface Campaign {
  id?:            string
  trigger_type:   TriggerType
  days_threshold: number
  is_active:      boolean
  send_hour:      number
}

export interface CampaignLog {
  id:                string
  tutor_id:          string | null
  campaign_id:       string | null
  sent_at:           string
  response_received: boolean
  tutor_name:        string | null
  trigger_type:      string | null
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

// ─── Get campaigns ────────────────────────────────────────────────────────────

export async function getCampaigns(): Promise<Campaign[]> {
  const auth = await getClinicId()
  if ('error' in auth) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_campaigns')
    .select('id, trigger_type, days_threshold, is_active, send_hour')
    .eq('clinic_id', auth.clinicId)
    .order('created_at')

  return (data ?? []) as Campaign[]
}

// ─── Save (upsert) campaign ───────────────────────────────────────────────────

export async function saveCampaign(
  campaign: Campaign,
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()

  if (campaign.id) {
    const { error } = await admin
      .from('whatsapp_campaigns')
      .update({
        days_threshold: campaign.days_threshold,
        is_active:      campaign.is_active,
        send_hour:      campaign.send_hour,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('clinic_id', auth.clinicId)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('whatsapp_campaigns')
      .insert({
        clinic_id:      auth.clinicId,
        trigger_type:   campaign.trigger_type,
        days_threshold: campaign.days_threshold,
        is_active:      campaign.is_active,
        send_hour:      campaign.send_hour,
      })
    if (error) return { error: error.message }
  }

  return { success: true }
}

// ─── Campaign logs ────────────────────────────────────────────────────────────

export async function getCampaignLogs(limit = 20): Promise<CampaignLog[]> {
  const auth = await getClinicId()
  if ('error' in auth) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_campaign_logs')
    .select(`
      id,
      tutor_id,
      campaign_id,
      sent_at,
      response_received,
      tutors:tutor_id ( name ),
      whatsapp_campaigns:campaign_id ( trigger_type )
    `)
    .eq('clinic_id', auth.clinicId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(row => ({
    id:                row.id,
    tutor_id:          row.tutor_id,
    campaign_id:       row.campaign_id,
    sent_at:           row.sent_at,
    response_received: row.response_received,
    tutor_name:        ((Array.isArray(row.tutors)            ? row.tutors[0]            : row.tutors)            as { name: string } | null)?.name ?? null,
    trigger_type:      ((Array.isArray(row.whatsapp_campaigns) ? row.whatsapp_campaigns[0] : row.whatsapp_campaigns) as { trigger_type: string } | null)?.trigger_type ?? null,
  }))
}
