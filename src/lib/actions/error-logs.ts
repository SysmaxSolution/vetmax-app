'use server'

import { createClient } from '@/lib/supabase/server'

export interface ErrorLogEntry {
  path: string
  error_message: string
  stack_trace?: string
  user_journey?: { path: string; timestamp: string }[]
  severity?: 'error' | 'warning' | 'critical'
}

export async function logClientError(entry: ErrorLogEntry): Promise<{ success: true } | { error: string }> {
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

    const { error } = await supabase
      .from('error_logs')
      .insert({
        clinic_id:     profile.clinic_id,
        user_id:       user.id,
        path:          entry.path,
        error_message: entry.error_message,
        stack_trace:   entry.stack_trace ?? null,
        user_journey:  entry.user_journey ?? [],
        severity:      entry.severity ?? 'error',
      })

    if (error) return { error: 'Erro ao registrar log: ' + error.message }
    return { success: true }
  } catch {
    return { error: 'Erro inesperado ao registrar log.' }
  }
}

export async function getUnresolvedErrors(): Promise<
  { id: string; path: string; error_message: string; severity: string; created_at: string }[] | { error: string }
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
    .select('id, path, error_message, severity, created_at')
    .eq('clinic_id', profile.clinic_id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { error: 'Erro ao buscar logs: ' + error.message }
  return data ?? []
}
