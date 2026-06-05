'use server'

/**
 * Insurance pricing — split coparticipação/repasse (Item 5, sprint 2026-06-02).
 *
 * Regra de Ouro: total_convênio = copay (tutor) + repass (plano).
 *
 * Hierarquia de resolução (decisão PO):
 *   1) Pet SEM convênio ativo                       → particular (unit_price puro)
 *   2) Pet COM convênio + patient_custom_prices     → usa o trio (custom_price, copay, repass)
 *   3) Pet COM convênio + stock_items.default_insurance_price → default + split pendente
 *   4) Pet COM convênio sem nenhum dos dois         → particular como fallback E flag para
 *      a UI mostrar inputs para o vet preencher copay/repass no consultório.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { decideServicePricing, type ResolvedPricing } from '@/lib/insurance-pricing-core'

// ATENÇÃO (HF 05/06): NUNCA re-exporte tipos (`export type { X }`) de um
// arquivo 'use server'. O Turbopack registra TODO export como referência de
// server action em runtime — o re-export de tipo vira um identificador
// inexistente ("ReferenceError: ResolvedPricing is not defined") e derruba o
// módulo de actions da rota inteira (todas as actions da página retornam 500).
// Importe o tipo diretamente de '@/lib/insurance-pricing-core'.

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

// ─── resolveServicePricing ────────────────────────────────────────────────────

/**
 * Calcula o preço a aplicar quando o serviço for adicionado a uma consulta.
 * Não persiste nada — apenas resolve. O caller decide o que fazer.
 */
export async function resolveServicePricing(
  patient_id: string,
  stock_item_id: string,
): Promise<ResolvedPricing | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  // 1) Stock item base
  const { data: item } = await admin
    .from('stock_items')
    .select('id, unit_price, default_insurance_price, is_service')
    .eq('id', stock_item_id)
    .eq('clinic_id', clinic_id)
    .single()
  if (!item) return { error: 'Item não encontrado.' }

  const unit_price = Number(item.unit_price ?? 0)
  const default_insurance_price = item.default_insurance_price === null
    ? null
    : Number(item.default_insurance_price)

  // 2) Pet tem convênio ativo?
  //    Fix B1 (04/06): NÃO usar maybeSingle() — com 2+ vínculos (ex.: um
  //    cancelado + um ativo recriado), maybeSingle retorna erro e data=null,
  //    e o pet era tratado silenciosamente como particular (valor cheio).
  const { data: insuranceRows } = await admin
    .from('pet_insurance')
    .select('id, provider_id, insurance_providers(name)')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patient_id)
    .eq('coverage_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  const insurance = insuranceRows?.[0] ?? null

  const provider_name = insurance
    ? ((insurance.insurance_providers as any)?.name ?? null)
    : null

  // 3) Lookup em patient_custom_prices (split por pet+item) — só com convênio
  let custom: { custom_price: number; copay_amount: number | null; repass_amount: number | null } | null = null
  if (insurance) {
    const { data } = await admin
      .from('patient_custom_prices')
      .select('custom_price, copay_amount, repass_amount')
      .eq('clinic_id', clinic_id)
      .eq('patient_id', patient_id)
      .eq('stock_item_id', stock_item_id)
      .maybeSingle()
    custom = data ?? null
  }

  // 4) Decisão da hierarquia — núcleo puro testável (insurance-pricing-core)
  return decideServicePricing({
    unit_price,
    default_insurance_price,
    has_active_insurance: insurance !== null,
    provider_name,
    custom,
  })
}

// ─── resolveConsultationServicesPricing (batch p/ UI de seleção) ─────────────

/**
 * Resolve o preço efetivo (convênio ou particular) de vários stock_items de
 * uma vez para o pet da consulta — usado pelo ServiceSelectionModal para
 * exibir o preço CORRETO na listagem (fix B1: o modal mostrava sempre o
 * unit_price particular, mesmo para pets conveniados).
 *
 * Retorna um mapa stock_item_id → resultado. Itens sem convênio aplicável
 * vêm com insurance=null (exibir unit_price normalmente).
 */
export async function resolveConsultationServicesPricing(
  consultation_id: string,
  stock_item_ids: string[],
): Promise<Record<string, ResolvedPricing> | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  if (stock_item_ids.length === 0) return {}

  // 1) Pet da consulta
  const { data: consult } = await admin
    .from('consultations')
    .select('patient_id')
    .eq('id', consultation_id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!consult?.patient_id) return { error: 'Consulta não encontrada.' }
  const patient_id = consult.patient_id as string

  // 2) Itens em lote
  const { data: items } = await admin
    .from('stock_items')
    .select('id, unit_price, default_insurance_price')
    .eq('clinic_id', clinic_id)
    .in('id', stock_item_ids)

  // 3) Convênio ativo do pet (mesma regra robusta do resolveServicePricing)
  const { data: insuranceRows } = await admin
    .from('pet_insurance')
    .select('id, insurance_providers(name)')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patient_id)
    .eq('coverage_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  const insurance = insuranceRows?.[0] ?? null
  const provider_name = insurance
    ? ((insurance.insurance_providers as any)?.name ?? null)
    : null

  // 4) Custom prices do pet em lote (só com convênio)
  const customByItem = new Map<string, { custom_price: number; copay_amount: number | null; repass_amount: number | null }>()
  if (insurance) {
    const { data: customs } = await admin
      .from('patient_custom_prices')
      .select('stock_item_id, custom_price, copay_amount, repass_amount')
      .eq('clinic_id', clinic_id)
      .eq('patient_id', patient_id)
      .in('stock_item_id', stock_item_ids)
    for (const c of customs ?? []) {
      customByItem.set(c.stock_item_id as string, {
        custom_price:  Number(c.custom_price),
        copay_amount:  c.copay_amount  === null ? null : Number(c.copay_amount),
        repass_amount: c.repass_amount === null ? null : Number(c.repass_amount),
      })
    }
  }

  const out: Record<string, ResolvedPricing> = {}
  for (const item of items ?? []) {
    out[item.id as string] = decideServicePricing({
      unit_price:               Number(item.unit_price ?? 0),
      default_insurance_price:  item.default_insurance_price === null ? null : Number(item.default_insurance_price),
      has_active_insurance:     insurance !== null,
      provider_name,
      custom:                   customByItem.get(item.id as string) ?? null,
    })
  }
  return out
}

// ─── updateConsultationServicePricingSplit ────────────────────────────────────

/**
 * O vet ajusta copay/repass de uma linha de consultation_services. Atualiza:
 *   - consultation_services (snapshot DESTA consulta — imutável depois)
 *   - patient_custom_prices  (UPSERT para próximas consultas do mesmo pet+item)
 *   - patient_petlove_history (event audit)
 *
 * Não atualiza price_snapshot existente (regra: snapshot do preço total cobrado
 * é imutável). O snapshot que importa é o copay/repass que vai pra invoice.
 */
export async function updateConsultationServicePricingSplit(input: {
  consultation_service_id: string
  copay:  number
  repass: number
  notes?: string | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  if (!Number.isFinite(input.copay)  || input.copay  < 0) return { error: 'Coparticipação inválida.' }
  if (!Number.isFinite(input.repass) || input.repass < 0) return { error: 'Repasse inválido.' }
  const total = Number((input.copay + input.repass).toFixed(2))
  if (total === 0) return { error: 'Total não pode ser zero.' }

  // 1) Carrega a linha + valida clínica
  const { data: line } = await admin
    .from('consultation_services')
    .select('id, clinic_id, consultation_id, stock_item_id, name_snapshot, consultations(patient_id)')
    .eq('id', input.consultation_service_id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!line) return { error: 'Linha de serviço não encontrada.' }

  const patient_id = (line.consultations as any)?.patient_id as string | undefined
  if (!patient_id) return { error: 'Consulta sem paciente.' }

  // 2) Atualiza snapshots na consulta atual
  const { error: csErr } = await admin
    .from('consultation_services')
    .update({
      insurance_total_snapshot: total,
      copay_snapshot:           input.copay,
      repass_snapshot:          input.repass,
      updated_at:               new Date().toISOString(),
    })
    .eq('id', line.id)
  if (csErr) return { error: 'Erro ao salvar snapshot: ' + csErr.message }

  // 3) UPSERT em patient_custom_prices (próximas consultas)
  const { error: pcpErr } = await admin
    .from('patient_custom_prices')
    .upsert({
      clinic_id,
      patient_id,
      stock_item_id:     line.stock_item_id as string,
      custom_price:      total,
      copay_amount:      input.copay,
      repass_amount:     input.repass,
      source:            'manual',
      last_seen_at:      new Date().toISOString(),
      observation_count: 1,
      notes:             input.notes ?? null,
      updated_at:        new Date().toISOString(),
    }, {
      onConflict: 'clinic_id,patient_id,stock_item_id',
    })
  if (pcpErr) return { error: 'Erro ao salvar preço do pet: ' + pcpErr.message }

  // 4) Audit em patient_petlove_history (best effort — não bloqueia se falhar)
  try {
    await admin.from('patient_petlove_history').insert({
      clinic_id,
      patient_id,
      event_type: 'price_updated',
      description: `Split convênio editado no consultório: ${line.name_snapshot} → tutor R$ ${input.copay.toFixed(2)} + plano R$ ${input.repass.toFixed(2)}`,
      metadata: {
        stock_item_id:    line.stock_item_id,
        copay_amount:     input.copay,
        repass_amount:    input.repass,
        custom_price:     total,
        consultation_id:  line.consultation_id,
        consultation_service_id: line.id,
        source:           'consultation_inline_edit',
        created_by:       user_id,
      },
    })
  } catch { /* audit best-effort */ }

  revalidatePath('/dashboard/vet')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { success: true }
}

// ─── suggestDefaultInsurancePrice ─────────────────────────────────────────────

/**
 * Sugere um default_insurance_price para um stock_item baseado no histórico
 * de patient_custom_prices observados naquele item (média ponderada por
 * observation_count). Botão "sugerir" do Cadastros > Serviços chama isto.
 *
 * Retorna null quando não há histórico suficiente (caller mostra "sem dados").
 */
export async function suggestDefaultInsurancePrice(
  stock_item_id: string,
): Promise<{
  suggested:  number | null
  sample_size: number
  min:        number | null
  max:        number | null
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data } = await admin
    .from('patient_custom_prices')
    .select('custom_price, observation_count')
    .eq('clinic_id', clinic_id)
    .eq('stock_item_id', stock_item_id)
    .not('custom_price', 'is', null)

  const rows = (data ?? []).filter(r => Number(r.custom_price) > 0)
  if (rows.length === 0) {
    return { suggested: null, sample_size: 0, min: null, max: null }
  }

  // Média ponderada por observation_count (mais peso para preços observados mais vezes).
  let weighted_sum = 0
  let weight_total = 0
  let min = Infinity
  let max = -Infinity
  for (const r of rows) {
    const price = Number(r.custom_price)
    const w = Math.max(1, Number(r.observation_count ?? 1))
    weighted_sum += price * w
    weight_total += w
    if (price < min) min = price
    if (price > max) max = price
  }
  const avg = weighted_sum / weight_total
  // Arredonda para 2 casas
  const suggested = Number(avg.toFixed(2))
  return {
    suggested,
    sample_size: rows.length,
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
  }
}
