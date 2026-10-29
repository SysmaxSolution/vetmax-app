'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'

import { mensagemErro } from '@/lib/errors'
// ─── Types ───────────────────────────────────────────────────────────────────

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

  if (error) return { error: 'Erro ao buscar estoque: ' + mensagemErro(error, 'lib/actions/stock.ts') }
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

  if (error) return { error: 'Erro ao buscar alertas: ' + mensagemErro(error, 'lib/actions/stock.ts') }
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
  if (error) return { error: 'Erro ao buscar movimentações: ' + mensagemErro(error, 'lib/actions/stock.ts') }
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
    return { error: 'Erro ao cadastrar medicamento: ' + mensagemErro(error, 'lib/actions/stock.ts') }
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

  if (updateErr) return { error: 'Erro ao repor estoque: ' + mensagemErro(updateErr, 'lib/actions/stock.ts') }

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

  if (error) return { error: 'Erro ao ajustar estoque: ' + mensagemErro(error, 'lib/actions/stock.ts') }

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

  if (error) return { error: 'Erro ao remover item: ' + mensagemErro(error, 'lib/actions/stock.ts') }

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

import type { StockCategory } from '@/lib/stock-constants'
import type { StockItem, StockMovement, StockItemV2, BulkImportRow } from '@/types/stock'
// ATENÇÃO (HF 05/06): NUNCA re-exporte tipos (`export type { X } from ...`)
// de um arquivo 'use server' — o Turbopack registra todo export como server
// action em runtime e o re-export vira ReferenceError, derrubando TODAS as
// actions deste módulo (era a causa do "não salva" em Estoque > Serviços).
// Consumidores importam StockCategory direto de '@/lib/stock-constants'.

const STOCK_V2_FIELDS = 'id, clinic_id, name, category, quantity, unit, min_quantity, unit_price, last_restock, created_at, updated_at, is_controlled, is_sellable, substance, concentration, is_human_use, control_class, brand, sku, barcode, batch_number, expiry_date, supplier, is_service, ncm, ncm_description, cfop, unit_com, supplier_id, default_insurance_price, insurance_card_interest_percent, nfse_item_lista_servico, nfse_codigo_tributario_municipio, cost_price, entry_tax_percent, margin_percent, purchase_price, supplier_discount_percent, entry_tax_icms, entry_tax_st, entry_tax_ipi, entry_tax_freight, entry_tax_ibs_cbs, sale_tax_percent'

export async function getPharmacyStockV2(): Promise<StockItemV2[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('stock_items')
    .select(STOCK_V2_FIELDS)
    .eq('clinic_id', ctx.clinic_id)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao buscar estoque: ' + mensagemErro(error, 'lib/actions/stock.ts') }
  return (data ?? []) as StockItemV2[]
}

export async function getLowStockItemsV2(): Promise<StockItemV2[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('stock_items')
    .select(STOCK_V2_FIELDS)
    .eq('clinic_id', ctx.clinic_id)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao buscar alertas: ' + mensagemErro(error, 'lib/actions/stock.ts') }
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
  is_sellable?:   boolean
  substance?:     string | null
  concentration?: string | null
  is_human_use?:  boolean
  control_class?: string | null
  brand?:         string | null
  sku?:           string | null
  barcode?:       string | null
  batch_number?:  string | null
  expiry_date?:   string | null
  supplier?:      string | null
  is_service?:       boolean
  ncm?:              string | null
  ncm_description?:  string | null
  cfop?:             string | null
  unit_com?:         string | null
  default_insurance_price?: number | null
  insurance_card_interest_percent?: number
  nfse_item_lista_servico?:          string | null
  nfse_codigo_tributario_municipio?: string | null
  cost_price?:        number | null
  entry_tax_percent?: number | null
  margin_percent?:    number | null
  purchase_price?:            number | null
  supplier_discount_percent?: number | null
  entry_tax_icms?:    number | null
  entry_tax_st?:      number | null
  entry_tax_ipi?:     number | null
  entry_tax_freight?: number | null
  entry_tax_ibs_cbs?: number | null
  sale_tax_percent?:  number | null
}): Promise<StockItemV2 | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('stock_items')
    .insert({
      clinic_id:       ctx.clinic_id,
      name:            input.name.trim(),
      quantity:        input.quantity,
      unit:            input.unit,
      min_quantity:    input.min_quantity,
      category:        input.category ?? 'medication',
      unit_price:      input.unit_price ?? 0,
      last_restock:    input.quantity > 0 ? new Date().toISOString() : null,
      is_controlled:   input.is_controlled ?? false,
      // Padrão vendável: marcar tudo como insumo faria o PDV amanhecer vazio.
      is_sellable:     input.is_sellable ?? true,
      substance:       input.substance?.trim() || null,
      concentration:   input.concentration?.trim() || null,
      is_human_use:    input.is_human_use ?? false,
      control_class:   input.control_class?.trim() || null,
      is_service:      input.is_service ?? false,
      brand:           input.brand?.trim() || null,
      sku:             input.sku?.trim() || null,
      barcode:         input.barcode?.trim() || null,
      batch_number:    input.batch_number?.trim() || null,
      expiry_date:     input.expiry_date || null,
      supplier:        input.supplier?.trim() || null,
      ncm:             input.ncm?.trim() || null,
      ncm_description: input.ncm_description?.trim() || null,
      cfop:            input.cfop?.trim() || null,
      unit_com:        input.unit_com?.trim() || null,
      default_insurance_price: input.default_insurance_price ?? null,
      insurance_card_interest_percent: input.insurance_card_interest_percent ?? 0,
      nfse_item_lista_servico:          input.nfse_item_lista_servico?.trim() || null,
      nfse_codigo_tributario_municipio: input.nfse_codigo_tributario_municipio?.trim() || null,
      cost_price:        input.cost_price ?? null,
      entry_tax_percent: input.entry_tax_percent ?? null,
      margin_percent:    input.margin_percent ?? null,
      purchase_price:            input.purchase_price ?? null,
      supplier_discount_percent: input.supplier_discount_percent ?? null,
      entry_tax_icms:    input.entry_tax_icms ?? null,
      entry_tax_st:      input.entry_tax_st ?? null,
      entry_tax_ipi:     input.entry_tax_ipi ?? null,
      entry_tax_freight: input.entry_tax_freight ?? null,
      entry_tax_ibs_cbs: input.entry_tax_ibs_cbs ?? null,
      sale_tax_percent:  input.sale_tax_percent ?? null,
    })
    .select(STOCK_V2_FIELDS)
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Item já cadastrado no estoque.' }
    return { error: 'Erro ao cadastrar item: ' + mensagemErro(error, 'lib/actions/stock.ts') }
  }

  // Retroalimentação FIFO: item com saldo inicial já nasce com seu 1º lote.
  if (!(input.is_service ?? false) && input.quantity > 0) {
    await admin.from('stock_batches').insert({
      clinic_id:     ctx.clinic_id,
      stock_item_id: (data as { id: string }).id,
      batch_number:  input.batch_number?.trim() || null,
      expiry_date:   input.expiry_date || null,
      quantity:      input.quantity,
      received_at:   new Date().toISOString(),
      supplier:      input.supplier?.trim() || null,
    })
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
  if (input.is_sellable   !== undefined) patch.is_sellable   = input.is_sellable
  if (input.is_controlled !== undefined) patch.is_controlled = input.is_controlled
  if ('substance'     in input) patch.substance     = (input as any).substance?.trim()     || null
  if ('concentration' in input) patch.concentration = (input as any).concentration?.trim() || null
  if (input.is_human_use !== undefined) patch.is_human_use = input.is_human_use
  if ('control_class' in input) patch.control_class = (input as any).control_class?.trim() || null
  if ('brand'        in input) patch.brand        = input.brand?.trim()        || null
  if ('sku'          in input) patch.sku          = input.sku?.trim()          || null
  if ('barcode'      in input) patch.barcode      = input.barcode?.trim()      || null
  if ('batch_number' in input) patch.batch_number = input.batch_number?.trim() || null
  if ('expiry_date'  in input) patch.expiry_date  = input.expiry_date          || null
  if ('supplier'         in input) patch.supplier         = input.supplier?.trim()         || null
  if (input.is_service !== undefined) patch.is_service = input.is_service
  if ('ncm'             in input) patch.ncm             = (input as any).ncm?.trim()             || null
  if ('ncm_description' in input) patch.ncm_description = (input as any).ncm_description?.trim() || null
  if ('cfop'            in input) patch.cfop            = (input as any).cfop?.trim()            || null
  if ('unit_com'        in input) patch.unit_com        = (input as any).unit_com?.trim()        || null
  if ('default_insurance_price' in input) patch.default_insurance_price = (input as any).default_insurance_price ?? null
  if ('insurance_card_interest_percent' in input) patch.insurance_card_interest_percent = (input as any).insurance_card_interest_percent ?? 0
  if ('nfse_item_lista_servico'          in input) patch.nfse_item_lista_servico          = (input as any).nfse_item_lista_servico?.trim()          || null
  if ('nfse_codigo_tributario_municipio' in input) patch.nfse_codigo_tributario_municipio = (input as any).nfse_codigo_tributario_municipio?.trim() || null
  if ('cost_price'        in input) patch.cost_price        = (input as any).cost_price        ?? null
  if ('entry_tax_percent' in input) patch.entry_tax_percent = (input as any).entry_tax_percent ?? null
  if ('margin_percent'    in input) patch.margin_percent    = (input as any).margin_percent    ?? null
  if ('purchase_price'            in input) patch.purchase_price            = (input as any).purchase_price            ?? null
  if ('supplier_discount_percent' in input) patch.supplier_discount_percent = (input as any).supplier_discount_percent ?? null
  if ('entry_tax_icms'    in input) patch.entry_tax_icms    = (input as any).entry_tax_icms    ?? null
  if ('entry_tax_st'      in input) patch.entry_tax_st      = (input as any).entry_tax_st      ?? null
  if ('entry_tax_ipi'     in input) patch.entry_tax_ipi     = (input as any).entry_tax_ipi     ?? null
  if ('entry_tax_freight' in input) patch.entry_tax_freight = (input as any).entry_tax_freight ?? null
  if ('entry_tax_ibs_cbs' in input) patch.entry_tax_ibs_cbs = (input as any).entry_tax_ibs_cbs ?? null
  if ('sale_tax_percent'  in input) patch.sale_tax_percent  = (input as any).sale_tax_percent  ?? null

  const { data, error } = await admin
    .from('stock_items')
    .update(patch)
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)
    .select(STOCK_V2_FIELDS)
    .single()

  if (error) return { error: 'Erro ao atualizar item: ' + mensagemErro(error, 'lib/actions/stock.ts') }

  revalidatePath('/dashboard/pharmacy')
  return data as StockItemV2
}

export async function restockItemV2(
  itemId:      string,
  quantityToAdd: number,
  notes?:      string,
  opts?:       { expiryDate?: string | null; batchNumber?: string | null; supplier?: string | null; documentNumber?: string | null },
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
  if (!(quantityToAdd > 0)) return { error: 'A quantidade da entrada deve ser maior que zero.' }

  // Retroalimentação FIFO: a entrada de saldo cria um NOVO lote em stock_batches
  // com a validade informada, mantendo a roda do FIFO girando. Se o item ainda
  // não tem lotes, cria um lote-base com o saldo atual para o espelho
  // stock_items.quantity = SUM(lotes) permanecer consistente.
  const { count: batchCount } = await admin
    .from('stock_batches').select('id', { count: 'exact', head: true }).eq('stock_item_id', itemId)
  if ((batchCount ?? 0) === 0 && qtyBefore !== 0) {
    await admin.from('stock_batches').insert({
      clinic_id: ctx.clinic_id, stock_item_id: itemId, quantity: qtyBefore, received_at: new Date().toISOString(),
    })
  }
  await admin.from('stock_batches').insert({
    clinic_id:    ctx.clinic_id,
    stock_item_id: itemId,
    batch_number: opts?.batchNumber?.trim() || null,
    expiry_date:  opts?.expiryDate || null,
    quantity:     quantityToAdd,
    received_at:  new Date().toISOString(),
  })

  // Espelha o somatório dos lotes (fonte da verdade = SUM dos batches).
  const { data: batches } = await admin
    .from('stock_batches').select('quantity').eq('stock_item_id', itemId)
  const qtyAfter = (batches ?? []).reduce((s, b) => s + Number(b.quantity ?? 0), 0)

  const { error } = await admin
    .from('stock_items')
    .update({ quantity: qtyAfter, last_restock: new Date().toISOString() })
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao repor estoque: ' + mensagemErro(error, 'lib/actions/stock.ts') }

  // O movimento aponta para o item (antes saía sem stock_item_id e não entrava
  // na razão do Livro de Controlados) e leva o HISTÓRICO da entrada.
  await admin.from('stock_movements').insert({
    clinic_id:       ctx.clinic_id,
    stock_item_id:   itemId,
    medication_name: current.name,
    movement_type:   'CREDIT',
    quantity_change: quantityToAdd,
    quantity_before: qtyBefore,
    quantity_after:  qtyAfter,
    source:          'RESTOCK',
    notes:           notes ?? null,
    created_by:      ctx.user.id,
    counterparty:    opts?.supplier?.trim() || null,
    document_number: opts?.documentNumber?.trim() || null,
    batch_number:    opts?.batchNumber?.trim() || null,
    expires_at:      opts?.expiryDate || null,
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

  if (error) return { error: 'Erro ao ajustar estoque: ' + mensagemErro(error, 'lib/actions/stock.ts') }

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

/**
 * Soft-delete de stock_items. DELETE físico falha por FK em consultation_services,
 * stock_movements, invoice_items etc. Marca archived_at e remove das listagens
 * operacionais — preserva histórico e relatórios. Reversível via UPDATE.
 */
export async function deleteStockItemV2(itemId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('stock_items')
    .update({ archived_at: new Date().toISOString(), archived_by: ctx.user.id })
    .eq('id', itemId)
    .eq('clinic_id', ctx.clinic_id)
    .is('archived_at', null)

  if (error) return { error: 'Erro ao remover item: ' + mensagemErro(error, 'lib/actions/stock.ts') }

  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

// ─── Importação em massa (CSV) ────────────────────────────────────────────────

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
    else if (error) return { error: `Erro em "${row.name}": ${mensagemErro(error, 'lib/actions/stock.ts')}` }
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

  if (error) return { error: 'Erro ao dispensar: ' + mensagemErro(error, 'lib/actions/stock.ts') }

  revalidatePath('/dashboard/pharmacy')
  return { success: true, new_quantity: qtyAfter }
}

// ─── Abatimento Automático (chamado internamente) ─────────────────────────────

/**
 * Baixa automatica por NOME do medicamento, usada pelos caminhos que nao tem o
 * item de estoque em maos (hoje: a evolucao da internacao, que guarda medicacao
 * como texto num JSONB).
 *
 * Historico que explica a reescrita: a versao anterior procurava o item em
 * `pharmacy_stock` — tabela legada que a propria migration 0186 declara vazia —,
 * baixava sempre 1 unidade e inseria em `stock_movements` um `stock_item_id`
 * vindo dali, enquanto a FK dessa coluna aponta para `stock_items` desde a 0186.
 * O INSERT violava a FK e o erro morria num try/catch. Resultado medido em
 * 17/10/2026: zero movimentos de consulta ou internacao em dev e em producao.
 *
 * Agora casa em `stock_items` e delega para `rpc_apply_stock_consumption`, que
 * consome lote FIFO, respeita validade, grava o rastro de lote e marca
 * divergencia quando o item nao e reconhecido ou o saldo fica negativo.
 *
 * Continua sem lancar excecao — o fluxo clinico nao pode cair por causa de
 * estoque —, mas devolve o que aconteceu para quem quiser mostrar na tela.
 */
export async function deductStockForMedication(params: {
  clinicId: string
  userId: string
  medicationName: string
  source: 'CONSULTATION' | 'HOSPITALIZATION'
  referenceId: string  // consultation_id ou hospitalization_record_id
  /** Quantidade aplicada. Padrao 1 — e o que os caminhos legados sabem informar. */
  quantity?: number
  notes?: string | null
}): Promise<{ matched: boolean; quantity_after: number | null; requires_reconciliation: boolean } | { error: string }> {
  try {
    const admin = createAdminClient()
    const nome = params.medicationName.trim()
    if (!nome) return { error: 'medication_name vazio.' }

    const quantidade = params.quantity && params.quantity > 0 ? params.quantity : 1

    // Casa pelo nome em stock_items (nao-servico). ILIKE exato primeiro; sem
    // match, a RPC registra a saida como divergencia em vez de ignorar.
    const { data: candidatos } = await admin
      .from('stock_items')
      .select('id, name')
      .eq('clinic_id', params.clinicId)
      .eq('is_service', false)
      .ilike('name', nome)
      .limit(2)

    const itemId = (candidatos ?? []).length === 1 ? (candidatos as { id: string }[])[0].id : null

    const { data, error } = await admin.rpc('rpc_apply_stock_consumption', {
      p_clinic_id:       params.clinicId,
      p_stock_item_id:   itemId,
      p_medication_name: nome,
      p_quantity:        quantidade,
      p_source:          params.source,
      p_reference_id:    params.referenceId,
      p_notes:           params.notes?.trim() || null,
      p_user_id:         params.userId,
    })

    if (error) return { error: mensagemErro(error, 'lib/actions/stock.ts') }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { error: 'RPC de consumo nao retornou linha.' }

    return {
      matched:                 Boolean(row.matched),
      quantity_after:          row.quantity_after === null ? null : Number(row.quantity_after),
      requires_reconciliation: Boolean(row.requires_reconciliation),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao baixar estoque.' }
  }
}
