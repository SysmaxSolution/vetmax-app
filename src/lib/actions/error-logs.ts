'use server'

import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ErrorSource, ErrorPriority } from '@/lib/error-logger'
import { runAutoFixCycle } from '@/lib/fix-planner'

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

/** Retorna erros não resolvidos.
 *  - is_sysmax=true → todos os erros de todas as clínicas (usa admin client, bypass RLS)
 *  - demais usuários  → somente erros da clínica logada
 */
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
    clinic_id:   string | null
    clinic_name: string | null
  }[] | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const isSysmax = profile.is_sysmax === true

  // Admin client bypassa a RLS clinic_isolation_error_logs
  let query = admin
    .from('error_logs')
    .select('id, path, error_message, severity, priority, module, source, occurrence_count, created_at, clinic_id, clinics(name)')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(isSysmax ? 500 : 100)

  if (!isSysmax) {
    query = query.eq('clinic_id', profile.clinic_id)
  }

  const { data, error } = await query
  if (error) return { error: 'Erro ao buscar logs: ' + error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id:               row.id,
    path:             row.path,
    error_message:    row.error_message,
    severity:         row.severity,
    priority:         row.priority,
    module:           row.module,
    source:           row.source,
    occurrence_count: row.occurrence_count,
    created_at:       row.created_at,
    clinic_id:        row.clinic_id   ?? null,
    clinic_name:      row.clinics?.name ?? null,
  }))
}

/** Server Action para marcar um erro como resolvido.
 *  is_sysmax pode resolver erros de qualquer clínica.
 */
export async function resolveError(
  errorId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('clinic_id, role, is_sysmax')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

    const isSysmax = profile.is_sysmax === true
    if (!isSysmax && !['admin', 'manager'].includes(profile.role)) {
      return { error: 'Sem permissão.' }
    }

    let query = admin
      .from('error_logs')
      .update({ resolved: true })
      .eq('id', errorId)

    if (!isSysmax) {
      query = query.eq('clinic_id', profile.clinic_id)
    }

    const { error } = await query
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

/** Força a geração de planos de correção para todos os erros elegíveis agora.
 *  Após criar cada plano, dispara automaticamente notificação via WhatsApp. */
export async function triggerFixPlanGeneration(): Promise<
  { created: number; skipped: number; failed: number } | { error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'manager'].includes(profile?.role ?? '')) return { error: 'Sem permissão.' }

    const result = await runAutoFixCycle({ maxClusters: 10, minOccurrences: 1 })
    return { created: result.created, skipped: result.skipped, failed: result.failed }
  } catch {
    return { error: 'Erro ao gerar planos.' }
  }
}
