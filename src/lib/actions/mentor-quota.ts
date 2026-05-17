'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verifica e consome 1 unidade da cota diária do Mentor IA.
 * Retorna TRUE = mensagem permitida | FALSE = cota diária esgotada.
 * Operação atômica via RPC (sem race condition).
 */
export async function checkMentorDailyQuota(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  // SysMax Support nunca consome cota
  if (profile?.is_sysmax === true) return true

  if (!profile?.clinic_id) return false

  const { data, error } = await admin.rpc('check_quota', {
    p_clinic_id: profile.clinic_id,
    p_resource:  'ai_mentor_daily',
  })

  if (error) {
    console.error('[checkMentorDailyQuota]', error.message)
    return false // fail-closed
  }

  return data === true
}
