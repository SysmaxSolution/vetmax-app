'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SYSMAX_EMAIL = 'sysmax@sysmaxsolutions.com'

export type ClinicStatus = 'pending' | 'active' | 'suspended'

export async function updateClinicStatus(
  clinicId: string,
  status: ClinicStatus
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida.' }

  if (user.email?.toLowerCase() !== SYSMAX_EMAIL) {
    return { error: 'Apenas o suporte SysMax pode alterar o status da clínica.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinics')
    .update({ status })
    .eq('id', clinicId)

  if (error) return { error: 'Erro ao atualizar status: ' + error.message }
  return {}
}
