'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ClinicUserFull {
  id:                          string
  full_name:                   string
  last_name:                   string | null
  role:                        string
  crmv:                        string | null
  phone:                       string | null
  specialties:                 string[] | null
  nickname:                    string | null
  photo_url:                   string | null
  address:                     string | null
  is_active:                   boolean | null
  room:                        string | null
  electronic_signature_url:    string | null
  appointment_interval_minutes: number | null
}

export interface AdminUpdateUserPayload {
  userId:                       string
  full_name?:                   string
  last_name?:                   string | null
  role?:                        string
  crmv?:                        string | null
  phone?:                       string | null
  specialties?:                 string[]
  nickname?:                    string | null
  address?:                     string | null
  is_active?:                   boolean
  room?:                        string | null
  photo_url?:                   string | null
  electronic_signature_url?:    string | null
  appointment_interval_minutes?: number | null
}

// ─── Admin: atualizar perfil completo de qualquer usuário ─────────────────────

export async function adminUpdateUser(
  payload: AdminUpdateUserPayload
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id)    return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem editar usuários.' }

  const { userId, ...fields } = payload
  const patch: Record<string, unknown> = {}
  if (fields.full_name  !== undefined) patch.full_name  = fields.full_name?.trim() || null
  if (fields.last_name  !== undefined) patch.last_name  = fields.last_name?.trim() || null
  if (fields.role       !== undefined) patch.role       = fields.role
  if (fields.crmv       !== undefined) patch.crmv       = fields.crmv?.trim().toUpperCase() || null
  if (fields.phone      !== undefined) patch.phone      = fields.phone?.trim() || null
  if (fields.specialties !== undefined) patch.specialties = fields.specialties
  if (fields.nickname   !== undefined) patch.nickname   = fields.nickname?.trim() || null
  if (fields.address    !== undefined) patch.address    = fields.address?.trim() || null
  if (fields.is_active  !== undefined) patch.is_active  = fields.is_active
  if (fields.room       !== undefined) patch.room       = fields.room?.trim() || null
  if ('photo_url' in fields)                    patch.photo_url                    = fields.photo_url
  if ('electronic_signature_url' in fields)    patch.electronic_signature_url    = fields.electronic_signature_url
  if ('appointment_interval_minutes' in fields) patch.appointment_interval_minutes = fields.appointment_interval_minutes

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

// ─── Admin: trocar senha de qualquer usuário da clínica ──────────────────────

export async function adminChangePassword(
  targetUserId: string,
  newPassword:  string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id)    return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem trocar senhas.' }
  if (newPassword.length < 6)   return { error: 'A senha deve ter no mínimo 6 caracteres.' }

  // Confirma que o usuário-alvo pertence a mesma clínica
  const admin = createAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', targetUserId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!targetProfile) return { error: 'Usuário não encontrado nesta clínica.' }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Upload de assinatura eletrônica ─────────────────────────────────────────

export async function uploadUserSignature(
  userId:   string,
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
  if (profile.role !== 'admin' && user.id !== userId) return { error: 'Sem permissão.' }

  const file = formData.get('signature') as File | null
  if (!file) return { error: 'Nenhum arquivo enviado.' }
  if (file.size > 2 * 1024 * 1024) return { error: 'Arquivo muito grande (máx 2MB).' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `${profile.clinic_id}/${userId}/signature.${ext}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('user-signatures')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) return { error: upErr.message }

  const { data: { publicUrl } } = admin.storage.from('user-signatures').getPublicUrl(path)

  await admin.from('profiles').update({ electronic_signature_url: publicUrl }).eq('id', userId)
  revalidatePath('/dashboard/management')
  return { url: publicUrl }
}

// ─── RBAC por Módulo (G-08) ───────────────────────────────────────────────────

export type UserModuleAccessRow = {
  module_name: string
  enabled:     boolean
}

export async function getUserModuleAccess(
  targetUserId: string
): Promise<UserModuleAccessRow[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_module_access')
    .select('module_name, enabled')
    .eq('clinic_id', profile.clinic_id)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }
  return (data ?? []) as UserModuleAccessRow[]
}

export async function setUserModuleAccess(
  targetUserId: string,
  moduleName:   string,
  enabled:      boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id)  return { error: 'Perfil sem clínica.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem configurar o acesso a módulos.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_module_access')
    .upsert(
      { clinic_id: profile.clinic_id, user_id: targetUserId, module_name: moduleName, enabled },
      { onConflict: 'clinic_id,user_id,module_name' }
    )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

export async function updateUserPhone(
  userId: string,
  phone: string
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
  if (profile.role !== 'admin' && user.id !== userId) {
    return { error: 'Sem permissão para editar este perfil.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ phone: phone.trim() || null })
    .eq('id', userId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

export async function updateUserSpecialties(
  userId: string,
  specialties: string[]
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
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem editar especialidades.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ specialties })
    .eq('id', userId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}

export async function updateOwnProfile(data: {
  full_name?: string
  nickname?:  string
  phone?:     string
  crmv?:      string
  specialties?: string[]
  photo_url?: string | null
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const patch: Record<string, unknown> = {}
  if (data.full_name   !== undefined) patch.full_name   = data.full_name.trim() || null
  if (data.nickname    !== undefined) patch.nickname    = data.nickname.trim()  || null
  if (data.phone       !== undefined) patch.phone       = data.phone.trim()     || null
  if (data.crmv        !== undefined) patch.crmv        = data.crmv.trim().toUpperCase() || null
  if (data.specialties !== undefined) patch.specialties = data.specialties
  if ('photo_url' in data)            patch.photo_url   = data.photo_url

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateUserNickname(
  userId: string,
  nickname: string
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
  if (profile.role !== 'admin' && user.id !== userId) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ nickname: nickname.trim() || null })
    .eq('id', userId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { success: true }
}
