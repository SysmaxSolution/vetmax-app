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
