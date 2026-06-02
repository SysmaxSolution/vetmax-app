'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkProcedureCoverage, type ProcedureCoverageResult } from '@/lib/actions/insurance-coverage'
import type { CheckoutInsurancePreview } from '@/lib/actions/insurance-checkout.types'

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
    .select('id, description, external_procedure_name, quantity, total_price, coparticipation_value, insurance_status, invoices!inner(consultation_id)')
    .eq('invoices.consultation_id', consultationId)

  if (!items || items.length === 0) {
    return {
      has_insurance: false,
      items:         [],
      totals: {
        grand_total: 0, charge_now: 0, deferred_provider: 0, receivable: 0, tutor_saved: 0, clinic_discount: 0,
      },
    }
  }

  // 3) Para cada item, checa cobertura
  const enriched: CheckoutInsurancePreview['items'] = []
  let providerName: string | undefined
  let planType:     string | undefined
  let hasInsurance = false

  for (const it of items) {
    // ATALHO — Item 5 (2026-06-02): quando a invoice_items já carrega
    // coparticipation_value (split decidido no consultório), ela é a fonte da
    // verdade. Pula a heurística de catálogo: chargeNow = copay, receivable
    // = total - copay. Não precisa de IA ou observed_repass.
    const iAny = it as { coparticipation_value?: number | null; insurance_status?: string | null }
    if (iAny.coparticipation_value !== null && iAny.coparticipation_value !== undefined) {
      const copay      = Number(iAny.coparticipation_value)
      const totalPrice = Number(it.total_price)
      enriched.push({
        invoice_item_id:   it.id,
        description:       it.description,
        quantity:          it.quantity,
        total_price:       totalPrice,
        coverage: {
          status:        'covered',
          message:       'Split definido no consultório',
          badge:         'green',
          copay_amount:  copay,
          copay_charger: 'clinic',
        },
        charge_now:        Number(copay.toFixed(2)),
        deferred_provider: 0,
        receivable:        Number(Math.max(0, totalPrice - copay).toFixed(2)),
      })
      hasInsurance = true
      continue
    }

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
    // Considera o pet "com convênio" sempre que o checkProcedureCoverage
    // identificou o provider — mesmo que o procedimento específico não esteja
    // no catálogo (unknown_procedure). Antes só marcávamos com covered/waiting/
    // not_covered, o que escondia o quadro quando todos os procedimentos eram
    // desconhecidos (ex.: "Consulta Veterinária" não está no catálogo seed).
    if (cov.provider_name && cov.status !== 'no_insurance') {
      hasInsurance = true
    }

    const totalPrice     = Number(it.total_price)
    const observedRepass = cov.observed_repass != null ? Number(cov.observed_repass) : undefined
    const catalogCopay   = Number(cov.copay_amount ?? 0)

    // Modelo Petlove: tabela com valores FIXOS, não complemento.
    //   - Tutor paga: catalogCopay (valor tabelado do plano para o procedimento)
    //   - Petlove paga: observedRepass (repasse fixo da Petlove)
    //   - Clínica recebe total: catalogCopay + observedRepass
    //   - Diferença para o preço particular = desconto que a clínica oferece
    //
    // Quem cobra o copay (clinic / provider / mixed) é definido no catálogo.

    let chargeNow = 0, deferred = 0, receivable = 0

    if (cov.status === 'covered' || (cov.status === 'unknown_procedure' && observedRepass !== undefined)) {
      const charger = cov.copay_charger ?? 'clinic'
      // Tutor paga sempre o copay tabelado (R$ 30 para Consulta no Ideal, por ex.)
      if (charger === 'clinic')        { chargeNow = catalogCopay }
      else if (charger === 'provider') { deferred  = catalogCopay }
      else if (charger === 'mixed')    { chargeNow = catalogCopay / 2; deferred = catalogCopay / 2 }
      // Petlove paga o repasse fixo da tabela (se conhecemos o histórico)
      receivable = observedRepass !== undefined
        ? observedRepass
        : Math.max(0, totalPrice - catalogCopay)  // fallback quando nunca caiu remessa: assume "tudo que sobra"
    } else if (cov.status === 'waiting') {
      // Em carência: tutor paga particular agora; convênio não cobre
      chargeNow = totalPrice
    } else if (cov.status === 'not_covered') {
      // Não coberto: particular
      chargeNow = totalPrice
    } else {
      // sem convênio / catálogo desconhecido E sem observed_repass: cobra cheio
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
    clinic_discount:   0,
  }
  // Economia do tutor: o que ele NÃO paga em relação ao preço cheio particular.
  // Inclui o que vai pra cobrança no cartão (Petlove desconta dele, mas é menos
  // que o particular pediria).
  totals.tutor_saved     = Number((totals.grand_total - totals.charge_now - totals.deferred_provider).toFixed(2))
  // Desconto da clínica: quanto a clínica DEIXA de receber por aceitar o plano.
  // Total cheio - (tutor caixa + tutor cartão + Petlove repasse).
  totals.clinic_discount = Number((totals.grand_total - totals.charge_now - totals.deferred_provider - totals.receivable).toFixed(2))

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
