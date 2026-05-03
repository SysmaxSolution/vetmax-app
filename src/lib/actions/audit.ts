'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function logAudit(data: {
  action: string
  entity_type: string
  entity_id: string
  details?: Record<string, any>
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return

    // Usamos o admin client para ignorar o RLS e garantir que o log seja gravado
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      clinic_id:   profile.clinic_id,
      user_id:     user.id,
      action:      data.action,
      entity_type: data.entity_type,
      entity_id:   data.entity_id,
      details:     data.details ?? {},
    })
  } catch (error) {
    // Se a auditoria falhar por instabilidade de rede, logamos no console
    // mas não quebramos a ação principal (ex: dar alta) do utilizador.
    console.error('Falha crítica ao gravar Audit Log:', error)
  }
}