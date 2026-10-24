'use server'

// Internação → Centro Cirúrgico.
//
// O pet internado que precisa operar não "sai" da internação: a cirurgia
// nasce já ligada a ela (postop_hospitalization_id), para que o fim da
// cirurgia o devolva ao MESMO leito e à MESMA conta — `sendSurgeryToInternacao`
// reaproveita essa ligação em vez de abrir internação nova.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import { logAudit } from './audit'

async function getCtx(): Promise<{ clinicId: string; userId: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id as string, userId: user.id, role: String(profile.role ?? '') }
}

export async function sendHospitalizationToSurgery(
  hospitalizationId: string,
  input: { procedure_name: string; service_id?: string | null; asa_risk?: string | null },
): Promise<{ surgery_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager', 'vet'].includes(ctx.role)) return { error: 'Só o médico-veterinário pode encaminhar ao centro cirúrgico.' }

  const procedimento = input.procedure_name?.trim()
  if (!procedimento) return { error: 'Informe o procedimento.' }

  const admin = createAdminClient()
  const { data: hosp } = await admin.from('hospitalizations')
    .select('id, patient_id, consultation_id, status')
    .eq('id', hospitalizationId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!hosp) return { error: 'Internação não encontrada.' }
  if (hosp.status === 'discharged') return { error: 'Esta internação já foi encerrada.' }

  // Uma cirurgia por vez para o mesmo pet internado.
  const { data: aberta } = await admin.from('surgeries').select('id, procedure_name')
    .eq('clinic_id', ctx.clinicId).eq('postop_hospitalization_id', hospitalizationId)
    .in('status', ['preparo', 'sala', 'rpa']).limit(1).maybeSingle()
  if (aberta) return { error: `Este pet já está no centro cirúrgico (${aberta.procedure_name}).` }

  let serviceId: string | null = null
  if (input.service_id) {
    const { data: svc } = await admin.from('stock_items').select('id')
      .eq('id', input.service_id).eq('clinic_id', ctx.clinicId).eq('is_service', true).maybeSingle()
    serviceId = (svc?.id as string | undefined) ?? null
  }

  const { data: surgery, error } = await admin.from('surgeries').insert({
    clinic_id:       ctx.clinicId,
    patient_id:      hosp.patient_id,
    consultation_id: hosp.consultation_id ?? null,
    procedure_name:  procedimento,
    asa_risk:        input.asa_risk?.trim() || null,
    service_id:      serviceId,
    status:          'preparo',
    postop_hospitalization_id: hospitalizationId,
    created_by:      ctx.userId,
  }).select('id').single()
  if (error || !surgery) return { error: 'Erro ao encaminhar ao centro cirúrgico: ' + (error ? mensagemErro(error, 'lib/actions/hospitalization-surgery.ts') : '') }

  await admin.from('hospitalization_records').insert({
    hospitalization_id: hospitalizationId,
    clinic_id:          ctx.clinicId,
    user_id:            ctx.userId,
    user_name:          'Centro Cirúrgico',
    notes:              `🔪 Encaminhado ao centro cirúrgico — ${procedimento}. Ao fim da cirurgia o pet volta a esta internação.`,
    improvement_level:  'estavel',
  })

  await logAudit({ action: 'HOSP_TO_SURGERY', entity_type: 'hospitalizations', entity_id: hospitalizationId, details: { surgery_id: surgery.id, procedure: procedimento } })
  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/hospitalization')
  return { surgery_id: surgery.id as string }
}
