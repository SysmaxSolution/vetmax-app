'use server'

import { createClient } from '@/lib/supabase/server'

export interface ClinicProfessional {
  id: string
  full_name: string
  role: string
  specialties: string[] | null
  crmv: string | null
}

export async function getClinicProfessionals(): Promise<ClinicProfessional[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, specialties, crmv')
    .in('role', ['vet', 'assistant'])
    .order('full_name')

  if (error) return { error: error.message }
  return (data ?? []) as ClinicProfessional[]
}
