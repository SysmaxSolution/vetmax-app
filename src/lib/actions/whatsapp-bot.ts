'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  id?:                  string
  personality_prompt:   string | null
  can_book:             boolean
  can_inform_prices:    boolean
  working_hours_start:  string | null   // 'HH:MM'
  working_hours_end:    string | null   // 'HH:MM'
  use_clinic_hours:     boolean         // segue clinics.business_hours por dia
  is_active:            boolean
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

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getBotConfig(): Promise<BotConfig | null> {
  const auth = await getClinicId()
  if ('error' in auth) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_bot_config')
    .select('id, personality_prompt, can_book, can_inform_prices, working_hours_start, working_hours_end, use_clinic_hours, is_active')
    .eq('clinic_id', auth.clinicId)
    .maybeSingle()

  return data ?? null
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveBotConfig(
  config: BotConfig
): Promise<{ success: true } | { error: string }> {
  const auth = await getClinicId()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_bot_config')
    .upsert({
      clinic_id:            auth.clinicId,
      personality_prompt:   config.personality_prompt || null,
      can_book:             config.can_book,
      can_inform_prices:    config.can_inform_prices,
      working_hours_start:  config.working_hours_start || null,
      working_hours_end:    config.working_hours_end   || null,
      use_clinic_hours:     config.use_clinic_hours,
      is_active:            config.is_active,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'clinic_id' })

  if (error) return { error: error.message }
  return { success: true }
}
