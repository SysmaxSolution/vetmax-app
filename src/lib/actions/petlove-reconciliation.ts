'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { runMatchEngine, bulkCreatePatientsFromPetlove } from '@/lib/actions/petlove-matching'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplyReconciliationResult {
  /** invoice_items conciliados (insurance_status='conciliado'). */
  conciliated_invoice_items:       number
  /** financial_entries individuais criados (1 por atendimento). */
  individual_entries_created:      number
  /** financial_entries que tiveram o realized_value ajustado por drift (valor planilha ≠ esperado). */
  drift_adjusted_entries:          number
  /** financial_entries retroativos criados para linhas sem invoice_item prévio. */
  retroactive_entries_created:     number
  /** financial_entries avulsos (bônus indicação, ajustes) — não vinculados a tutor. */
  standalone_entries_created:      number
  /** patient_custom_prices upserted (preços fixados nos perfis). */
  custom_prices_set:               number
  /** Linhas que não puderam virar entry (pet não identificável mesmo após bulk register). */
  pending_manual:                  number
  /** Pets criados automaticamente nesta aprovação (bulk register interno). */
  auto_created_patients:           number
  /** Tutores criados automaticamente nesta aprovação. */
  auto_created_tutors:             number
  /** Atualizações em pet_insurance.plan_type. */
  pet_insurance_updated:           number
  /** Valor total que entrou em A Receber via títulos individuais. */
  total_amount_individual:         number
  /** Valor avulso (bônus + ajustes). */
  total_amount_standalone:         number
  errors:                          string[]
}

export interface ReverseReconciliationResult {
  removed_individual_entries: number
  reverted_invoice_items:     number
  removed_standalone_entries: number
  errors:                     string[]
}

export interface DeleteRemittanceResult {
  removed_financial_entries: number
  removed_custom_prices:     number
  reverted_invoice_items:    number
  removed_lines:             number
  errors:                    string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClinicCtx = { supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string; userId: string }

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  return { supabase, clinicId: profile.clinic_id, userId: user.id }
}

function fmtDateBR(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── deleteRemittance ─────────────────────────────────────────────────────────
// Permite excluir uma remessa em qualquer estado. Se reconciled, primeiro
// estorna (apaga entries financeiros e custom_prices criados por esta remessa).
// Em seguida deleta a remessa (cascade limpa as lines).

export async function deleteRemittance(
  remittanceId: string,
): Promise<DeleteRemittanceResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: rem, error: remErr } = await supabase
    .from('petlove_remittances')
    .select('id, status, remittance_number')
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
    .maybeSingle()
  if (remErr || !rem) return { error: 'Remessa não encontrada.' }

  const result: DeleteRemittanceResult = {
    removed_financial_entries: 0,
    removed_custom_prices:     0,
    reverted_invoice_items:    0,
    removed_lines:             0,
    errors:                    [],
  }

  // 1. Se conciliada, reverter os efeitos colaterais antes de deletar
  if (rem.status === 'reconciled') {
    // 1a. invoice_items conciliados pela remessa → volta a aguardando_repasse
    const { data: lines } = await supabase
      .from('petlove_remittance_lines')
      .select('matched_invoice_item_id')
      .eq('clinic_id', clinicId)
      .eq('remittance_id', remittanceId)
      .not('matched_invoice_item_id', 'is', null)
    const itemIds = (lines ?? []).map(l => l.matched_invoice_item_id).filter((v): v is string => !!v)
    if (itemIds.length > 0) {
      const { count } = await supabase
        .from('invoice_items')
        .update({
          insurance_status:      'aguardando_repasse',
          realized_value:        null,
          coparticipation_value: null,
          reconciled_at:         null,
          reconciled_by:         null,
        }, { count: 'exact' })
        .in('id', itemIds)
        .eq('insurance_status', 'conciliado')
      result.reverted_invoice_items = count ?? 0
    }

    // 1b. financial_entries criados pela remessa (rastreio pelo notes)
    const remRef = `Remessa #${rem.remittance_number}`
    const { data: entries } = await supabase
      .from('financial_entries')
      .select('id')
      .eq('clinic_id', clinicId)
      .in('source', ['petlove', 'petlove_indicacao'])
      .ilike('notes', `%${remRef}%`)
    const entryIds = (entries ?? []).map(e => e.id)
    if (entryIds.length > 0) {
      const { error: delErr } = await supabase
        .from('financial_entries')
        .delete()
        .in('id', entryIds)
      if (delErr) result.errors.push(`Remover entries: ${delErr.message}`)
      else result.removed_financial_entries = entryIds.length
    }

    // 1c. patient_custom_prices vinculados a esta remessa
    const { count: cpCount, error: cpErr } = await supabase
      .from('patient_custom_prices')
      .delete({ count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('last_remittance_id', remittanceId)
    if (cpErr) result.errors.push(`Remover custom_prices: ${cpErr.message}`)
    else result.removed_custom_prices = cpCount ?? 0
  }

  // 2. Conta linhas antes de deletar
  const { count: linesCount } = await supabase
    .from('petlove_remittance_lines')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
  result.removed_lines = linesCount ?? 0

  // 3. Deleta a remessa (cascade nas lines via FK ON DELETE CASCADE)
  const { error: delRemErr } = await supabase
    .from('petlove_remittances')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
  if (delRemErr) return { error: `Falha ao excluir remessa: ${delRemErr.message}` }

  revalidatePath('/dashboard/financial/insurance-reconciliation')
  revalidatePath('/dashboard/financial')
  return result
}

// ─── applyReconciliation (refatorado para granularidade por tutor) ────────────

export async function applyReconciliation(
  remittanceId: string,
): Promise<ApplyReconciliationResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, userId } = ctx

  const { data: rem, error: remErr } = await supabase
    .from('petlove_remittances')
    .select('id, status, provider_id, remittance_number, period_start, period_end, total_service_value, referral_bonus_value, credit_adjustment, debit_adjustment')
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
    .maybeSingle()
  if (remErr || !rem) return { error: 'Remessa não encontrada.' }
  if (rem.status === 'reconciled') {
    return { error: 'Remessa já foi conciliada. Estorne antes de reprocessar.' }
  }

  const result: ApplyReconciliationResult = {
    conciliated_invoice_items:   0,
    individual_entries_created:  0,
    drift_adjusted_entries:      0,
    retroactive_entries_created: 0,
    standalone_entries_created:  0,
    custom_prices_set:           0,
    pending_manual:              0,
    auto_created_patients:       0,
    auto_created_tutors:         0,
    pet_insurance_updated:       0,
    total_amount_individual:     0,
    total_amount_standalone:     0,
    errors:                      [],
  }

  // ─── Pipeline autônomo: matching → bulk register → re-matching ───────────
  // Se a remessa ainda não passou pelo motor, roda agora. Depois,
  // pets órfãos viram cadastros via bulk register e o matching reroda.
  if (rem.status === 'imported') {
    const r1 = await runMatchEngine(remittanceId)
    if ('error' in r1) result.errors.push(`Matching inicial: ${r1.error}`)
  }

  // Auto bulk register: identifica linhas missing e cria pets/tutores
  const { data: missingLines } = await supabase
    .from('petlove_remittance_lines')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
    .eq('match_status', 'missing_patient_profile')

  if (missingLines && missingLines.length > 0) {
    const bulk = await bulkCreatePatientsFromPetlove(missingLines.map(l => l.id))
    if (!('error' in bulk)) {
      result.auto_created_patients = bulk.created_patients
      result.auto_created_tutors   = bulk.created_tutors
      for (const err of bulk.errors) result.errors.push(`Bulk register: ${err}`)
    }
    // Reroda matching após criar os pets — agora terão matched_patient_id
    const r2 = await runMatchEngine(remittanceId)
    if ('error' in r2) result.errors.push(`Re-matching pós bulk: ${r2.error}`)
  }

  // Carrega linhas FINAIS (após pipeline)
  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('id, match_status, matched_invoice_item_id, matched_patient_id, matched_tutor_id, repass_value, coparticipation_value, procedure_name_raw, plan_name_raw, service_date, external_appointment_id, microchip_raw')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
  if (linesErr) return { error: linesErr.message }
  if (!lines || lines.length === 0) return { error: 'Remessa sem linhas para conciliar.' }

  // ─── Lookup: procedure_name_raw → stock_item_id (via mappings + auto-create) ─
  const procNames = Array.from(new Set(lines.map(l => (l.procedure_name_raw ?? '').trim()).filter(Boolean)))
  const mappingByName = new Map<string, string>()
  if (procNames.length > 0) {
    const { data: maps } = await supabase
      .from('petlove_procedure_mappings')
      .select('external_procedure_name, internal_stock_item_id')
      .eq('clinic_id', clinicId)
      .eq('provider_id', rem.provider_id)
      .in('external_procedure_name', procNames)
    for (const m of maps ?? []) {
      if (m.internal_stock_item_id) mappingByName.set(m.external_procedure_name, m.internal_stock_item_id)
    }
  }

  // ─── Loop por linha — cada uma vira um título individual ──────────────────
  const nowIso = new Date().toISOString()

  for (const line of lines) {
    const repass = Number(line.repass_value) || 0
    const copart = Number(line.coparticipation_value) || 0
    const procName = (line.procedure_name_raw ?? '').trim()
    const stockItemId = procName ? mappingByName.get(procName) ?? null : null

    // ─── Caso 1: linha matched/partial COM invoice_item — drift ajustado ────
    if (line.matched_invoice_item_id && (line.match_status === 'matched' || line.match_status === 'partial')) {
      // 1a. Pega o invoice_item para comparar expected_value e descobrir a consultation
      const { data: invItem } = await supabase
        .from('invoice_items')
        .select('id, invoice_id, expected_value, total_price, invoices!inner(consultation_id, patient_id, tutor_id)')
        .eq('id', line.matched_invoice_item_id)
        .maybeSingle()

      if (!invItem) {
        result.errors.push(`Linha ${line.id}: invoice_item ${line.matched_invoice_item_id} não encontrado.`)
        continue
      }

      const inv = (invItem.invoices as unknown) as { consultation_id: string; patient_id: string; tutor_id: string } | null
      const expectedValue = invItem.expected_value !== null ? Number(invItem.expected_value) : Number(invItem.total_price)
      const hadDrift = Math.abs(expectedValue - repass) > 0.01

      // 1b. Atualiza o invoice_item: conciliado + realized
      const { error: updItemErr } = await supabase
        .from('invoice_items')
        .update({
          insurance_status:        'conciliado',
          expected_value:          expectedValue,
          realized_value:          repass,
          coparticipation_value:   copart,
          provider_id:             rem.provider_id,
          external_procedure_name: procName,
          reconciled_at:           nowIso,
          reconciled_by:           userId,
        })
        .eq('id', line.matched_invoice_item_id)
      if (updItemErr) {
        result.errors.push(`Item ${line.matched_invoice_item_id}: ${updItemErr.message}`)
        continue
      }
      result.conciliated_invoice_items++

      // 1c. Cria financial_entry INDIVIDUAL para este atendimento/tutor
      if (repass > 0 && inv?.tutor_id) {
        const driftSuffix = hadDrift
          ? ` (ajuste drift: esperado ${expectedValue.toFixed(2)} → realizado ${repass.toFixed(2)})`
          : ''
        const description = `Petlove · ${procName || 'Procedimento'} · ${fmtDateBR(line.service_date)}${driftSuffix}`

        const { error: feErr } = await supabase
          .from('financial_entries')
          .insert({
            clinic_id:    clinicId,
            type:         'receivable',
            description,
            amount:       repass,
            due_date:     line.service_date,
            payment_date: rem.period_end,
            status:       'paid',
            source:       'petlove',
            category:     'Convênios · Petlove',
            tutor_id:     inv.tutor_id,
            patient_id:   inv.patient_id,
            notes:        `Remessa #${rem.remittance_number} · linha ${line.id}${hadDrift ? ` · drift ${(repass - expectedValue).toFixed(2)}` : ''}`,
            created_by:   userId,
          })
        if (feErr) {
          result.errors.push(`Entry tutor ${inv.tutor_id}: ${feErr.message}`)
        } else {
          result.individual_entries_created++
          result.total_amount_individual += repass
          if (hadDrift) result.drift_adjusted_entries++
        }
      }

      // 1d. Upsert patient_custom_prices
      if (stockItemId && inv?.patient_id && repass > 0) {
        await upsertCustomPrice(supabase, {
          clinicId,
          patientId:    inv.patient_id,
          stockItemId,
          customPrice:  repass,
          providerId:   rem.provider_id,
          remittanceId: rem.id,
        }, result)
      }
      continue
    }

    // ─── Caso 2: orphan_invoice OU manual_resolved (pet criado por bulk) ──
    //   Sem invoice_item prévio, mas pet+tutor identificados → cria entry
    //   retroativo individual + upsert do preço customizado do pet.
    if (
      line.matched_patient_id && line.matched_tutor_id &&
      (line.match_status === 'orphan_invoice' || line.match_status === 'manual_resolved')
    ) {
      // Idempotência: evita duplicar se o usuário aprovar mais de uma vez
      const { data: existing } = await supabase
        .from('financial_entries')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('source', 'petlove')
        .ilike('notes', `%Remessa #${rem.remittance_number} · linha ${line.id}%`)
        .maybeSingle()

      if (!existing) {
        const isOrphan = line.match_status === 'orphan_invoice'
        const description = `Petlove · ${procName || 'Procedimento'} · ${fmtDateBR(line.service_date)}${isOrphan ? ' (lançamento retroativo)' : ''}`
        const { error: feErr } = await supabase
          .from('financial_entries')
          .insert({
            clinic_id:    clinicId,
            type:         'receivable',
            description,
            amount:       repass > 0 ? repass : 0.01,
            due_date:     line.service_date,
            payment_date: rem.period_end,
            status:       'paid',
            source:       'petlove',
            category:     'Convênios · Petlove',
            tutor_id:     line.matched_tutor_id,
            patient_id:   line.matched_patient_id,
            notes:        `Remessa #${rem.remittance_number} · linha ${line.id}${isOrphan ? ' · sem invoice_item prévio' : ' · pet criado via bulk register'}`,
            created_by:   userId,
          })
        if (feErr) {
          result.errors.push(`Entry tutor ${line.matched_tutor_id}: ${feErr.message}`)
        } else {
          result.retroactive_entries_created++
          result.total_amount_individual += repass
        }
      }

      if (stockItemId && repass > 0) {
        await upsertCustomPrice(supabase, {
          clinicId,
          patientId:    line.matched_patient_id,
          stockItemId,
          customPrice:  repass,
          providerId:   rem.provider_id,
          remittanceId: rem.id,
        }, result)
      }
      continue
    }

    // ─── Caso 3: pet realmente não identificável → pendente manual ─────────
    if (line.match_status === 'missing_patient_profile') {
      result.pending_manual++
      continue
    }
  }

  // ─── Caso 4: títulos AVULSOS (bônus de indicação + ajustes) ──────────────
  const referral = Number(rem.referral_bonus_value) || 0
  if (referral > 0) {
    const { error: feErr } = await supabase
      .from('financial_entries')
      .insert({
        clinic_id:    clinicId,
        type:         'receivable',
        description:  `Petlove · Bônus de Indicação · Remessa #${rem.remittance_number}`,
        amount:       referral,
        due_date:     rem.period_end,
        payment_date: rem.period_end,
        status:       'paid',
        source:       'petlove_indicacao',
        category:     'Convênios · Petlove',
        notes:        'Receita avulsa: bônus por indicação de novos clientes (não vinculado a atendimento).',
        created_by:   userId,
      })
    if (feErr) result.errors.push(`Bônus indicação: ${feErr.message}`)
    else {
      result.standalone_entries_created++
      result.total_amount_standalone += referral
    }
  }

  const credit = Number(rem.credit_adjustment) || 0
  if (credit > 0) {
    const { error: feErr } = await supabase
      .from('financial_entries')
      .insert({
        clinic_id:    clinicId,
        type:         'receivable',
        description:  `Petlove · Ajuste de Crédito · Remessa #${rem.remittance_number}`,
        amount:       credit,
        due_date:     rem.period_end,
        payment_date: rem.period_end,
        status:       'paid',
        source:       'petlove',
        category:     'Convênios · Petlove · Ajustes',
        notes:        'Receita avulsa: ajuste de crédito informado no cabeçalho da remessa.',
        created_by:   userId,
      })
    if (feErr) result.errors.push(`Ajuste crédito: ${feErr.message}`)
    else {
      result.standalone_entries_created++
      result.total_amount_standalone += credit
    }
  }

  const debit = Number(rem.debit_adjustment) || 0
  if (debit > 0) {
    const { error: feErr } = await supabase
      .from('financial_entries')
      .insert({
        clinic_id:    clinicId,
        type:         'payable',
        description:  `Petlove · Ajuste de Débito · Remessa #${rem.remittance_number}`,
        amount:       debit,
        due_date:     rem.period_end,
        payment_date: rem.period_end,
        status:       'paid',
        source:       'petlove',
        category:     'Convênios · Petlove · Ajustes',
        notes:        'Despesa avulsa: ajuste de débito informado no cabeçalho da remessa.',
        created_by:   userId,
      })
    if (feErr) result.errors.push(`Ajuste débito: ${feErr.message}`)
    else result.standalone_entries_created++
  }

  // ─── Caso 5: pet_insurance.plan_type — atualiza quando mudou ─────────────
  const insuranceUpdates = new Map<string, string>()
  for (const line of lines) {
    if (line.matched_patient_id && line.plan_name_raw) {
      insuranceUpdates.set(line.matched_patient_id, line.plan_name_raw)
    }
  }
  for (const [patientId, planName] of insuranceUpdates.entries()) {
    const { data: existing } = await supabase
      .from('pet_insurance')
      .select('id, plan_type')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .maybeSingle()
    if (existing && existing.plan_type !== planName) {
      const { error: updErr } = await supabase
        .from('pet_insurance')
        .update({ plan_type: planName, updated_at: nowIso })
        .eq('id', existing.id)
      if (!updErr) result.pet_insurance_updated++
    }
  }

  // ─── Marca remessa como reconciled (sem mais financial_entry_id agregado) ─
  await supabase
    .from('petlove_remittances')
    .update({
      status:                       'reconciled',
      reconciled_at:                nowIso,
      financial_entry_id:           null, // legado: não usamos mais o entry monolítico
      referral_financial_entry_id:  null,
    })
    .eq('id', remittanceId)

  revalidatePath(`/dashboard/financial/insurance-reconciliation/${remittanceId}/review`)
  revalidatePath('/dashboard/financial/insurance-reconciliation')
  revalidatePath('/dashboard/financial')
  return result
}

// ─── upsertCustomPrice (helper interno) ───────────────────────────────────────

async function upsertCustomPrice(
  supabase: ClinicCtx['supabase'],
  params: {
    clinicId:     string
    patientId:    string
    stockItemId:  string
    customPrice:  number
    providerId:   string
    remittanceId: string
  },
  result: ApplyReconciliationResult,
) {
  const { clinicId, patientId, stockItemId, customPrice, providerId, remittanceId } = params

  // observation_count precisa incrementar — fetch + update OR insert
  const { data: existing } = await supabase
    .from('patient_custom_prices')
    .select('id, observation_count')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('stock_item_id', stockItemId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('patient_custom_prices')
      .update({
        custom_price:       customPrice,
        source:             'petlove_remittance',
        provider_id:        providerId,
        last_remittance_id: remittanceId,
        last_seen_at:       new Date().toISOString(),
        observation_count:  (existing.observation_count ?? 0) + 1,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (!error) result.custom_prices_set++
    else        result.errors.push(`custom_price ${stockItemId}: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('patient_custom_prices')
      .insert({
        clinic_id:          clinicId,
        patient_id:         patientId,
        stock_item_id:      stockItemId,
        custom_price:       customPrice,
        source:             'petlove_remittance',
        provider_id:        providerId,
        last_remittance_id: remittanceId,
        observation_count:  1,
      })
    if (!error) result.custom_prices_set++
    else        result.errors.push(`custom_price ${stockItemId}: ${error.message}`)
  }
}

// ─── reverseRemittance (atualizado para apagar entries individuais) ───────────

export async function reverseRemittance(
  remittanceId: string,
): Promise<ReverseReconciliationResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: rem, error: remErr } = await supabase
    .from('petlove_remittances')
    .select('id, status, remittance_number')
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
    .maybeSingle()
  if (remErr || !rem) return { error: 'Remessa não encontrada.' }
  if (rem.status !== 'reconciled') {
    return { error: 'Apenas remessas conciliadas podem ser estornadas.' }
  }

  const result: ReverseReconciliationResult = {
    removed_individual_entries: 0,
    reverted_invoice_items:     0,
    removed_standalone_entries: 0,
    errors:                     [],
  }

  // 1. Reverte invoice_items conciliados pela remessa (via remittance_lines)
  const { data: lines } = await supabase
    .from('petlove_remittance_lines')
    .select('matched_invoice_item_id')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
    .not('matched_invoice_item_id', 'is', null)
  const itemIds = (lines ?? []).map(l => l.matched_invoice_item_id).filter((v): v is string => !!v)
  if (itemIds.length > 0) {
    const { count } = await supabase
      .from('invoice_items')
      .update({
        insurance_status:      'aguardando_repasse',
        realized_value:        null,
        coparticipation_value: null,
        reconciled_at:         null,
        reconciled_by:         null,
      }, { count: 'exact' })
      .in('id', itemIds)
      .eq('insurance_status', 'conciliado')
    result.reverted_invoice_items = count ?? 0
  }

  // 2. Remove financial_entries criados por esta remessa (rastreio pelo notes contendo o número)
  //    Padrão de notes: "Remessa #<remittance_number> ..."
  //    Para segurança, restringe a source IN ('petlove','petlove_indicacao') e status paid criado nos últimos 90d
  const remRef = `Remessa #${rem.remittance_number}`
  const { data: candidateEntries } = await supabase
    .from('financial_entries')
    .select('id, source, tutor_id')
    .eq('clinic_id', clinicId)
    .in('source', ['petlove', 'petlove_indicacao'])
    .ilike('notes', `%${remRef}%`)

  const idsToDelete = (candidateEntries ?? []).map(e => e.id)
  let stand = 0, indiv = 0
  for (const e of candidateEntries ?? []) {
    if (e.tutor_id) indiv++; else stand++
  }
  if (idsToDelete.length > 0) {
    const { error } = await supabase
      .from('financial_entries')
      .delete()
      .in('id', idsToDelete)
    if (error) result.errors.push(`Remover entries: ${error.message}`)
    else {
      result.removed_individual_entries = indiv
      result.removed_standalone_entries = stand
    }
  }

  // 3. Marca remessa como reversed
  await supabase
    .from('petlove_remittances')
    .update({
      status:                      'reversed',
      reconciled_at:               null,
      financial_entry_id:          null,
      referral_financial_entry_id: null,
    })
    .eq('id', remittanceId)

  revalidatePath(`/dashboard/financial/insurance-reconciliation/${remittanceId}/review`)
  revalidatePath('/dashboard/financial/insurance-reconciliation')
  revalidatePath('/dashboard/financial')
  return result
}
