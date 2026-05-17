'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verifica E consome 1 unidade de cota (operação atômica no banco).
 * Retorna TRUE = operação liberada | FALSE = limite atingido (paywall).
 *
 * Uso antes de enviar mensagem WhatsApp:
 *   if (!await checkQuota(clinicId, 'whatsapp_messages')) {
 *     return { error: 'Limite de mensagens do plano atingido.' }
 *   }
 */
export async function checkQuota(clinicId: string, resource: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('check_quota', {
    p_clinic_id: clinicId,
    p_resource:  resource,
  })
  if (error) {
    console.error('[checkQuota] rpc error:', error.message)
    return false // fail-closed: bloqueia em caso de erro para proteger o sistema
  }
  return data === true
}

/**
 * Retorna o status de todas as cotas da clínica.
 * Use para exibir indicadores de uso na UI (ex: "87/100 mensagens usadas").
 */
export async function getQuotas(clinicId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_quotas')
    .select('resource_name, limit_amount, used_amount, reset_date')
    .eq('clinic_id', clinicId)
  return data ?? []
}

/**
 * Retorna os feature flags do tenant.
 * Fail-safe: retorna tudo FALSE se não encontrar registro (plano Free implícito).
 */
export async function getFeatureFlags(clinicId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_feature_flags')
    .select('has_advanced_finance, has_smart_packages, has_tef_integration, has_document_templates')
    .eq('clinic_id', clinicId)
    .single()
  return data ?? {
    has_advanced_finance:   false,
    has_smart_packages:     false,
    has_tef_integration:    false,
    has_document_templates: false,
  }
}

/**
 * Retorna o plano ativo do tenant.
 * Fail-safe: retorna 'free' se não encontrar registro.
 */
export async function getPlan(clinicId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_subscriptions')
    .select('plan_name, status, custom_price, trial_ends_at, current_period_end')
    .eq('clinic_id', clinicId)
    .single()
  return data ?? { plan_name: 'free' as const, status: 'active' as const, custom_price: null, trial_ends_at: null, current_period_end: null }
}
