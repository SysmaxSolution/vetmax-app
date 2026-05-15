'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlowConfig = {
  vet_merged_modules:    Array<'triage' | 'exams'>
  use_accounting_chart?: boolean
  mentor_idle_enabled?:  boolean
  mentor_idle_seconds?:  number
}

export type BusinessHourEntry = { open: string; close: string } | null

export type BusinessHours = {
  monday:    BusinessHourEntry
  tuesday:   BusinessHourEntry
  wednesday: BusinessHourEntry
  thursday:  BusinessHourEntry
  friday:    BusinessHourEntry
  saturday:  BusinessHourEntry
  sunday:    BusinessHourEntry
}

export type AiTranscriptionMode = 'transcribe_only' | 'ai_assisted'

export type ClinicConfig = {
  logo_url:              string | null
  active_modules:        string[]
  continuous_flow:       boolean
  flow_config:           FlowConfig
  business_hours:        BusinessHours | null
  working_days:          number[]
  holiday_work:          boolean
  ai_transcription_mode: AiTranscriptionMode
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getClinicConfig(): Promise<ClinicConfig | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinics')
    .select('logo_url, active_modules, continuous_flow, flow_config, business_hours, working_days, holiday_work, ai_transcription_mode')
    .eq('id', profile.clinic_id)
    .single()

  if (error || !data) return { error: 'Erro ao buscar configurações.' }

  return {
    logo_url:              data.logo_url ?? null,
    active_modules:        (data.active_modules as string[]) ?? ['reception','triage','consultation','exams','hospitalization','pharmacy'],
    continuous_flow:       (data.continuous_flow as boolean) ?? false,
    flow_config:           (data.flow_config as FlowConfig) ?? { vet_merged_modules: [] },
    business_hours:        (data.business_hours as BusinessHours) ?? null,
    working_days:          (data.working_days as number[]) ?? [1,2,3,4,5],
    holiday_work:          (data.holiday_work as boolean) ?? false,
    ai_transcription_mode: (data.ai_transcription_mode as AiTranscriptionMode) ?? 'ai_assisted',
  }
}

// ─── Update modules, flow, business hours ─────────────────────────────────────

export async function updateClinicConfig(payload: {
  active_modules?:       string[]
  continuous_flow?:      boolean
  flow_config?:          FlowConfig
  reception_checklist?:  string[]
  business_hours?:       BusinessHours
  working_days?:         number[]
  holiday_work?:         boolean
  ai_transcription_mode?: AiTranscriptionMode
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinics')
    .update(payload)
    .eq('id', profile.clinic_id)

  if (error) return { error: 'Erro ao salvar: ' + error.message }

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Module guard ─────────────────────────────────────────────────────────────

export async function isModuleActive(moduleKey: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return false

  const { data: clinic } = await supabase
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()

  const modules = clinic?.active_modules as string[] | null
  if (modules === null || modules === undefined) return true
  return modules.includes(moduleKey)
}

// ─── Upload Logo ──────────────────────────────────────────────────────────────

export async function uploadClinicLogo(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas admins podem alterar a logo.' }

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { error: 'Nenhum arquivo enviado.' }

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  if (!allowed.includes(file.type)) return { error: 'Formato não suportado. Use PNG, JPEG, WebP ou SVG.' }
  if (file.size > 2 * 1024 * 1024) return { error: 'Logo deve ter menos de 2MB.' }

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `${profile.clinic_id}/logo.${ext}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('clinic-logos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) return { error: 'Erro no upload: ' + upErr.message }

  const { data: { publicUrl } } = admin.storage
    .from('clinic-logos')
    .getPublicUrl(path)

  const url = `${publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from('clinics')
    .update({ logo_url: publicUrl })
    .eq('id', profile.clinic_id)

  if (dbErr) return { error: 'Erro ao salvar URL da logo: ' + dbErr.message }

  revalidatePath('/dashboard', 'layout')
  return { url }
}

// ─── Voice Triggers ───────────────────────────────────────────────────────────

export type VoiceTriggers = {
  startTriggers: string[]
  stopTriggers:  string[]
}

export async function getClinicVoiceTriggers(): Promise<VoiceTriggers | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinics')
    .select('voice_start_triggers, voice_stop_triggers')
    .eq('id', profile.clinic_id)
    .single()

  if (error || !data) return { error: 'Erro ao buscar triggers de voz.' }

  return {
    startTriggers: (data.voice_start_triggers as string[]) ?? [],
    stopTriggers:  (data.voice_stop_triggers  as string[]) ?? [],
  }
}

export async function updateClinicVoiceTriggers(
  startTriggers: string[],
  stopTriggers:  string[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar os gatilhos de voz.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinics')
    .update({ voice_start_triggers: startTriggers, voice_stop_triggers: stopTriggers })
    .eq('id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/grooming')
  revalidatePath('/dashboard/vet', 'layout')
  revalidatePath('/dashboard/hospitalization', 'layout')
  revalidatePath('/dashboard/triage', 'layout')
  revalidatePath('/dashboard/exams', 'layout')
  return { success: true }
}

// ─── Clinic Settings (tabela clinic_settings — 0055+) ────────────────────────

export interface ClinicSettingsConfig {
  allow_immediate_booking: boolean
  checkin_required_fields: string[]
  triage_required_fields: string[]
}

const SETTINGS_DEFAULTS: ClinicSettingsConfig = {
  allow_immediate_booking: false,
  checkin_required_fields: ['address', 'emergency_contact'],
  triage_required_fields: ['weight', 'temperature', 'chief_complaint'],
}

export async function getClinicSettingsConfig(): Promise<ClinicSettingsConfig | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data: settings } = await supabase
    .from('clinic_settings')
    .select('allow_immediate_booking, checkin_required_fields, triage_required_fields')
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (!settings) return SETTINGS_DEFAULTS

  return {
    allow_immediate_booking: settings.allow_immediate_booking ?? SETTINGS_DEFAULTS.allow_immediate_booking,
    checkin_required_fields: Array.isArray(settings.checkin_required_fields)
      ? settings.checkin_required_fields
      : SETTINGS_DEFAULTS.checkin_required_fields,
    triage_required_fields: Array.isArray(settings.triage_required_fields)
      ? settings.triage_required_fields
      : SETTINGS_DEFAULTS.triage_required_fields,
  }
}

export async function updateRequiredFields(
  checkin_required_fields: string[],
  triage_required_fields: string[]
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_settings')
    .upsert(
      {
        clinic_id: profile.clinic_id,
        checkin_required_fields,
        triage_required_fields,
      },
      { onConflict: 'clinic_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/triage', 'layout')
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Daily Schedule Alert Time ────────────────────────────────────────────────

export async function getDailyAlertTime(): Promise<{ alertTime: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinic_settings')
    .select('daily_schedule_alert_time')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()

  return { alertTime: data?.daily_schedule_alert_time ?? null }
}

export async function setDailyAlertTime(
  alertTime: string | null, // 'HH:MM' ou null para desabilitar
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_settings')
    .upsert(
      { clinic_id: profile.clinic_id, daily_schedule_alert_time: alertTime },
      { onConflict: 'clinic_id' }
    )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Remove Logo ──────────────────────────────────────────────────────────────

export async function removeClinicLogo(): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas admins podem remover a logo.' }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ logo_url: null })
    .eq('id', profile.clinic_id)

  revalidatePath('/dashboard', 'layout')
  return { success: true }
}
