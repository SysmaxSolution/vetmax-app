'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UserPermission {
  module:  string
  action:  'view' | 'create' | 'edit' | 'delete'
  allowed: boolean
}

// ─── listUserPermissions ───────────────────────────────────────────────────────

/**
 * Lista as permissões granulares de um usuário da clínica.
 * Requer role=admin no chamador.
 */
export async function listUserPermissions(
  userId: string
): Promise<UserPermission[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem visualizar permissões.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_permissions_granular')
    .select('module, action, allowed')
    .eq('clinic_id', profile.clinic_id)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  return (data ?? []) as UserPermission[]
}

// ─── upsertUserPermissions ────────────────────────────────────────────────────

/**
 * Salva em lote as permissões granulares de um usuário (upsert).
 * Requer role=admin no chamador.
 */
export async function upsertUserPermissions(
  userId:      string,
  permissions: { module: string; action: string; allowed: boolean }[]
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
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar permissões.' }

  // Garante que o usuário-alvo pertence à mesma clínica
  const admin = createAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!targetProfile) return { error: 'Usuário não encontrado nesta clínica.' }

  const rows = permissions.map(p => ({
    clinic_id:  profile.clinic_id,
    user_id:    userId,
    module:     p.module,
    action:     p.action,
    allowed:    p.allowed,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) return { success: true }

  const { error } = await admin
    .from('user_permissions_granular')
    .upsert(rows, { onConflict: 'clinic_id,user_id,module,action' })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── checkPermission ──────────────────────────────────────────────────────────

/**
 * Verifica se o usuário atual tem permissão específica.
 * Admin sempre retorna true (bypass total).
 * Usa somente o cliente autenticado (sem DB extra no middleware).
 */
export async function checkPermission(
  userId: string,
  module: string,
  action: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== userId) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return false

  // Admin bypass total
  if (profile.role === 'admin') return true

  const { data } = await supabase
    .from('user_permissions_granular')
    .select('allowed')
    .eq('clinic_id', profile.clinic_id)
    .eq('user_id', userId)
    .eq('module', module)
    .eq('action', action)
    .single()

  // Se não há registro explícito, nega por padrão (exceto admin)
  return data?.allowed === true
}
