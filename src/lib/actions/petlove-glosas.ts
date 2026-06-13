'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type GlosaReason =
  | 'item_missing_in_remittance'  // o invoice_item esperava repasse mas a Petlove não pagou
  | 'value_underpaid'             // repasse veio bem abaixo do expected_value
  | 'unmapped_procedure'          // sem mapping, sem como conciliar
  | 'historical_glosa'            // glosa identificada manualmente

export interface GlosaItem {
  invoice_item_id:   string
  description:       string
  patient_name:      string | null
  tutor_name:        string | null
  service_date:      string
  expected_value:    number
  realized_value:    number
  loss:              number
  reason:            GlosaReason
  reason_label:      string
  procedure_pattern: string | null
  external_procedure_name: string | null
}

export interface GlosasDashboard {
  period_start:  string
  period_end:    string
  total_loss:    number
  count:         number
  items:         GlosaItem[]
  /** Top procedimentos por valor de glosa. */
  by_procedure:  Array<{ procedure: string; count: number; loss: number }>
}

type Ctx = {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
}

async function getCtx(): Promise<Ctx | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await sb.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { supabase: createAdminClient(), clinicId: profile.clinic_id }
}

const REASON_LABELS: Record<GlosaReason, string> = {
  item_missing_in_remittance: 'Procedimento não veio na remessa (provável glosa)',
  value_underpaid:            'Valor pago abaixo do esperado',
  unmapped_procedure:         'Procedimento sem mapeamento',
  historical_glosa:           'Glosa registrada manualmente',
}

/**
 * Detecta potenciais glosas no período de uma remessa fechada:
 *   1) invoice_items 'aguardando_repasse' com data dentro do período mas que
 *      não receberam baixa (insurance_status != 'conciliado').
 *   2) invoice_items 'conciliado' com realized_value < 50% do expected_value
 *      (sub-repasse — glosa parcial).
 */
export async function getGlosasForRemittance(
  remittanceId: string,
): Promise<GlosasDashboard | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  // 1) Período da remessa
  const { data: rem } = await supabase
    .from('petlove_remittances')
    .select('id, period_start, period_end, provider_id')
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
    .maybeSingle()
  if (!rem) return { error: 'Remessa não encontrada.' }

  // 2) Invoice_items do período via consultations
  const { data: consults } = await supabase
    .from('consultations')
    .select('id, patient_id, patients(name, tutor:tutors(name))')
    .eq('clinic_id', clinicId)
    .gte('created_at', `${rem.period_start}T00:00:00Z`)
    .lte('created_at', `${rem.period_end}T23:59:59Z`)

  const consultMap = new Map<string, { patient_name: string | null; tutor_name: string | null; service_date: string }>()
  for (const c of consults ?? []) {
    const p = (c.patients as unknown) as { name?: string; tutor?: { name?: string } } | null
    consultMap.set(c.id, {
      patient_name: p?.name ?? null,
      tutor_name:   p?.tutor?.name ?? null,
      service_date: rem.period_end,
    })
  }

  if (consultMap.size === 0) {
    return {
      period_start: rem.period_start, period_end: rem.period_end,
      total_loss: 0, count: 0, items: [], by_procedure: [],
    }
  }

  const consultIds = Array.from(consultMap.keys())

  // 3) Items com insurance pendente OU concíliados com valor baixo
  const { data: items } = await supabase
    .from('invoice_items')
    .select('id, description, insurance_status, expected_value, realized_value, total_price, external_procedure_name, invoices!inner(consultation_id)')
    .in('invoices.consultation_id', consultIds)
    .or('insurance_status.eq.aguardando_repasse,insurance_status.eq.conciliado')

  const glosas: GlosaItem[] = []
  for (const it of items ?? []) {
    const expected = Number(it.expected_value ?? it.total_price)
    const realized = Number(it.realized_value ?? 0)
    const consultId = ((it.invoices as unknown) as { consultation_id: string }).consultation_id
    const consult = consultMap.get(consultId)
    if (!consult) continue

    if (it.insurance_status === 'aguardando_repasse' && expected > 0) {
      glosas.push({
        invoice_item_id:        it.id,
        description:            it.description,
        patient_name:           consult.patient_name,
        tutor_name:             consult.tutor_name,
        service_date:           consult.service_date,
        expected_value:         expected,
        realized_value:         0,
        loss:                   expected,
        reason:                 'item_missing_in_remittance',
        reason_label:           REASON_LABELS.item_missing_in_remittance,
        procedure_pattern:      it.external_procedure_name ?? null,
        external_procedure_name: it.external_procedure_name ?? null,
      })
      continue
    }

    if (it.insurance_status === 'conciliado' && expected > 0 && realized < expected * 0.5 && realized > 0) {
      glosas.push({
        invoice_item_id:        it.id,
        description:            it.description,
        patient_name:           consult.patient_name,
        tutor_name:             consult.tutor_name,
        service_date:           consult.service_date,
        expected_value:         expected,
        realized_value:         realized,
        loss:                   expected - realized,
        reason:                 'value_underpaid',
        reason_label:           REASON_LABELS.value_underpaid,
        procedure_pattern:      it.external_procedure_name ?? null,
        external_procedure_name: it.external_procedure_name ?? null,
      })
    }
  }

  // 4) Agrupamento por procedimento
  const byProc = new Map<string, { count: number; loss: number }>()
  for (const g of glosas) {
    const k = g.description
    const cur = byProc.get(k) ?? { count: 0, loss: 0 }
    cur.count++
    cur.loss += g.loss
    byProc.set(k, cur)
  }
  const by_procedure = Array.from(byProc.entries())
    .map(([procedure, v]) => ({ procedure, count: v.count, loss: Number(v.loss.toFixed(2)) }))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 10)

  const total_loss = glosas.reduce((a, g) => a + g.loss, 0)

  return {
    period_start: rem.period_start,
    period_end:   rem.period_end,
    total_loss:   Number(total_loss.toFixed(2)),
    count:        glosas.length,
    items:        glosas,
    by_procedure,
  }
}

/**
 * Agregação simples para o histórico de glosas por procedimento — usada na
 * pré-checagem para alertar o vet sobre procedimentos que costumam ser glosados.
 */
export async function getGlosaHistoryByProcedure(): Promise<Array<{
  procedure_name: string
  glosa_count:    number
  total_loss:     number
}> | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  // Critério histórico (últimos 6 meses): invoice_items 'aguardando_repasse' com
  // expected_value > 0 cujo período de remessa já fechou.
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().slice(0, 10)

  const { data: items } = await supabase
    .from('invoice_items')
    .select('description, expected_value, realized_value, insurance_status, invoices!inner(clinic_id, created_at)')
    .eq('invoices.clinic_id', clinicId)
    .gte('invoices.created_at', sixMonthsAgoIso)
    .or('insurance_status.eq.aguardando_repasse')
    .gt('expected_value', 0)
    .limit(2000)

  const agg = new Map<string, { count: number; loss: number }>()
  for (const it of items ?? []) {
    const k = it.description
    const cur = agg.get(k) ?? { count: 0, loss: 0 }
    cur.count++
    cur.loss += Number(it.expected_value)
    agg.set(k, cur)
  }

  return Array.from(agg.entries())
    .map(([procedure_name, v]) => ({
      procedure_name,
      glosa_count: v.count,
      total_loss:  Number(v.loss.toFixed(2)),
    }))
    .sort((a, b) => b.total_loss - a.total_loss)
}
