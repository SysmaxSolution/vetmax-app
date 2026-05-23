'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StockConsumptionSource =
  | 'CONSULTATION'
  | 'HOSPITALIZATION'
  | 'MANUAL_ADJUSTMENT'
  | 'INITIAL_STOCK'
  | 'RESTOCK'

export interface ConsumeStockPayload {
  /** UUID do stock_item. null/omitido = item não foi reconhecido → audit-only com requires_reconciliation=TRUE. */
  stock_item_id?:   string | null
  /** Nome textual do medicamento (sempre obrigatório — auditoria). */
  medication_name:  string
  /** Quantidade a debitar. Sempre positiva; a RPC inverte para movement DEBIT. */
  quantity:         number
  /** Contexto operacional — bate com o CHECK do stock_movements. */
  source:           StockConsumptionSource
  /** UUID do registro de origem (ex.: hospitalization_dose_administrations.id). */
  reference_id?:    string | null
  notes?:           string | null
}

export interface StockConsumptionResult {
  movement_id:              string
  /** TRUE se a baixa cruzou com um stock_item real (decremento aplicado). */
  matched:                  boolean
  /** Quantidade ANTES da baixa (null se unmatched). */
  quantity_before:          number | null
  /** Quantidade APÓS a baixa (pode ser negativa em estoque insuficiente). */
  quantity_after:           number | null
  /** Resultado caiu ≤ min_quantity mas ainda positivo — toast amber. */
  below_minimum:            boolean
  /** TRUE quando: unmatched OU resultou em quantity_after < 0. Toast rose/cinza. */
  requires_reconciliation:  boolean
}

// ─── Action ──────────────────────────────────────────────────────────────────

/**
 * Wrapper auth-checked da RPC `rpc_apply_stock_consumption`.
 *
 * Filosofia (alinhada com PO):
 *  - Nunca trava: estoque insuficiente OU item não reconhecido vira movement
 *    com requires_reconciliation=TRUE, decrementa stock_items.quantity até
 *    valor negativo, retorna ao caller para feedback diferenciado.
 *  - Atomic: a RPC usa SELECT FOR UPDATE no item — dois veterinários aplicando
 *    a mesma ampola simultaneamente NÃO geram corrida.
 *  - Auditoria sempre completa: medication_name é obrigatório, quantity_before
 *    e quantity_after preenchidos quando match, requires_reconciliation flag
 *    expõe o caso à tela futura de Gestão de Divergências.
 */
export async function consumeStockForApplication(
  payload: ConsumeStockPayload,
): Promise<StockConsumptionResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  if (!payload.medication_name?.trim()) {
    return { error: 'medication_name é obrigatório para auditoria.' }
  }
  if (!(payload.quantity > 0)) {
    return { error: 'quantity deve ser positiva.' }
  }

  const { data, error } = await admin.rpc('rpc_apply_stock_consumption', {
    p_clinic_id:       profile.clinic_id,
    p_stock_item_id:   payload.stock_item_id ?? null,
    p_medication_name: payload.medication_name.trim(),
    p_quantity:        payload.quantity,
    p_source:          payload.source,
    p_reference_id:    payload.reference_id ?? null,
    p_notes:           payload.notes?.trim() || null,
    p_user_id:         user.id,
  })

  if (error) return { error: 'Erro ao baixar estoque: ' + error.message }

  // RPC retorna setof — em chamada via Supabase JS chega como array de 1.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'RPC não retornou linha (estado inconsistente).' }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/hospitalization')

  return {
    movement_id:             row.movement_id     as string,
    matched:                 Boolean(row.matched),
    quantity_before:         row.quantity_before === null ? null : Number(row.quantity_before),
    quantity_after:          row.quantity_after  === null ? null : Number(row.quantity_after),
    below_minimum:           Boolean(row.below_minimum),
    requires_reconciliation: Boolean(row.requires_reconciliation),
  }
}

// ─── Busca de stock_items para o dropdown da prescrição ─────────────────────

export interface StockItemLite {
  id:            string
  name:          string
  sku:           string | null
  barcode:       string | null
  category:      string
  unit:          string
  quantity:      number
  min_quantity:  number
  is_controlled: boolean
  /** Marcador derivado: quantity <= min_quantity (badge "estoque baixo" no UI). */
  is_below_min:  boolean
}

/**
 * Busca stock_items por nome, SKU ou barcode (ILIKE).
 * Filtra is_service=false (medicação/produto, não serviço) e ordena por nome.
 * Limita a 20 resultados para manter o autocomplete leve.
 */
export async function searchStockItems(query: string): Promise<StockItemLite[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const trimmed = (query ?? '').trim()
  let qb = admin
    .from('stock_items')
    .select('id, name, sku, barcode, category, unit, quantity, min_quantity, is_controlled')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_service', false)
    .order('name', { ascending: true })
    .limit(20)

  if (trimmed.length >= 2) {
    const pat = `%${trimmed}%`
    qb = qb.or(`name.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat}`)
  }

  const { data, error } = await qb
  if (error) return { error: error.message }

  return (data ?? []).map((row): StockItemLite => {
    const quantity     = Number(row.quantity ?? 0)
    const min_quantity = Number(row.min_quantity ?? 0)
    return {
      id:            row.id as string,
      name:          row.name as string,
      sku:           (row.sku     as string | null) ?? null,
      barcode:       (row.barcode as string | null) ?? null,
      category:      row.category as string,
      unit:          row.unit as string,
      quantity,
      min_quantity,
      is_controlled: Boolean(row.is_controlled),
      is_below_min:  quantity <= min_quantity,
    }
  })
}

// ─── Listagem de divergências (consumido por futura tela de Gestão) ─────────

export interface ReconciliationItem {
  id:                    string
  stock_item_id:         string | null
  medication_name:       string
  quantity_change:       number
  quantity_before:       number | null
  quantity_after:        number | null
  source:                string
  reference_id:          string | null
  notes:                 string | null
  created_at:            string
  created_by:            string | null
}

export async function listStockReconciliationQueue(): Promise<ReconciliationItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await admin
    .from('stock_movements')
    .select('id, stock_item_id, medication_name, quantity_change, quantity_before, quantity_after, source, reference_id, notes, created_at, created_by')
    .eq('clinic_id', profile.clinic_id)
    .eq('requires_reconciliation', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { error: error.message }
  return (data ?? []) as ReconciliationItem[]
}
