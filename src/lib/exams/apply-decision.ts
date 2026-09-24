// Aplicação da decisão do cliente sobre um exame rejeitado (recoletar / não
// recoletar). Módulo server-only SEM 'use server' — é chamado tanto pelas
// actions da equipe quanto pelas dos portais (parceiro/tutor), que fazem a
// autorização antes. Aqui só mora a regra.

import type { createAdminClient } from '@/lib/supabase/admin'
import { nextExamState, type ExamState, type ExamDecision, type DecisionActorKind } from '@/lib/exams/rejection-flow'

type Admin = ReturnType<typeof createAdminClient>

export interface ApplyDecisionInput {
  admin:         Admin
  clinicId:      string
  serviceLineId: string
  decision:      ExamDecision
  actorKind:     DecisionActorKind
  actorLabel:    string
  returnDeadline?: string | null
}

export interface ApplyDecisionResult {
  ok: true
  consultationId: string
  /** Linha da NOVA coleta, quando o cliente pediu recoleta. */
  newLineId: string | null
}

/**
 * `recollect` abre uma NOVA linha de coleta (mesma OS, mesmo serviço e preço,
 * prazo novo) vinculada à primeira por `exam_recollect_of_id` — a 1ª coleta é
 * preservada com o motivo da rejeição, nunca apagada.
 * `no_recollect` encerra o exame sem cobrança.
 *
 * A nova linha nasce com a trava de cobrança ligada: só vira título quando for
 * de fato realizada.
 */
export async function applyExamDecision(
  i: ApplyDecisionInput,
): Promise<ApplyDecisionResult | { error: string }> {
  const { admin, clinicId } = i

  const { data: line } = await admin
    .from('consultation_services')
    .select('id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, company_id, added_at_stage, insurance_total_snapshot, copay_snapshot, repass_snapshot, exam_state, exam_attempt_no')
    .eq('id', i.serviceLineId).eq('clinic_id', clinicId).maybeSingle()
  if (!line) return { error: 'Exame não encontrado.' }

  const step = nextExamState((line.exam_state as ExamState | null) ?? null, {
    type: 'decide', decision: i.decision,
  })
  if (!step.ok) return { error: step.error }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('consultation_services')
    .update({
      exam_state:            step.state,
      exam_client_decision:  i.decision,
      exam_decided_at:       now,
      exam_decided_by_kind:  i.actorKind,
      exam_decided_by_label: i.actorLabel,
      updated_at:            now,
    })
    .eq('id', line.id).eq('clinic_id', clinicId)
  if (error) return { error: error.message }

  let newLineId: string | null = null
  if (i.decision === 'recollect') {
    const attempt = Number(line.exam_attempt_no ?? 1) + 1
    const { data: created, error: insErr } = await admin
      .from('consultation_services')
      .insert({
        clinic_id:                clinicId,
        consultation_id:          line.consultation_id,
        stock_item_id:            line.stock_item_id,
        name_snapshot:            line.name_snapshot,
        price_snapshot:           line.price_snapshot,
        quantity:                 line.quantity,
        company_id:               line.company_id,
        added_at_stage:           line.added_at_stage ?? 'vet',
        insurance_total_snapshot: line.insurance_total_snapshot,
        copay_snapshot:           line.copay_snapshot,
        repass_snapshot:          line.repass_snapshot,
        exam_state:               'pending',
        exam_attempt_no:          attempt,
        exam_recollect_of_id:     line.id,
        exam_return_deadline:     i.returnDeadline ?? null,
        exam_billing_hold_at:     now,
      })
      .select('id').single()
    if (insErr) return { error: 'Decisão registrada, mas falhou ao abrir a recoleta: ' + insErr.message }
    newLineId = created.id as string
  }

  return { ok: true, consultationId: line.consultation_id as string, newLineId }
}
