'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
import type {
  ConsumeStockPayload,
  StockConsumptionResult,
  StockReturnResult,
  StockItemLite,
  ReconciliationItem,
} from '@/types/stock-consumption'

// ─── Livro de Controlados: HISTÓRICO do movimento ───────────────────────────

/**
 * Grava no movimento a fotografia que a folha do Livro de Registro Específico
 * exige (pet, tutor, procedimento, OS, documento) e o(s) lote(s) consumidos.
 * Nunca derruba a baixa: falha aqui vira movimento sem histórico, que o livro
 * ainda imprime com a observação original.
 */
async function gravarHistoricoDoLivro(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  movementId: string,
  book: ConsumeStockPayload['book'],
): Promise<void> {
  const { data: rastro } = await admin
    .from('stock_movement_batches')
    .select('batch:stock_batches ( batch_number )')
    .eq('clinic_id', clinicId)
    .eq('movement_id', movementId)
  const lotes = [...new Set((rastro ?? []).map(r => {
    const b = Array.isArray(r.batch) ? r.batch[0] : r.batch
    return (b as { batch_number?: string | null } | null)?.batch_number ?? null
  }).filter((x): x is string => !!x))]
  const patch: Record<string, string | null> = {}
  if (lotes.length) patch.batch_number = lotes.join(' / ')
  if (book) {
    if (book.os_number !== undefined)       patch.os_number       = book.os_number ?? null
    if (book.patient_name !== undefined)    patch.patient_name    = book.patient_name ?? null
    if (book.tutor_name !== undefined)      patch.tutor_name      = book.tutor_name ?? null
    if (book.procedure_name !== undefined)  patch.procedure_name  = book.procedure_name ?? null
    if (book.document_number !== undefined) patch.document_number = book.document_number ?? null
  }
  if (Object.keys(patch).length === 0) return
  await admin.from('stock_movements').update(patch).eq('id', movementId).eq('clinic_id', clinicId)
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

  if (error) return { error: 'Erro ao baixar estoque: ' + mensagemErro(error, 'lib/actions/stock-consumption.ts') }

  // RPC retorna setof — em chamada via Supabase JS chega como array de 1.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'RPC não retornou linha (estado inconsistente).' }

  // HISTÓRICO do Livro de Controlados: gravado como fotografia no movimento,
  // junto com o(s) lote(s) que a RPC consumiu (rastro de stock_movement_batches).
  await gravarHistoricoDoLivro(admin, profile.clinic_id as string, row.movement_id as string, payload.book ?? null)

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

// ─── Devolução de uma baixa já aplicada ─────────────────────────────────────

/**
 * Devolve ao estoque uma baixa já aplicada, repondo nos lotes exatos de onde ela
 * saiu (rastro de `stock_movement_batches`, migration 0505).
 *
 * Sem `quantity`, devolve tudo o que ainda não voltou — o caso da medicação
 * removida do prontuário. Com `quantity`, devolve parcialmente, rateando sobre
 * os lotes de origem: é o kit cirúrgico, de onde saíram 10 compressas e voltaram
 * 4 (item 4.1).
 *
 * A trava é do banco, não daqui: a soma das devoluções de uma baixa nunca passa
 * do que saiu, e o excesso volta como erro para quem chamou.
 */
export async function returnStockConsumption(
  movementId: string,
  notes?: string | null,
  /** Quanto devolver. Omitido = tudo o que ainda não voltou desta baixa. */
  quantity?: number | null,
): Promise<StockReturnResult | { error: string }> {
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

  const { data, error } = await admin.rpc('rpc_return_stock_consumption', {
    p_clinic_id:   profile.clinic_id,
    p_movement_id: movementId,
    p_user_id:     user.id,
    p_notes:       notes?.trim() || null,
    p_quantity:    quantity && quantity > 0 ? quantity : null,
  })

  if (error) return { error: 'Erro ao devolver ao estoque: ' + mensagemErro(error, 'lib/actions/stock-consumption.ts') }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'RPC de devolução não retornou linha (estado inconsistente).' }

  // A devolução entra no livro com o mesmo HISTÓRICO da saída que ela desfaz.
  const { data: origem } = await admin
    .from('stock_movements')
    .select('os_number, patient_name, tutor_name, procedure_name, document_number')
    .eq('id', movementId)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  if (origem) {
    await gravarHistoricoDoLivro(admin, profile.clinic_id as string, row.movement_id as string, {
      os_number: origem.os_number as string | null, patient_name: origem.patient_name as string | null,
      tutor_name: origem.tutor_name as string | null, procedure_name: origem.procedure_name as string | null,
      document_number: origem.document_number as string | null,
    })
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/vet')

  return {
    movement_id:     row.movement_id as string,
    returned:        Number(row.returned ?? 0),
    quantity_before: row.quantity_before === null ? null : Number(row.quantity_before),
    quantity_after:  row.quantity_after  === null ? null : Number(row.quantity_after),
  }
}

// ─── Busca de stock_items para o dropdown da prescrição ─────────────────────

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
  if (error) return { error: mensagemErro(error, 'lib/actions/stock-consumption.ts') }

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

  if (error) return { error: mensagemErro(error, 'lib/actions/stock-consumption.ts') }
  return (data ?? []) as ReconciliationItem[]
}
