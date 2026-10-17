'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  FlowConfig,
  BusinessHourEntry,
  BusinessHours,
  AiTranscriptionMode,
  ClinicConfig,
  VoiceTriggers,
  ClinicSettingsConfig,
  RegistrationSettings,
  LayoutVersion,
} from '@/types/clinic-settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
// ─── Types ────────────────────────────────────────────────────────────────────






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

  if (error) return { error: 'Erro ao salvar: ' + mensagemErro(error, 'lib/actions/clinic-settings.ts') }

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

// ─── Feature flags da Sprint Internação/Cirurgia (flow_config) ───────────────

/** Lê uma flag booleana de clinics.flow_config para a clínica do usuário logado. */
async function getFlowFlag(flag: keyof FlowConfig): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return false

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('flow_config')
    .eq('id', profile.clinic_id)
    .single()

  const flow = (clinic?.flow_config ?? {}) as FlowConfig
  return flow[flag] === true
}

/** TRUE quando a clínica ativou a versão avançada da Internação. */
export async function isInternacaoCompleta(): Promise<boolean> {
  return getFlowFlag('internacao_completa')
}

/** TRUE quando a clínica trabalha com convênios (gate global de convênio/repasse). */
export async function usesConvenios(): Promise<boolean> {
  return getFlowFlag('usa_convenios')
}

/** TRUE quando a clínica ativou a Academia de Treinamento (gate do menu + rota). */
export async function usesTreinamento(): Promise<boolean> {
  return getFlowFlag('usa_treinamento')
}

/** TRUE quando a clínica ativou o Fluxo de Rejeição de Exame. */
export async function usesFluxoRejeicaoExame(): Promise<boolean> {
  return getFlowFlag('usa_fluxo_rejeicao_exame')
}

/** TRUE quando a clínica ativou o módulo Centro Cirúrgico. */
export async function isCentroCirurgico(): Promise<boolean> {
  return getFlowFlag('centro_cirurgico')
}

// ─── Tarefa 0 — gates por rotina (padrão DESLIGADO) ─────────────────────────

/** TRUE quando a clínica ativou o módulo de Imagem/DICOM. */
export async function usesImagem(): Promise<boolean> {
  return getFlowFlag('usa_imagem')
}

/** TRUE quando a clínica ativou o Laboratório (resultados/analitos/HL7 no exame). */
export async function usesLaboratorio(): Promise<boolean> {
  return getFlowFlag('usa_laboratorio')
}

/** TRUE quando a clínica ativou os Boletos de cobrança. */
export async function usesBoleto(): Promise<boolean> {
  return getFlowFlag('usa_boleto')
}

/** TRUE quando a clínica ativou o Portal do Tutor. */
export async function usesPortalTutor(): Promise<boolean> {
  return getFlowFlag('portal_enabled')
}

// ─── Sub-features por tier (re-packaging 0408) ───────────────────────────────
// Derivadas do plano: premium/enterprise concedem por padrão. Override
// explícito via flow_config[flag]=true para clínicas specialized (à la carte).

const TIER_FEATURE_PLANS = new Set<string>(['premium', 'enterprise'])

async function hasTierFeature(flag: keyof FlowConfig): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return false

  const admin = createAdminClient()
  const [{ data: clinic }, { data: sub }] = await Promise.all([
    admin.from('clinics').select('flow_config').eq('id', profile.clinic_id).single(),
    admin
      .from('tenant_subscriptions')
      .select('plan_name, status')
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle(),
  ])

  // Override explícito (specialized à la carte) tem precedência.
  const flow = (clinic?.flow_config ?? {}) as FlowConfig
  if (flow[flag] === true) return true

  // Caso contrário, deriva do plano ativo.
  const planName = sub?.plan_name ?? 'free'
  const status = sub?.status ?? 'active'
  const usable = status === 'active' || status === 'trialing'
  return usable && TIER_FEATURE_PLANS.has(planName)
}

/** TRUE para Caixa Completo (Premium+); Starter usa PDV simples. */
export async function hasCashierComplete(): Promise<boolean> {
  return hasTierFeature('cashier_complete')
}

/** TRUE para Estoque Completo — kits/pacotes e alertas críticos (Premium+). */
export async function hasStockComplete(): Promise<boolean> {
  return hasTierFeature('stock_complete')
}

/** TRUE para Agenda Automatizada na Recepção (Premium+); Free/Starter manual. */
export async function hasReceptionAutoSchedule(): Promise<boolean> {
  return hasTierFeature('reception_auto_schedule')
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

  if (upErr) return { error: 'Erro no upload: ' + mensagemErro(upErr, 'lib/actions/clinic-settings.ts') }

  const { data: { publicUrl } } = admin.storage
    .from('clinic-logos')
    .getPublicUrl(path)

  const url = `${publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from('clinics')
    .update({ logo_url: publicUrl })
    .eq('id', profile.clinic_id)

  if (dbErr) return { error: 'Erro ao salvar URL da logo: ' + mensagemErro(dbErr, 'lib/actions/clinic-settings.ts') }

  revalidatePath('/dashboard', 'layout')
  return { url }
}

// ─── Voice Triggers ───────────────────────────────────────────────────────────


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

  if (error) return { error: mensagemErro(error, 'lib/actions/clinic-settings.ts') }
  revalidatePath('/dashboard/grooming')
  revalidatePath('/dashboard/vet', 'layout')
  revalidatePath('/dashboard/hospitalization', 'layout')
  revalidatePath('/dashboard/triage', 'layout')
  revalidatePath('/dashboard/exams', 'layout')
  return { success: true }
}

// ─── Clinic Settings (tabela clinic_settings — 0055+) ────────────────────────


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

  if (error) return { error: mensagemErro(error, 'lib/actions/clinic-settings.ts') }

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

  if (error) return { error: mensagemErro(error, 'lib/actions/clinic-settings.ts') }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Remove Logo ──────────────────────────────────────────────────────────────

// ─── Registration Settings (verify_cpf_cnpj / verify_cep) ───────────────────


export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { verify_cpf_cnpj: false, verify_cep: false }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { verify_cpf_cnpj: false, verify_cep: false }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics').select('flow_config').eq('id', profile.clinic_id).single()

  const flow = (data?.flow_config ?? {}) as FlowConfig
  return {
    verify_cpf_cnpj: flow.verify_cpf_cnpj ?? false,
    verify_cep:      flow.verify_cep      ?? false,
  }
}

// ─── Layout Version (SysMax only) ────────────────────────────────────────────


/**
 * Altera a versão de layout da clínica atual.
 * Restrito a usuários com is_sysmax = true (verificado server-side).
 */
export async function updateLayoutVersion(
  version: LayoutVersion
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id)      return { error: 'Clínica não encontrada.' }
  if (!profile.is_sysmax)       return { error: 'Apenas o usuário SysMax pode alterar o layout.' }
  if (!['classic', 'modern'].includes(version)) return { error: 'Versão de layout inválida.' }

  const { error } = await admin
    .from('clinics')
    .update({ layout_version: version })
    .eq('id', profile.clinic_id)

  if (error) return { error: 'Falha ao salvar layout: ' + mensagemErro(error, 'lib/actions/clinic-settings.ts') }

  revalidatePath('/dashboard', 'layout')
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
