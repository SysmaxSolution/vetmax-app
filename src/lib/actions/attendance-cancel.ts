'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AttendanceEntity = 'triage' | 'consultation' | 'exam'

const TABLE_BY_ENTITY: Record<AttendanceEntity, string> = {
  triage:       'triage_records',
  consultation: 'consultations',
  exam:         'exam_requests',
}

const REVALIDATE_BY_ENTITY: Record<AttendanceEntity, string[]> = {
  triage:       ['/dashboard/triage'],
  consultation: ['/dashboard/vet', '/dashboard/reception'],
  exam:         ['/dashboard/exams'],
}

/**
 * Cancela um atendimento (triagem, consulta ou exame). Motivo obrigatório.
 * O card some da fila ativa porque os queries filtram status != 'cancelled'.
 */
export async function cancelAttendance(input: {
  entity: AttendanceEntity
  id:     string
  reason: string
}): Promise<{ success: true } | { error: string }> {
  const reason = (input.reason ?? '').trim()
  if (!reason)            return { error: 'Motivo obrigatório.' }
  if (reason.length < 3)  return { error: 'Motivo muito curto (mínimo 3 caracteres).' }
  if (reason.length > 500) return { error: 'Motivo muito longo (máximo 500 caracteres).' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const table = TABLE_BY_ENTITY[input.entity]
  if (!table) return { error: 'Entidade inválida.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from(table)
    .update({
      status:              'cancelled',
      cancellation_reason: reason,
      cancelled_at:        new Date().toISOString(),
      cancelled_by:        user.id,
    })
    .eq('id', input.id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }

  for (const path of REVALIDATE_BY_ENTITY[input.entity]) {
    revalidatePath(path)
  }
  return { success: true }
}
