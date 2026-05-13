'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ClinicProfessional {
  id: string
  full_name: string
  role: string
  specialties: string[] | null
  crmv: string | null
  phone: string | null
}

export async function checkProfessionalAvailability(
  professionalId: string,
  date: string,   // yyyy-MM-dd
  time: string,   // HH:mm
): Promise<{ available: boolean; reason?: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // Busca slots do profissional para a data
  const { data: slots, error } = await supabase
    .from('professional_schedules')
    .select('start_time, end_time, available')
    .eq('professional_id', professionalId)
    .eq('date', date)

  if (error) return { error: error.message }

  // Sem slots cadastrados = sem restrição configurada, considerar disponível
  if (!slots || slots.length === 0) return { available: true }

  const hasAvailableSlot = slots.some(s => {
    if (!s.available) return false
    return s.start_time <= time && s.end_time > time
  })

  return hasAvailableSlot
    ? { available: true }
    : { available: false, reason: 'Profissional sem horário disponível neste período.' }
}

export async function getClinicProfessionals(): Promise<ClinicProfessional[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // Busca o clinic_id do usuário logado
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  // Admin client ignora RLS — necessário para listar colegas da mesma clínica
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role, specialties, crmv, phone')
    .eq('clinic_id', profile.clinic_id)
    .in('role', ['vet', 'assistant', 'groomer', 'admin'])
    .eq('is_sysmax', false)
    .neq('is_active', false)   // inclui NULL e true
    .order('full_name')

  if (error) return { error: error.message }
  return (data ?? []) as ClinicProfessional[]
}
