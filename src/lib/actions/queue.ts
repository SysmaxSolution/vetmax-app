'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type QueueModule = 'triage' | 'vet' | 'exams'

interface RemoveFromQueueParams {
  consultationId: string
  patientId:      string
  patientName:    string
  module:         QueueModule
  reason:         string
}

export async function removeFromQueue(
  params: RemoveFromQueueParams
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem remover da fila.' }

  const admin = createAdminClient()

  const { error: updateErr } = await admin
    .from('consultations')
    .update({ status: 'cancelled' })
    .eq('id', params.consultationId)
    .eq('clinic_id', profile.clinic_id)

  if (updateErr) return { error: 'Erro ao cancelar consulta: ' + updateErr.message }

  const { error: logErr } = await admin
    .from('module_removal_logs')
    .insert({
      clinic_id:    profile.clinic_id,
      removed_by:   user.id,
      patient_id:   params.patientId,
      patient_name: params.patientName,
      module:       params.module,
      reference_id: params.consultationId,
      reason:       params.reason,
    })

  if (logErr) return { error: 'Consulta cancelada, mas erro no log: ' + logErr.message }

  revalidatePath('/dashboard/triage')
  revalidatePath('/dashboard/vet')
  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/reception')

  return { success: true }
}
