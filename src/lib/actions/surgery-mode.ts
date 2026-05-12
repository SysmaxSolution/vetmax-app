'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function setSurgeryMode(
  isInSurgery: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_in_surgery: isInSurgery })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function resolveUrgencyEscalation(
  logId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('urgency_escalation_logs')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', logId)
    .is('resolved_at', null)

  if (error) return { error: error.message }
  return { success: true }
}
