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

export interface ResolvedPricing {
  unit_price: number
  /** Preenchido APENAS quando o pet tem convênio ativo. */
  insurance: null | {
    total:                number
    copay:                number | null   // null quando ainda não cadastrado (UI exige preencher)
    repass:               number | null
    source:               'custom' | 'default' | 'fallback_unit'
    /** True quando UI deve forçar o vet a inserir copay/repass antes de salvar. */
    requires_split_input: boolean
    /** Nome do provider (para label na UI). */
    provider_name:        string | null
  }
}

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
  const { data: insurance } = await admin
    .from('pet_insurance')
    .select('id, provider_id, insurance_providers(name)')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patient_id)
    .eq('coverage_status', 'active')
    .maybeSingle()

  if (!insurance) {
    return { unit_price, insurance: null }
  }

  const provider_name = (insurance.insurance_providers as any)?.name ?? null

  // 3) Lookup em patient_custom_prices (split por pet+item)
  const { data: custom } = await admin
    .from('patient_custom_prices')
    .select('custom_price, copay_amount, repass_amount')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patient_id)
    .eq('stock_item_id', stock_item_id)
    .maybeSingle()

  if (custom && custom.copay_amount !== null && custom.repass_amount !== null) {
    return {
      unit_price,
      insurance: {
        total:                Number(custom.custom_price),
        copay:                Number(custom.copay_amount),
        repass:               Number(custom.repass_amount),
        source:               'custom',
        requires_split_input: false,
        provider_name,
      },
    }
  }

  // 4) Default de convênio do serviço
  if (default_insurance_price !== null) {
    return {
      unit_price,
      insurance: {
        total:                default_insurance_price,
        copay:                null,
        repass:               null,
        source:               'default',
        requires_split_input: true,
        provider_name,
      },
    }
  }

  // 5) Fallback: cobra particular (unit_price), mas marca para UI mostrar inputs
  //    de split caso o vet queira registrar o acordo agora.
  return {
    unit_price,
    insurance: {
      total:                unit_price,
      copay:                null,
      repass:               null,
      source:               'fallback_unit',
      requires_split_input: true,
      provider_name,
    },
  }
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
