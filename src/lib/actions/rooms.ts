'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type RoomType = 'consultation' | 'surgery' | 'grooming' | 'exam' | 'hospitalization'
export type RoomOperationalStatus = 'active' | 'maintenance'

export interface Room {
  id: string
  clinic_id: string
  name: string
  type: RoomType
  capacity: number
  active: boolean
  daily_rate: number
  operational_status: RoomOperationalStatus
  created_at: string
  updated_at: string
}

export async function getRooms(): Promise<Room[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data, error } = await supabase
    .from('rooms')
    .select('id, clinic_id, name, type, capacity, active, daily_rate, operational_status, created_at, updated_at')
    .order('name')

  if (error) return { error: error.message }
  return (data ?? []).map((r): Room => ({
    ...(r as Room),
    daily_rate:         Number((r as { daily_rate?: number }).daily_rate ?? 0),
    operational_status: ((r as { operational_status?: RoomOperationalStatus }).operational_status ?? 'active'),
  }))
}

export async function createRoom(
  name: string,
  type: RoomType,
  capacity: number = 1,
  extra?: { daily_rate?: number; operational_status?: RoomOperationalStatus }
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem criar salas/boxes.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rooms')
    .insert({
      clinic_id: profile.clinic_id, name: name.trim(), type, capacity,
      daily_rate:         extra?.daily_rate && extra.daily_rate > 0 ? extra.daily_rate : 0,
      operational_status: extra?.operational_status ?? 'active',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  revalidatePath('/dashboard/management')
  return { id: data.id }
}

export async function updateRoom(
  id: string,
  updates: { name?: string; type?: RoomType; capacity?: number; active?: boolean; daily_rate?: number; operational_status?: RoomOperationalStatus }
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
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem editar salas.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('rooms')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  revalidatePath('/dashboard/management')
  return { success: true }
}

export async function toggleRoomActive(
  id: string,
  active: boolean
): Promise<{ success: true } | { error: string }> {
  return updateRoom(id, { active })
}
