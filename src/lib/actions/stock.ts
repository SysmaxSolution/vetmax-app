'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StockItem = {
  id: string
  clinic_id: string
  medication_name: string
  quantity: number
  unit: string
  min_stock_level: number
  last_restock: string | null
  created_at: string
  updated_at: string
}

export type StockMovement = {
  id: string
  clinic_id: string
  stock_item_id: string | null
  medication_name: string
  movement_type: 'DEBIT' | 'CREDIT' | 'ADJUSTMENT'
  quantity_change: number
  quantity_before: number | null
  quantity_after: number | null
  source: 'CONSULTATION' | 'HOSPITALIZATION' | 'MANUAL_ADJUSTMENT' | 'INITIAL_STOCK' | 'RESTOCK' | null
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

// ─── Helpers Internos ────────────────────────────────────────────────────────

async function getClinicAndUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return null
  return { user, clinic_id: profile.clinic_id as string, supabase }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function getPharmacyStock(): Promise<StockItem[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('pharmacy_stock')
    .select('id, clinic_id, medication_name, quantity, unit, min_stock_level, last_restock, created_at, updated_at')
    .eq('clinic_id', ctx.clinic_id)
    .order('medication_name', { ascending: true })

  if (error) return { error: 'Erro ao buscar estoque: ' + error.message }
  return (data ?? []) as StockItem[]
}

export async function getLowStockItems(): Promise<StockItem[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  // Filtragem client-side: Supabase não suporta comparação entre duas colunas via .lt
  const { data, error } = await ctx.supabase
    .from('pharmacy_stock')
    .select('id, clinic_id, medication_name, quantity, unit, min_stock_level, last_restock, created_at, updated_at')
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao buscar alertas: ' + error.message }
  return ((data ?? []) as StockItem[]).filter(item => Number(item.quantity) < Number(item.min_stock_level))
}

export async function getLowStockCount(clinicId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('pharmacy_stock')
    .select('id, quantity, min_stock_level')
    .eq('clinic_id', clinicId)

  if (!data) return 0
  return data.filter(item => item.quantity < item.min_stock_level).length
}

export async function getStockMovements(stockItemId?: string): Promise<StockMovement[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  let query = ctx.supabase
    .from('stock_movements')
    .select('id, clinic_id, stock_item_id, medication_name, movement_type, quantity_change, quantity_before, quantity_after, source, reference_id, notes, created_by, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (stockItemId) query = query.eq('stock_item_id', stockItemId)

  const { data, error } = await query
  if (error) return { error: 'Erro ao buscar movimentações: ' + error.message }
  return (data ?? []) as StockMovement[]
}

// ─── Criação / Reposição ──────────────────────────────────────────────────────

export async function addStockItem(input: {
  medication_name: string
  quantity: number
  unit: string
  min_stock_level: number
}): Promise<StockItem | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  // Upsert — se já existe, só atualiza initial quantity
  const { data, error } = await admin
    .from('pharmacy_stock')
    .insert({
      clinic_id:       ctx.clinic_id,
      medication_name: input.medication_name.trim(),
      quantity:        input.quantity,
      unit:            input.unit,
      min_stock_level: input.min_stock_level,
      last_restock:    input.quantity > 0 ? new Date().toISOString() : null,
    })
    .select('id, clinic_id, medication_name, quantity, unit, min_stock_level, last_restock, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Medicamento já cadastrado no estoque.' }
    return { error: 'Erro ao cadastrar medicamento: ' + error.message }
  }

  // Registra movimento inicial
  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    stock_item_id:   data.id,
    medication_name: data.medication_name,
    movement_type:   'CREDIT',
    quantity_change: input.quantity,
    quantity_before: 0,
    quantity_after:  input.quantity,
    source:          'INITIAL_STOCK',
    notes:           'Cadastro inicial de estoque',
    created_by:      ctx.user.id,
  })

  await logAudit({
    action: 'STOCK_ADD_ITEM',
    entity_type: 'pharmacy_stock',
    entity_id: data.id,
    details: { medication_name: data.medication_name, quantity: input.quantity, unit: input.unit },
  })

  revalidatePath('/dashboard/pharmacy')
  return data as StockItem
}

export async function restockItem(
  stockItemId: string,
  quantityToAdd: number,
  notes?: string
): Promise<{ success: true; new_quantity: number } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  // Busca quantidade atual
  const { data: current, error: fetchErr } = await admin
    .from('pharmacy_stock')
    .select('id, medication_name, quantity, clinic_id')
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (fetchErr || !current) return { error: 'Item de estoque não encontrado.' }

  const qtyBefore = Number(current.quantity)
  const qtyAfter  = qtyBefore + quantityToAdd

  const { error: updateErr } = await admin
    .from('pharmacy_stock')
    .update({ quantity: qtyAfter, last_restock: new Date().toISOString() })
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)

  if (updateErr) return { error: 'Erro ao repor estoque: ' + updateErr.message }

  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    stock_item_id:   stockItemId,
    medication_name: current.medication_name,
    movement_type:   'CREDIT',
    quantity_change: quantityToAdd,
    quantity_before: qtyBefore,
    quantity_after:  qtyAfter,
    source:          'RESTOCK',
    notes:           notes ?? null,
    created_by:      ctx.user.id,
  })

  await logAudit({
    action: 'STOCK_RESTOCK',
    entity_type: 'pharmacy_stock',
    entity_id: stockItemId,
    details: { medication_name: current.medication_name, quantity_added: quantityToAdd, qty_before: qtyBefore, qty_after: qtyAfter },
  })

  revalidatePath('/dashboard/pharmacy')
  return { success: true, new_quantity: qtyAfter }
}

export async function adjustStockItem(
  stockItemId: string,
  newQuantity: number,
  notes: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: current } = await admin
    .from('pharmacy_stock')
    .select('medication_name, quantity, clinic_id')
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!current) return { error: 'Item não encontrado.' }

  const qtyBefore = Number(current.quantity)
  const change = newQuantity - qtyBefore

  const { error } = await admin
    .from('pharmacy_stock')
    .update({ quantity: newQuantity })
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao ajustar estoque: ' + error.message }

  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    stock_item_id:   stockItemId,
    medication_name: current.medication_name,
    movement_type:   'ADJUSTMENT',
    quantity_change: change,
    quantity_before: qtyBefore,
    quantity_after:  newQuantity,
    source:          'MANUAL_ADJUSTMENT',
    notes,
    created_by:      ctx.user.id,
  })

  await logAudit({
    action: 'STOCK_ADJUST',
    entity_type: 'pharmacy_stock',
    entity_id: stockItemId,
    details: { medication_name: current.medication_name, qty_before: qtyBefore, qty_after: newQuantity, notes },
  })

  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

export async function deleteStockItem(stockItemId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: item } = await ctx.supabase
    .from('pharmacy_stock')
    .select('medication_name')
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  const { error } = await ctx.supabase
    .from('pharmacy_stock')
    .delete()
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao remover item: ' + error.message }

  await logAudit({
    action: 'STOCK_DELETE_ITEM',
    entity_type: 'pharmacy_stock',
    entity_id: stockItemId,
    details: { medication_name: item?.medication_name ?? 'desconhecido' },
  })

  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

// ─── Funções para tabela stock_items ─────────────────────────────────────────

export type StockCategory =
  | 'medication'
  | 'controlled_medication'
  | 'clinic_product'
  | 'petshop'
  | 'grooming_supply'
  | 'aesthetics'
  | 'other'
  // Serviços e procedimentos (is_service = true)
  | 'service'
  | 'exam'

export const SERVICE_CATEGORIES: StockCategory[] = ['service', 'exam']
export const PRODUCT_CATEGORIES: StockCategory[] = [
  'medication', 'controlled_medication', 'clinic_product',
  'petshop', 'grooming_supply', 'aesthetics', 'other',
]

export type StockItemV2 = {
  id:           string
  clinic_id:    string
  name:         string
  category:     StockCategory
  quantity:     number
  unit:         string
  min_quantity: number
  unit_price:   number
  last_restock: string | null
  created_at:   string
  updated_at:   string
  // migration 0099
  is_controlled: boolean
  brand:         string | null
  sku:           string | null
  barcode:       string | null
  batch_number:  string | null
  expiry_date:   string | null
  supplier:      string | null
  // migration 0100
  is_service:    boolean
}

const STOCK_V2_FIELDS = 'id, clinic_id, name, category, quantity, unit, min_quantity, unit_price, last_restock, created_at, updated_at, is_controlled, brand, sku, barcode, batch_number, expiry_date, supplier, is_service'

export async function getPharmacyStockV2(): Promise<StockItemV2[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('stock_items')
    .select(STOCK_V2_FIELDS)
    .eq('clinic_id', ctx.clinic_id)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao buscar estoque: ' + error.message }
  return (data ?? []) as StockItemV2[]
}

export async function getLowStockItemsV2(): Promise<StockItemV2[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('stock_items')
    .select(STOCK_V2_FIELDS)
    .eq('clinic_id', ctx.clinic_id)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao buscar alertas: ' + error.message }
  return ((data ?? []) as StockItemV2[]).filter(item => Number(item.quantity) <= Number(item.min_quantity))
}

export async function addStockItemV2(input: {
  name:           string
  quantity:       number
  unit:           string
  min_quantity:   number
  category?:      StockCategory
  unit_price?:    number
  is_controlled?: boolean
  brand?:         string | null
  sku?:           string | null
  barcode?:       string | null
  batch_number?:  string | null
  expiry_date?:   string | null
  supplier?:      string | null
  is_service?:    boolean
}): Promise<StockItemV2 | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('stock_items')
    .insert({
      clinic_id:     ctx.clinic_id,
      name:          input.name.trim(),
      quantity:      input.quantity,
      unit:          input.unit,
      min_quantity:  input.min_quantity,
      category:      input.category ?? 'medication',
      unit_price:    input.unit_price ?? 0,
      last_restock:  input.quantity > 0 ? new Date().toISOString() : null,
      is_controlled: input.is_controlled ?? false,
      is_service:    input.is_service ?? false,
      brand:         input.brand?.trim() || null,
      sku:           input.sku?.trim() || null,
      barcode:       input.barcode?.trim() || null,
      batch_number:  input.batch_number?.trim() || null,
      expiry_date:   input.expiry_date || null,
      supplier:      input.supplier?.trim() || null,
    })
    .select(STOCK_V2_FIELDS)
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Item já cadastrado no estoque.' }
    return { error: 'Erro ao cadastrar item: ' + error.message }
  }

  revalidatePath('/dashboard/pharmacy')
  return data as StockItemV2
}

export async function updateStockItemV2(
  itemId: string,
  input: Partial<Omit<StockItemV2, 'id' | 'clinic_id' | 'created_at' | 'updated_at' | 'last_restock' | 'quantity'>>
): Promise<StockItemV2 | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (input.name          !== undefined) patch.name          = input.name.trim()
  if (input.category      !== undefined) patch.category      = input.category
  if (input.unit          !== undefined) patch.unit          = input.unit
  if (input.min_quantity  !== undefined) patch.min_quantity  = input.min_quantity
  if (input.unit_price    !== undefined) patch.unit_price    = input.unit_price
  if (input.is_controlled !== undefined) patch.is_controlled = input.is_controlled
  if ('brand'        in input) patch.brand        = input.brand?.trim()        || null
  if ('sku'          in input) patch.sku          = input.sku?.trim()          || null
  if ('barcode'      in input) patch.barcode      = input.barcode?.trim()      || null
  if ('batch_number' in input) patch.batch_number = input.batch_number?.trim() || null
  if ('expiry_date'  in input) patch.expiry_date  = input.expiry_date          || null
  if ('supplier'     in input) patch.supplier     = input.supplier?.trim()     || null
  if (input.is_service !== undefined) patch.is_service = input.is_service

  const { data, error } = await admin
    .from('stock_items')
    .update(patch)
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)
    .select(STOCK_V2_FIELDS)
    .single()

  if (error) return { error: 'Erro ao atualizar item: ' + error.message }

  revalidatePath('/dashboard/pharmacy')
  return data as StockItemV2
}

export async function restockItemV2(
  itemId:      string,
  quantityToAdd: number,
  notes?:      string
): Promise<{ success: true; new_quantity: number } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: current } = await admin
    .from('stock_items')
    .select('id, name, quantity, clinic_id')
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!current) return { error: 'Item não encontrado.' }

  const qtyBefore = Number(current.quantity)
  const qtyAfter  = qtyBefore + quantityToAdd

  const { error } = await admin
    .from('stock_items')
    .update({ quantity: qtyAfter, last_restock: new Date().toISOString() })
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao repor estoque: ' + error.message }

  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    medication_name: current.name,
    movement_type:   'CREDIT',
    quantity_change: quantityToAdd,
    quantity_before: qtyBefore,
    quantity_after:  qtyAfter,
    source:          'RESTOCK',
    notes:           notes ?? null,
    created_by:      ctx.user.id,
  })

  revalidatePath('/dashboard/pharmacy')
  return { success: true, new_quantity: qtyAfter }
}

export async function adjustStockItemV2(
  itemId:      string,
  newQuantity: number,
  notes:       string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: current } = await admin
    .from('stock_items')
    .select('name, quantity, clinic_id')
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!current) return { error: 'Item não encontrado.' }

  const qtyBefore = Number(current.quantity)

  const { error } = await admin
    .from('stock_items')
    .update({ quantity: newQuantity })
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao ajustar estoque: ' + error.message }

  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    medication_name: current.name,
    movement_type:   'ADJUSTMENT',
    quantity_change: newQuantity - qtyBefore,
    quantity_before: qtyBefore,
    quantity_after:  newQuantity,
    source:          'MANUAL_ADJUSTMENT',
    notes,
    created_by:      ctx.user.id,
  })

  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

export async function deleteStockItemV2(itemId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('stock_items')
    .delete()
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao remover item: ' + error.message }

  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

// ─── Importação em massa (CSV) ────────────────────────────────────────────────

export type BulkImportRow = {
  name:          string
  category:      StockCategory
  quantity:      number
  unit:          string
  unit_price:    number
  min_quantity:  number
  is_service:    boolean
  is_controlled: boolean
  brand:         string | null
  sku:           string | null
  barcode:       string | null
  batch_number:  string | null
  expiry_date:   string | null
  supplier:      string | null
}

export async function bulkImportStockItems(
  rows: BulkImportRow[]
): Promise<{ inserted: number; skipped: number } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  let inserted = 0
  let skipped  = 0

  for (const row of rows) {
    const { error } = await admin.from('stock_items').insert({
      clinic_id:     ctx.clinic_id,
      name:          row.name.trim(),
      category:      row.category,
      quantity:      row.is_service ? 0 : row.quantity,
      unit:          row.unit || 'un',
      min_quantity:  row.is_service ? 0 : row.min_quantity,
      unit_price:    row.unit_price,
      is_service:    row.is_service,
      is_controlled: row.is_controlled,
      brand:         row.brand || null,
      sku:           row.sku || null,
      barcode:       row.barcode || null,
      batch_number:  row.batch_number || null,
      expiry_date:   row.expiry_date || null,
      supplier:      row.supplier || null,
      last_restock:  !row.is_service && row.quantity > 0 ? new Date().toISOString() : null,
    })
    if (error?.code === '23505') skipped++  // duplicata
    else if (error) return { error: `Erro em "${row.name}": ${error.message}` }
    else inserted++
  }

  revalidatePath('/dashboard/pharmacy')
  return { inserted, skipped }
}

export async function dispenseStockItem(
  stockItemId: string,
  quantity: number,
  notes?: string
): Promise<{ success: true; new_quantity: number } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: current } = await admin
    .from('stock_items')
    .select('id, name, quantity, clinic_id')
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!current) return { error: 'Item não encontrado.' }

  const qtyBefore = Number(current.quantity)
  if (qtyBefore < quantity) return { error: 'Quantidade insuficiente em estoque.' }
  const qtyAfter = qtyBefore - quantity

  const { error } = await admin
    .from('stock_items')
    .update({ quantity: qtyAfter })
    .eq('id', stockItemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao dispensar: ' + error.message }

  revalidatePath('/dashboard/pharmacy')
  return { success: true, new_quantity: qtyAfter }
}

// ─── Abatimento Automático (chamado internamente) ─────────────────────────────

/**
 * Tenta encontrar o item de estoque pelo nome do medicamento (case-insensitive)
 * e decrementa 1 unidade. Registra movimentação de saída e audit log.
 * Nunca lança erro — falha silenciosa para não bloquear o fluxo clínico.
 */
export async function deductStockForMedication(params: {
  clinicId: string
  userId: string
  medicationName: string
  source: 'CONSULTATION' | 'HOSPITALIZATION'
  referenceId: string  // consultation_id ou hospitalization_record_id
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const nameLower = params.medicationName.trim().toLowerCase()

    // Busca todos os itens da clínica e filtra por nome (case-insensitive)
    const { data: items } = await admin
      .from('pharmacy_stock')
      .select('id, medication_name, quantity')
      .eq('clinic_id', params.clinicId)

    if (!items || items.length === 0) return

    const match = items.find(
      item => item.medication_name.trim().toLowerCase() === nameLower
    )
    if (!match) return // Medicamento não cadastrado no estoque — ignora

    const qtyBefore = Number(match.quantity)
    if (qtyBefore <= 0) {
      // Estoque zerado — registra movimento de débito zerado (para auditoria)
      await admin.from('stock_movements').insert({
        clinic_id:       params.clinicId,
        stock_item_id:   match.id,
        medication_name: match.medication_name,
        movement_type:   'DEBIT',
        quantity_change: 0,
        quantity_before: 0,
        quantity_after:  0,
        source:          params.source,
        reference_id:    params.referenceId,
        notes:           'Estoque esgotado no momento da aplicação',
        created_by:      params.userId,
      })
      return
    }

    const qtyAfter = qtyBefore - 1

    // Decrementa
    await admin
      .from('pharmacy_stock')
      .update({ quantity: qtyAfter })
      .eq('id', match.id)
      .eq('clinic_id', params.clinicId)

    // Registra movimentação (Audit Trail de estoque)
    await admin.from('stock_movements').insert({
      clinic_id:       params.clinicId,
      stock_item_id:   match.id,
      medication_name: match.medication_name,
      movement_type:   'DEBIT',
      quantity_change: 1,
      quantity_before: qtyBefore,
      quantity_after:  qtyAfter,
      source:          params.source,
      reference_id:    params.referenceId,
      notes:           null,
      created_by:      params.userId,
    })

    // Audit log geral (integrado com o Audit Trail existente)
    await admin.from('audit_logs').insert({
      clinic_id:   params.clinicId,
      user_id:     params.userId,
      action:      'STOCK_DEBIT',
      entity_type: 'pharmacy_stock',
      entity_id:   match.id,
      details: {
        medication_name: match.medication_name,
        qty_before:      qtyBefore,
        qty_after:       qtyAfter,
        source:          params.source,
        reference_id:    params.referenceId,
      },
    })

  } catch (err) {
    // Nunca bloqueia o fluxo clínico
    console.error('[Stock] Falha no abatimento automático:', err)
  }
}
