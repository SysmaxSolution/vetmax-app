'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { AccessAction } from '@/config/access-catalog'

// ──────────────────────────────────────────────────────────────────────────────
// Direitos de Acesso (Module → Tab → Action)
//
// Persistência em user_permissions_granular: (clinic_id, user_id, module, action, allowed)
//   `module` armazena "moduleKey" OU "moduleKey.tabKey"
//   `action` é uma das AccessAction (view, create, edit, delete, export, approve)
// ──────────────────────────────────────────────────────────────────────────────

export interface GranularPermissionRow {
  module: string           // ex: "purchases" ou "purchases.suppliers"
  action: AccessAction
  allowed: boolean
}

async function getCallerContext(): Promise<
  | { clinic_id: string; role: string; user_id: string }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  return { clinic_id: profile.clinic_id, role: profile.role, user_id: user.id }
}

// ─── Admin: listar todas as permissões granulares de um usuário ─────────────

export async function getUserAccessRights(
  targetUserId: string
): Promise<GranularPermissionRow[] | { error: string }> {
  const ctx = await getCallerContext()
  if ('error' in ctx) return ctx
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem visualizar direitos de acesso.' }

  const admin = createAdminClient()
  // Garante que o usuário-alvo pertence à mesma clínica
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', targetUserId)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!targetProfile) return { error: 'Usuário não encontrado nesta clínica.' }

  const { data, error } = await admin
    .from('user_permissions_granular')
    .select('module, action, allowed')
    .eq('clinic_id', ctx.clinic_id)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }
  return (data ?? []) as GranularPermissionRow[]
}

// ─── Admin: salvar/togglar uma permissão granular específica ────────────────

export async function setUserAccessRight(payload: {
  targetUserId: string
  module:       string                // "moduleKey" ou "moduleKey.tabKey"
  action:       AccessAction
  allowed:      boolean
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getCallerContext()
  if ('error' in ctx) return ctx
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem alterar direitos de acesso.' }
  if (payload.targetUserId === ctx.user_id) {
    return { error: 'Você não pode alterar seus próprios direitos de acesso.' }
  }

  const admin = createAdminClient()

  // Confirma que o alvo pertence à clínica
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', payload.targetUserId)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!targetProfile) return { error: 'Usuário não encontrado nesta clínica.' }

  const { error } = await admin
    .from('user_permissions_granular')
    .upsert(
      {
        clinic_id: ctx.clinic_id,
        user_id:   payload.targetUserId,
        module:    payload.module,
        action:    payload.action,
        allowed:   payload.allowed,
      },
      { onConflict: 'clinic_id,user_id,module,action' }
    )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Admin: aplicar várias permissões em lote (atalho do modal "Liberar todos") ─

export async function setUserAccessRightsBulk(
  targetUserId: string,
  rows: GranularPermissionRow[],
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCallerContext()
  if ('error' in ctx) return ctx
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem alterar direitos de acesso.' }
  if (targetUserId === ctx.user_id) {
    return { error: 'Você não pode alterar seus próprios direitos de acesso.' }
  }

  const admin = createAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', targetUserId)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!targetProfile) return { error: 'Usuário não encontrado nesta clínica.' }

  if (rows.length === 0) return { success: true }

  const payload = rows.map(r => ({
    clinic_id: ctx.clinic_id,
    user_id:   targetUserId,
    module:    r.module,
    action:    r.action,
    allowed:   r.allowed,
  }))

  const { error } = await admin
    .from('user_permissions_granular')
    .upsert(payload, { onConflict: 'clinic_id,user_id,module,action' })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Caller-side: checar uma permissão granular ──────────────────────────────
// Use em Server Components/Actions para fechar telas/botões.
// `module` aceita "moduleKey" simples ou "moduleKey.tabKey".

export async function hasAccessRight(
  module: string,
  action: AccessAction,
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return false

  // Admin: bypass total
  if (profile.role === 'admin') return true

  const { data } = await supabase
    .from('user_permissions_granular')
    .select('allowed')
    .eq('clinic_id', profile.clinic_id)
    .eq('user_id', user.id)
    .eq('module', module)
    .eq('action', action)
    .maybeSingle()

  // Default permissivo: se NÃO existe row → permitido. Admin precisa marcar
  // EXPLICITAMENTE allowed=false para bloquear. Evita quebrar usuários
  // existentes ao habilitar a feature.
  return data?.allowed !== false
}
