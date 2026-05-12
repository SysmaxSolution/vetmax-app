'use server'

import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ErrorSource, ErrorPriority } from '@/lib/error-logger'

export interface ErrorLogEntry {
  path: string
  error_message: string
  stack_trace?: string
  user_journey?: { path: string; timestamp: string }[]
  severity?: 'error' | 'warning' | 'critical'
  /** Módulo funcional onde o erro ocorreu */
  module?: string
}

function computeFingerprint(path: string, message: string): string {
  return createHash('sha256')
    .update(`${path.slice(0, 200)}:${message.slice(0, 500)}`)
    .digest('hex')
    .slice(0, 20)
}

/** Captura erros do lado do cliente (React components autenticados). */
export async function logClientError(
  entry: ErrorLogEntry
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    const fingerprint = computeFingerprint(entry.path, entry.error_message)
    const admin = createAdminClient()

    // Dedup: incrementa occurrence_count se mesmo fingerprint já existe
    const { data: existing } = await admin
      .from('error_logs')
      .select('id, occurrence_count')
      .eq('fingerprint', fingerprint)
      .eq('clinic_id', profile.clinic_id)
      .eq('resolved', false)
      .maybeSingle()

    if (existing) {
      await admin
        .from('error_logs')
        .update({ occurrence_count: existing.occurrence_count + 1 })
        .eq('id', existing.id)
      return { success: true }
    }

    const { error } = await admin
      .from('error_logs')
      .insert({
        clinic_id:        profile.clinic_id,
        user_id:          user.id,
        path:             entry.path,
        error_message:    entry.error_message,
        stack_trace:      entry.stack_trace   ?? null,
        user_journey:     entry.user_journey  ?? [],
        severity:         entry.severity      ?? 'error',
        source:           'client' satisfies ErrorSource,
        module:           entry.module        ?? null,
        fingerprint,
        occurrence_count: 1,
        resolved:         false,
      })

    if (error) return { error: 'Erro ao registrar log: ' + error.message }
    return { success: true }
  } catch {
    return { error: 'Erro inesperado ao registrar log.' }
  }
}

/** Retorna erros não resolvidos da clínica do usuário autenticado. */
export async function getUnresolvedErrors(): Promise<
  {
    id: string
    path: string
    error_message: string
    severity: string
    priority: string | null
    module: string | null
    source: string
    occurrence_count: number
    created_at: string
  }[] | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('error_logs')
    .select('id, path, error_message, severity, priority, module, source, occurrence_count, created_at')
    .eq('clinic_id', profile.clinic_id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { error: 'Erro ao buscar logs: ' + error.message }
  return data ?? []
}

/** Server Action para marcar um erro como resolvido. */
export async function resolveError(
  errorId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
    if (!['admin', 'manager'].includes(profile.role)) return { error: 'Sem permissão.' }

    const { error } = await supabase
      .from('error_logs')
      .update({ resolved: true })
      .eq('id', errorId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: 'Erro ao resolver: ' + error.message }
    return { success: true }
  } catch {
    return { error: 'Erro inesperado.' }
  }
}

/** Busca os planos de correção (admin/manager). Aceita um ou múltiplos status. */
export async function getFixPlans(statusFilter?: string | string[]): Promise<
  {
    id: string
    title: string
    priority: ErrorPriority
    status: string
    affected_modules: string[]
    error_summary: string | null
    description_md: string | null
    branch_name: string | null
    pr_url: string | null
    created_at: string
    approved_at: string | null
  }[] | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  let query = supabase
    .from('fix_plans')
    .select('id, title, priority, status, affected_modules, error_summary, description_md, branch_name, pr_url, created_at, approved_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.in('status', statusFilter)
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data, error } = await query
  if (error) return { error: 'Erro ao buscar planos: ' + error.message }
  return data ?? []
}

/** Aprova um plano de correção (só admin/manager). */
export async function approveFixPlan(
  planId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'manager'].includes(profile?.role)) return { error: 'Sem permissão.' }

    const { error } = await supabase
      .from('fix_plans')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', planId)
      .eq('status', 'pending_approval')

    if (error) return { error: 'Erro ao aprovar: ' + error.message }
    return { success: true }
  } catch {
    return { error: 'Erro inesperado.' }
  }
}

/** Rejeita um plano de correção (só admin/manager). */
export async function rejectFixPlan(
  planId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'manager'].includes(profile?.role)) return { error: 'Sem permissão.' }

    const { error } = await supabase
      .from('fix_plans')
      .update({ status: 'rejected' })
      .eq('id', planId)

    if (error) return { error: 'Erro ao rejeitar: ' + error.message }
    return { success: true }
  } catch {
    return { error: 'Erro inesperado.' }
  }
}
