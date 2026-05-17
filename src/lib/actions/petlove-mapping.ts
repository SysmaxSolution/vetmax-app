'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcedureMappingRow {
  external_procedure_name: string
  occurrence_count:        number
  average_repass_value:    number
  mapping_id:              string | null
  internal_stock_item_id:  string | null
  internal_stock_item_name:string | null
  internal_label_alias:    string | null
}

export interface StockItemOption {
  id:         string
  name:       string
  unit_price: number
  category:   string
  is_service: boolean
}

export interface SaveMappingsInput {
  external_procedure_name: string
  /** id existente em stock_items. Se null/omitido, o sistema cria um stock_item novo automaticamente. */
  internal_stock_item_id?: string | null
  internal_label_alias?:   string | null
}

export interface SaveMappingsResult {
  saved:                number
  created_stock_items:  number
  /** patient_custom_prices upserted automaticamente após o mapping. */
  custom_prices_set:    number
  errors:               string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClinicCtx = { supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string }

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  return { supabase, clinicId: profile.clinic_id }
}

async function getPetloveProviderId(
  supabase: ClinicCtx['supabase'],
  clinicId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('insurance_providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('name', 'petlove')
    .maybeSingle()
  return data?.id ?? null
}

// ─── getProcedureMappingStatus ────────────────────────────────────────────────

export async function getProcedureMappingStatus(
  remittanceId: string,
): Promise<ProcedureMappingRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const providerId = await getPetloveProviderId(supabase, clinicId)
  if (!providerId) return { error: 'Convênio Petlove não está cadastrado para esta clínica.' }

  // Agrupar procedimentos da remessa
  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('procedure_name_raw, repass_value')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)

  if (linesErr) return { error: linesErr.message }

  const agg = new Map<string, { count: number; sum: number }>()
  for (const l of lines ?? []) {
    const name = (l.procedure_name_raw ?? '').trim()
    if (!name) continue
    const cur = agg.get(name) ?? { count: 0, sum: 0 }
    cur.count++
    cur.sum += Number(l.repass_value) || 0
    agg.set(name, cur)
  }

  const procedureNames = Array.from(agg.keys())
  if (procedureNames.length === 0) return []

  // Mappings existentes para esses nomes
  const { data: mappings } = await supabase
    .from('petlove_procedure_mappings')
    .select('id, external_procedure_name, internal_stock_item_id, internal_label_alias')
    .eq('clinic_id', clinicId)
    .eq('provider_id', providerId)
    .in('external_procedure_name', procedureNames)

  const mapByName = new Map<string, NonNullable<typeof mappings>[number]>()
  for (const m of mappings ?? []) mapByName.set(m.external_procedure_name, m)

  // Nomes dos stock_items vinculados (para exibir no UI)
  const stockIds = Array.from(new Set((mappings ?? []).map(m => m.internal_stock_item_id).filter((v): v is string => !!v)))
  const stockNameById = new Map<string, string>()
  if (stockIds.length > 0) {
    const { data: stockRows } = await supabase
      .from('stock_items').select('id, name').in('id', stockIds)
    for (const s of stockRows ?? []) stockNameById.set(s.id, s.name)
  }

  const rows: ProcedureMappingRow[] = procedureNames.map(name => {
    const m = mapByName.get(name)
    const stats = agg.get(name)!
    return {
      external_procedure_name:  name,
      occurrence_count:         stats.count,
      average_repass_value:     stats.count > 0 ? stats.sum / stats.count : 0,
      mapping_id:               m?.id ?? null,
      internal_stock_item_id:   m?.internal_stock_item_id ?? null,
      internal_stock_item_name: m?.internal_stock_item_id ? stockNameById.get(m.internal_stock_item_id) ?? null : null,
      internal_label_alias:     m?.internal_label_alias ?? null,
    }
  })

  // Não-mapeados primeiro, depois por nome
  rows.sort((a, b) => {
    const am = a.mapping_id ? 1 : 0
    const bm = b.mapping_id ? 1 : 0
    if (am !== bm) return am - bm
    return a.external_procedure_name.localeCompare(b.external_procedure_name, 'pt-BR')
  })

  return rows
}

// ─── listStockItemsForMapping ─────────────────────────────────────────────────

export async function listStockItemsForMapping(): Promise<StockItemOption[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('stock_items')
    .select('id, name, unit_price, category, is_service')
    .eq('clinic_id', clinicId)
    .order('is_service', { ascending: false })
    .order('name')

  if (error) return { error: error.message }
  return (data ?? []).map(s => ({
    id:         s.id,
    name:       s.name,
    unit_price: Number(s.unit_price ?? 0),
    category:   s.category ?? 'other',
    is_service: !!s.is_service,
  }))
}

// ─── upsertProcedureMappings ──────────────────────────────────────────────────

export async function upsertProcedureMappings(
  input: SaveMappingsInput[],
  remittanceId?: string,
): Promise<SaveMappingsResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  if (input.length === 0) return { error: 'Nada para salvar.' }

  const providerId = await getPetloveProviderId(supabase, clinicId)
  if (!providerId) return { error: 'Convênio Petlove não cadastrado.' }

  // Calcular last_seen_value e average_value se remittanceId for fornecido
  const valuesByName = new Map<string, { count: number; sum: number }>()
  if (remittanceId) {
    const { data: lines } = await supabase
      .from('petlove_remittance_lines')
      .select('procedure_name_raw, repass_value')
      .eq('clinic_id', clinicId)
      .eq('remittance_id', remittanceId)
    for (const l of lines ?? []) {
      const n = (l.procedure_name_raw ?? '').trim()
      if (!n) continue
      const cur = valuesByName.get(n) ?? { count: 0, sum: 0 }
      cur.count++
      cur.sum += Number(l.repass_value) || 0
      valuesByName.set(n, cur)
    }
  }

  const result: SaveMappingsResult = { saved: 0, created_stock_items: 0, custom_prices_set: 0, errors: [] }

  for (const it of input) {
    const name = it.external_procedure_name.trim()
    if (!name) continue
    const stats = valuesByName.get(name)
    const lastValue = stats ? stats.sum / Math.max(1, stats.count) : null

    let stockItemId = it.internal_stock_item_id ?? null

    // ─── Auto-create stock_item quando o usuário deixou em branco ──────────
    if (!stockItemId) {
      // 1. Tenta achar stock_item existente com o mesmo nome (proteção contra dupes pela UNIQUE(clinic_id, name))
      const { data: existing } = await supabase
        .from('stock_items')
        .select('id')
        .eq('clinic_id', clinicId)
        .ilike('name', name)
        .limit(1)
        .maybeSingle()

      if (existing?.id) {
        stockItemId = existing.id
      } else {
        // Serviços auto-criados da Petlove entram com valor ZERADO no estoque.
        // O preço real fica em patient_custom_prices (por pet × procedimento).
        const { data: created, error: createErr } = await supabase
          .from('stock_items')
          .insert({
            clinic_id:  clinicId,
            name,
            category:   'service',
            is_service: true,
            quantity:   0,
            unit:       'un',
            min_quantity: 0,
            unit_price: 0,
          })
          .select('id')
          .single()

        if (createErr || !created) {
          result.errors.push(`"${name}": ${createErr?.message ?? 'falha ao criar serviço'}`)
          continue
        }
        stockItemId = created.id
        result.created_stock_items++
      }
    }

    const { error: upErr } = await supabase
      .from('petlove_procedure_mappings')
      .upsert({
        clinic_id:               clinicId,
        provider_id:             providerId,
        external_procedure_name: name,
        internal_stock_item_id:  stockItemId,
        internal_label_alias:    it.internal_label_alias ?? null,
        last_seen_value:         lastValue,
        average_value:           lastValue,
        observation_count:       stats?.count ?? 0,
        is_auto_learned:         it.internal_stock_item_id ? false : true,
        updated_at:              new Date().toISOString(),
      }, { onConflict: 'clinic_id,provider_id,external_procedure_name' })
    if (upErr) {
      result.errors.push(`"${name}": ${upErr.message}`)
      continue
    }
    result.saved++

    // ─── Propaga: vincula este stock_item aos pets desta remessa que ─────
    //              já estão cadastrados (têm matched_patient_id).
    if (remittanceId && stockItemId) {
      const { data: matchedLines } = await supabase
        .from('petlove_remittance_lines')
        .select('matched_patient_id, repass_value')
        .eq('clinic_id', clinicId)
        .eq('remittance_id', remittanceId)
        .eq('procedure_name_raw', name)
        .not('matched_patient_id', 'is', null)

      const byPatient = new Map<string, number>()
      for (const ml of matchedLines ?? []) {
        if (ml.matched_patient_id) {
          byPatient.set(ml.matched_patient_id, Number(ml.repass_value) || 0)
        }
      }

      for (const [patientId, repass] of byPatient.entries()) {
        const { data: existingCp } = await supabase
          .from('patient_custom_prices')
          .select('id, observation_count')
          .eq('clinic_id', clinicId)
          .eq('patient_id', patientId)
          .eq('stock_item_id', stockItemId)
          .maybeSingle()
        if (existingCp) {
          await supabase
            .from('patient_custom_prices')
            .update({
              custom_price:       repass,
              source:             'petlove_remittance',
              provider_id:        providerId,
              last_remittance_id: remittanceId,
              last_seen_at:       new Date().toISOString(),
              observation_count:  (existingCp.observation_count ?? 0) + 1,
              updated_at:         new Date().toISOString(),
            })
            .eq('id', existingCp.id)
        } else {
          await supabase
            .from('patient_custom_prices')
            .insert({
              clinic_id:          clinicId,
              patient_id:         patientId,
              stock_item_id:      stockItemId,
              custom_price:       repass,
              source:             'petlove_remittance',
              provider_id:        providerId,
              last_remittance_id: remittanceId,
              observation_count:  1,
            })
        }
        result.custom_prices_set++
      }
    }
  }

  if (remittanceId) {
    revalidatePath(`/dashboard/financial/insurance-reconciliation/${remittanceId}/review`)
  }
  return result
}
