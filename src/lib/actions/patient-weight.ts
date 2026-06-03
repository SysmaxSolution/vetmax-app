'use server'

/**
 * Peso do pet — fonte de verdade unificada.
 *
 * `patients.last_known_weight` é alimentado por TODOS os pontos que medem
 * peso (recepção, triagem, consultório, internação, edição manual no
 * cadastro). A cada atualização, registra um evento em
 * `patient_petlove_history` (event_type='weight_update') para aparecer no
 * feed do pet.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type WeightSource = 'manual' | 'reception' | 'triage' | 'vet' | 'hospitalization'

type Ctx =
  | { admin: ReturnType<typeof createAdminClient>; clinic_id: string; user_id: string }
  | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id }
}

const SOURCE_LABEL: Record<WeightSource, string> = {
  manual:          'cadastro do pet',
  reception:       'recepção',
  triage:          'triagem',
  vet:             'consultório',
  hospitalization: 'internação',
}

/**
 * Atualiza patients.last_known_weight e registra evento no feed.
 * Idempotente: se o novo valor é (≈) igual ao último, NÃO cria evento — evita
 * spam no histórico quando o peso da triagem é re-confirmado na consulta.
 */
export async function updatePatientWeight(input: {
  patient_id: string
  weight_kg:  number
  source:     WeightSource
  notes?:     string | null
}): Promise<{ updated: boolean; changed: boolean } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  if (!input.patient_id) return { error: 'patient_id obrigatório.' }
  if (!Number.isFinite(input.weight_kg) || input.weight_kg <= 0) {
    return { error: 'Peso inválido (deve ser maior que zero).' }
  }
  if (input.weight_kg > 200) {
    return { error: 'Peso fora do intervalo plausível (>200 kg).' }
  }

  const weight = Number(input.weight_kg.toFixed(3))

  // Lê estado atual para decidir se grava evento
  const { data: current } = await admin
    .from('patients')
    .select('last_known_weight, last_known_weight_source')
    .eq('id', input.patient_id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!current) return { error: 'Pet não encontrado.' }

  const previous = current.last_known_weight === null
    ? null
    : Number(current.last_known_weight)
  const changed = previous === null || Math.abs(previous - weight) > 0.005

  const { error: updErr } = await admin
    .from('patients')
    .update({
      last_known_weight:        weight,
      last_known_weight_at:     new Date().toISOString(),
      last_known_weight_source: input.source,
    })
    .eq('id', input.patient_id)
    .eq('clinic_id', clinic_id)
  if (updErr) return { error: 'Erro ao atualizar peso: ' + updErr.message }

  if (changed) {
    const delta = previous === null
      ? `Peso inicial registrado: ${weight.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`
      : `Peso atualizado: ${previous.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg → ${weight.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`
    try {
      await admin.from('patient_petlove_history').insert({
        clinic_id,
        patient_id:  input.patient_id,
        event_type:  'weight_update',
        description: `${delta} (via ${SOURCE_LABEL[input.source]})`,
        metadata: {
          weight_kg:     weight,
          previous_kg:   previous,
          source:        input.source,
          recorded_by:   user_id,
          notes:         input.notes ?? null,
        },
      })
    } catch { /* audit best-effort */ }
  }

  revalidatePath(`/dashboard/patients/${input.patient_id}`)
  return { updated: true, changed }
}

/**
 * Retorna o último peso conhecido do pet (ou null). Usado para pré-preencher
 * inputs de peso em recepção/triagem/consultório/internação.
 */
export async function getLastWeight(
  patientId: string,
): Promise<{
  weight_kg:  number | null
  measured_at: string | null
  source:     WeightSource | null
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data, error } = await admin
    .from('patients')
    .select('last_known_weight, last_known_weight_at, last_known_weight_source')
    .eq('id', patientId)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { weight_kg: null, measured_at: null, source: null }

  return {
    weight_kg:   data.last_known_weight === null ? null : Number(data.last_known_weight),
    measured_at: data.last_known_weight_at,
    source:      data.last_known_weight_source as WeightSource | null,
  }
}
