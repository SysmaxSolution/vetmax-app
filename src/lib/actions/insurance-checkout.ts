'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkProcedureCoverage, type ProcedureCoverageResult } from '@/lib/actions/insurance-coverage'

export interface CheckoutInsurancePreview {
  has_insurance: boolean
  provider_name?: string
  plan_type?: string
  items: Array<{
    invoice_item_id:  string
    description:      string
    quantity:         number
    total_price:      number
    coverage:         ProcedureCoverageResult
    charge_now:       number       // valor a cobrar do tutor no caixa AGORA
    deferred_provider: number      // valor que a Petlove cobrará no cartão depois
    receivable:       number       // valor que vira A Receber do convênio
  }>
  totals: {
    grand_total:       number     // soma de total_price (preço cheio)
    charge_now:        number     // total a cobrar do tutor no caixa
    deferred_provider: number     // total que a Petlove cobra do tutor
    receivable:        number     // total que vira A Receber Petlove (em aberto)
    tutor_saved:       number     // economia do tutor frente ao particular
  }
}

type Ctx = {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
}

async function getCtx(): Promise<Ctx | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { supabase: admin, clinicId: profile.clinic_id }
}

/**
 * Resolve o "split" do caixa para uma consulta: olha cada invoice_item,
 * cruza com o convênio do pet, e calcula quanto cobrar agora do tutor vs
 * quanto vai pra A Receber Petlove vs quanto a Petlove cobrará no cartão.
 *
 * NÃO persiste nada — é só uma prévia para o caixa decidir.
 */
export async function previewConsultationInsurance(
  consultationId: string,
): Promise<CheckoutInsurancePreview | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  // 1) Pega a consulta + patient_id
  const { data: consult } = await supabase
    .from('consultations')
    .select('id, patient_id')
    .eq('id', consultationId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!consult) return { error: 'Consulta não encontrada.' }

  // 2) Pega invoice_items da consulta
  //    Nota: invoice_items NÃO tem stock_item_id — apenas description (texto) e
  //    external_procedure_name (quando já foi conciliado). Usamos esses dois
  //    para identificar o procedimento no catálogo de cobertura.
  const { data: items } = await supabase
    .from('invoice_items')
    .select('id, description, external_procedure_name, quantity, total_price, invoices!inner(consultation_id)')
    .eq('invoices.consultation_id', consultationId)

  if (!items || items.length === 0) {
    return {
      has_insurance: false,
      items:         [],
      totals: {
        grand_total: 0, charge_now: 0, deferred_provider: 0, receivable: 0, tutor_saved: 0,
      },
    }
  }

  // 3) Para cada item, checa cobertura
  const enriched: CheckoutInsurancePreview['items'] = []
  let providerName: string | undefined
  let planType:     string | undefined
  let hasInsurance = false

  for (const it of items) {
    // Preferimos external_procedure_name (já mapeado pelo conciliador) quando
    // existir — bate mais preciso com o catálogo. Fallback para description.
    const externalName = (it as { external_procedure_name?: string | null }).external_procedure_name
    const cov = await checkProcedureCoverage({
      patientId:     consult.patient_id,
      procedureName: externalName?.trim() || it.description,
    })

    if ('error' in cov) {
      enriched.push({
        invoice_item_id: it.id,
        description:     it.description,
        quantity:        it.quantity,
        total_price:     Number(it.total_price),
        coverage: {
          status: 'no_insurance', message: 'Indisponível', badge: 'gray',
        } as ProcedureCoverageResult,
        charge_now:        Number(it.total_price),
        deferred_provider: 0,
        receivable:        0,
      })
      continue
    }

    if (cov.provider_name) providerName = cov.provider_name
    if (cov.plan_type)     planType     = cov.plan_type
    if (cov.status === 'covered' || cov.status === 'waiting' || cov.status === 'not_covered') {
      hasInsurance = true
    }

    const totalPrice = Number(it.total_price)
    const copay      = Number(cov.copay_amount ?? 0)

    let chargeNow = 0, deferred = 0, receivable = 0

    if (cov.status === 'covered') {
      if (cov.copay_charger === 'clinic')        { chargeNow = copay;          receivable = totalPrice - copay }
      else if (cov.copay_charger === 'provider') { deferred  = copay;          receivable = totalPrice - copay }
      else if (cov.copay_charger === 'mixed')    { chargeNow = copay / 2;      deferred = copay / 2; receivable = totalPrice - copay }
      else                                        { receivable = totalPrice }
    } else if (cov.status === 'waiting') {
      // Em carência: tutor paga particular agora; convênio não cobre
      chargeNow = totalPrice
    } else if (cov.status === 'not_covered') {
      // Não coberto: particular
      chargeNow = totalPrice
    } else {
      // sem convênio / catálogo desconhecido: cobra cheio
      chargeNow = totalPrice
    }

    enriched.push({
      invoice_item_id:   it.id,
      description:       it.description,
      quantity:          it.quantity,
      total_price:       totalPrice,
      coverage:          cov,
      charge_now:        Number(chargeNow.toFixed(2)),
      deferred_provider: Number(deferred.toFixed(2)),
      receivable:        Number(receivable.toFixed(2)),
    })
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
  const totals = {
    grand_total:       Number(sum(enriched.map(e => e.total_price)).toFixed(2)),
    charge_now:        Number(sum(enriched.map(e => e.charge_now)).toFixed(2)),
    deferred_provider: Number(sum(enriched.map(e => e.deferred_provider)).toFixed(2)),
    receivable:        Number(sum(enriched.map(e => e.receivable)).toFixed(2)),
    tutor_saved:       0,
  }
  totals.tutor_saved = Number((totals.grand_total - totals.charge_now - totals.deferred_provider).toFixed(2))

  return {
    has_insurance: hasInsurance,
    provider_name: providerName,
    plan_type:     planType,
    items:         enriched,
    totals,
  }
}

/**
 * Aplica a marcação de cobertura aos invoice_items: define insurance_status,
 * coparticipation_value e expected_value. Opt-in — só é chamado quando o
 * caixa decide aplicar a prévia.
 */
export async function applyCheckoutInsuranceMarking(
  consultationId: string,
): Promise<{ updated: number; errors: string[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const preview = await previewConsultationInsurance(consultationId)
  if ('error' in preview) return preview
  if (!preview.has_insurance) return { updated: 0, errors: [] }

  const errors: string[] = []
  let updated = 0

  for (const it of preview.items) {
    const cov = it.coverage
    if (cov.status !== 'covered') continue
    const expected = it.total_price - it.charge_now - it.deferred_provider
    const { error } = await supabase
      .from('invoice_items')
      .update({
        insurance_status:        'aguardando_repasse',
        expected_value:          Number(expected.toFixed(2)),
        coparticipation_value:   Number((it.charge_now + it.deferred_provider).toFixed(2)),
        external_procedure_name: cov.procedure_pattern,
      })
      .eq('id', it.invoice_item_id)
      .eq('clinic_id', clinicId)
    if (error) errors.push(`${it.invoice_item_id}: ${error.message}`)
    else updated++
  }

  revalidatePath('/dashboard/financial')
  return { updated, errors }
}
