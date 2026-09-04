'use server'

// Configuração de integrações financeiras por clínica (Gestão > Config > Financeiro).
// Toggles + credenciais por banco e PIX. Tudo o que depende de integração é gated
// por estes flags. Segredos em JSONB (recomendação: cifrar no futuro).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface BankIntegration {
  bank_code:   string   // '756' Sicoob, '341' Itaú…
  provider:    string   // 'sicoob'
  environment: 'sandbox' | 'production'
  client_id:   string
  agencia:     string
  conta:       string
}
export interface PixIntegration {
  enabled:       boolean
  provider:      string   // 'sicoob'
  environment:   'sandbox' | 'production'
  client_id:     string
  client_secret: string
  token:         string
  pix_key:       string   // chave PIX estática (recebimento estático)
}
export interface FinancialIntegrations {
  bank_enabled: boolean
  banks:        BankIntegration[]
  pix_enabled:  boolean
  pix:          PixIntegration
}

const PIX_DEFAULT: PixIntegration = { enabled: false, provider: 'sicoob', environment: 'sandbox', client_id: '', client_secret: '', token: '', pix_key: '' }
const DEFAULTS: FinancialIntegrations = { bank_enabled: false, banks: [], pix_enabled: false, pix: PIX_DEFAULT }

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return null
  return { clinicId: profile.clinic_id as string, role: profile.role as string }
}

export async function getFinancialIntegrations(): Promise<FinancialIntegrations> {
  const c = await ctx()
  if (!c) return DEFAULTS
  const admin = createAdminClient()
  const { data } = await admin.from('clinic_bank_integrations')
    .select('bank_enabled, banks, pix_enabled, pix').eq('clinic_id', c.clinicId).maybeSingle()
  if (!data) return DEFAULTS
  return {
    bank_enabled: !!data.bank_enabled,
    banks: Array.isArray(data.banks) ? (data.banks as BankIntegration[]) : [],
    pix_enabled: !!data.pix_enabled,
    pix: { ...PIX_DEFAULT, ...((data.pix as Partial<PixIntegration>) ?? {}), enabled: !!data.pix_enabled },
  }
}

export async function updateFinancialIntegrations(payload: FinancialIntegrations): Promise<{ success: true } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (c.role !== 'admin') return { error: 'Apenas administradores podem alterar integrações.' }
  const admin = createAdminClient()
  const { error } = await admin.from('clinic_bank_integrations').upsert({
    clinic_id: c.clinicId,
    bank_enabled: payload.bank_enabled,
    banks: payload.banks ?? [],
    pix_enabled: payload.pix_enabled,
    pix: payload.pix ?? PIX_DEFAULT,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id' })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/cashier')
  return { success: true }
}

// Gates leves p/ a UI (sem expor credenciais).
export async function isBankIntegrationEnabled(): Promise<boolean> {
  const cfg = await getFinancialIntegrations()
  return cfg.bank_enabled && cfg.banks.length > 0
}
export async function isPixIntegrationEnabled(): Promise<boolean> {
  const cfg = await getFinancialIntegrations()
  return cfg.pix_enabled
}
