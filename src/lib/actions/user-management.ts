'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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
