'use server'

/**
 * Acompanhamento — fluxo express (M2, Sprint Almavet 2026-06-21).
 *
 * Atendimento resumido: prontuário (por voz) + sinais vitais, finalizado com
 * duas opções:
 *  - 'alta'     → encerra (status='completed'). NÃO cai no caixa (sem serviço/
 *                 fatura); fica registrado no histórico/feed do pet.
 *  - 'consulta' → converte em consulta normal (visit_reason='consultation',
 *                 status='in_progress') já com o prontuário/sinais preenchidos.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

export interface SaveFollowUpInput {
  consultation_id: string
  vet_notes?:      string | null
  vital_signs?:    Record<string, unknown> | null
  mode:            'alta' | 'consulta'
}

export async function saveFollowUp(
  input: SaveFollowUpInput,
): Promise<{ success: true; mode: 'alta' | 'consulta' } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const clinic_id = profile.clinic_id as string

  if (!input.consultation_id) return { error: 'consultation_id obrigatório.' }

  const { data: consult } = await admin
    .from('consultations')
    .select('id, clinic_id, patient_id, visit_reason, status')
    .eq('id', input.consultation_id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!consult)                        return { error: 'Atendimento não encontrado.' }
  if (consult.visit_reason !== 'acompanhamento') return { error: 'Este atendimento não é de acompanhamento.' }
  if (consult.status === 'completed')  return { error: 'Este atendimento já foi finalizado.' }
  if (consult.status === 'cancelled')  return { error: 'Este atendimento foi cancelado.' }

  const payload: Record<string, unknown> = {
    vet_notes:   input.vet_notes ?? null,
    vet_id:      user.id,
    updated_at:  new Date().toISOString(),
  }
  if (input.vital_signs) payload.vital_signs = input.vital_signs

  if (input.mode === 'alta') {
    payload.status             = 'completed'
    payload.is_reviewed_by_vet = true
  } else {
    payload.status        = 'in_progress'
    payload.visit_reason  = 'consultation'
  }

  const { error } = await admin
    .from('consultations')
    .update(payload)
    .eq('id', consult.id)
    .eq('clinic_id', clinic_id)
  if (error) return { error: 'Erro ao salvar acompanhamento: ' + error.message }

  await logAudit({
    action:      input.mode === 'alta' ? 'FOLLOWUP_DISCHARGE' : 'FOLLOWUP_TO_CONSULTATION',
    entity_type: 'consultations',
    entity_id:   consult.id,
    details:     { patient_id: consult.patient_id, mode: input.mode },
  })

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  revalidatePath(`/dashboard/vet/${consult.id}`)
  revalidatePath(`/dashboard/patients/${consult.patient_id}`)

  return { success: true, mode: input.mode }
}
