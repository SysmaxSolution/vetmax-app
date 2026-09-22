'use server'

// Gestão dos agentes-ponte de laboratório. O admin gera um "código de pareamento"
// (token) que é colado na instalação do agente. O ambiente (DEV/prod) é escolhido
// no agente; o token vale só no ambiente onde foi gerado.

import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { admin: createAdminClient(), clinic_id: profile.clinic_id as string, user_id: user.id, role: (profile.role as string) ?? 'staff' }
}

export interface LabAgentRow {
  id: string; label: string | null; token: string; is_active: boolean
  last_seen_at: string | null; created_at: string
  last_env: string | null; pending_env: string | null; pending_set_at: string | null
}

export async function listLabAgents(): Promise<LabAgentRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Acesso negado' }
  const { data, error } = await ctx.admin
    .from('lab_agents').select('id, label, token, is_active, last_seen_at, created_at, last_env, pending_env, pending_set_at')
    .eq('clinic_id', ctx.clinic_id).order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return (data ?? []) as LabAgentRow[]
}

const ENV_URLS: Record<string, string> = {
  dev:  'https://sysvetmax-dev.vercel.app',
  prod: 'https://app.sysvetmaxsolutions.com',   // domínio real de produção
}

/**
 * Agenda a troca de ambiente/token do agente (promoção DEV→PROD ou repontamento).
 * O agente aplica no próximo ping (≤~30s), reescreve seu config e reinicia a
 * comunicação — sem AnyDesk, sem visita. `token` é o código de pareamento gerado
 * no AMBIENTE DE DESTINO (o token vale só no ambiente onde foi criado).
 */
export async function promoteLabAgent(
  id: string, environment: 'dev' | 'prod', token: string, url?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Acesso negado' }
  const t = (token ?? '').trim()
  if (!t.startsWith('lab_')) return { error: 'Cole o código de pareamento do ambiente de destino (começa com "lab_").' }
  if (!['dev', 'prod'].includes(environment)) return { error: 'Ambiente inválido.' }
  const baseUrl = (url?.trim()) || ENV_URLS[environment]
  const { error } = await ctx.admin.from('lab_agents').update({
    pending_env: environment, pending_url: baseUrl, pending_token: t, pending_set_at: new Date().toISOString(),
  }).eq('id', id).eq('clinic_id', ctx.clinic_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

/** Cancela uma promoção agendada ainda não entregue. */
export async function cancelLabAgentPromotion(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Acesso negado' }
  await ctx.admin.from('lab_agents').update({ pending_env: null, pending_url: null, pending_token: null, pending_set_at: null }).eq('id', id).eq('clinic_id', ctx.clinic_id)
  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function createLabAgentToken(label: string): Promise<LabAgentRow | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Acesso negado' }
  const token = 'lab_' + randomBytes(24).toString('hex')
  const { data, error } = await ctx.admin
    .from('lab_agents')
    .insert({ clinic_id: ctx.clinic_id, token, label: label?.trim() || 'Agente de laboratório', created_by: ctx.user_id })
    .select('id, label, token, is_active, last_seen_at, created_at')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return data as LabAgentRow
}

export async function setLabAgentActive(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Acesso negado' }
  const { error } = await ctx.admin.from('lab_agents').update({ is_active: active }).eq('id', id).eq('clinic_id', ctx.clinic_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}
