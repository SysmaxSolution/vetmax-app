'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { parseNFeXML } from '@/lib/utils/nfe-parser'
import type { ParsedNFe } from '@/lib/utils/nfe-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id:           string
  clinic_id:    string
  supplier_id:  string | null
  nfe_key:      string | null
  nfe_number:   string | null
  nfe_series:   string | null
  issue_date:   string | null
  total_value:  number | null
  status:       'pending' | 'received' | 'cancelled'
  notes:        string | null
  created_at:   string
  updated_at:   string
  supplier?:    { id: string; name: string; document: string | null } | null
  items?:       PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id:                 string
  purchase_order_id:  string
  stock_item_id:      string | null
  description:        string
  ncm:                string | null
  ean:                string | null
  cfop:               string | null
  quantity:           number
  unit:               string | null
  unit_price:         number
  total_price:        number
  tax_icms:           number | null
  tax_pis:            number | null
  tax_cofins:         number | null
  is_matched:         boolean
}

export interface NCMData {
  code:        string
  description: string
  chapter?:    string
}

export interface PublicProduct {
  description: string
  ncm?:        string
  brand?:      string
  unit?:       string
  source:      string
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string, supabase }
}

// ─── Import NF-e XML ──────────────────────────────────────────────────────────

export async function importNFeXML(
  xmlContent: string,
): Promise<PurchaseOrder | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem importar NF-e.' }
  }

  const parsed = parseNFeXML(xmlContent)
  if ('error' in parsed) return parsed

  const admin = createAdminClient()

  // Upsert fornecedor por CNPJ
  let supplier_id: string | null = null
  if (parsed.supplier.cnpj) {
    const { data: existing } = await admin
      .from('suppliers')
      .select('id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('document', parsed.supplier.cnpj)
      .maybeSingle()

    if (existing) {
      await admin.from('suppliers').update({
        name:             parsed.supplier.name,
        ie:               parsed.supplier.ie   ?? null,
        city:             parsed.supplier.city  ?? null,
        state:            parsed.supplier.state ?? null,
        zip_code:         parsed.supplier.zip_code ?? null,
        address:          parsed.supplier.address ?? null,
        updated_at:       new Date().toISOString(),
      }).eq('id', existing.id)
      supplier_id = existing.id
    } else {
      const { data: created } = await admin.from('suppliers').insert({
        clinic_id:    ctx.clinic_id,
        name:         parsed.supplier.name,
        document:     parsed.supplier.cnpj,
        category:     'outros' as const,
        ie:           parsed.supplier.ie   ?? null,
        city:         parsed.supplier.city  ?? null,
        state:        parsed.supplier.state ?? null,
        zip_code:     parsed.supplier.zip_code ?? null,
        address:      parsed.supplier.address ?? null,
        is_active:    true,
        created_by:   ctx.user_id,
      }).select('id').single()
      supplier_id = created?.id ?? null
    }
  }

  // Criar purchase_order
  const { data: order, error: orderErr } = await admin
    .from('purchase_orders')
    .insert({
      clinic_id:   ctx.clinic_id,
      supplier_id,
      nfe_key:     parsed.nfe_key   || null,
      nfe_number:  parsed.nfe_number || null,
      nfe_series:  parsed.nfe_series || null,
      issue_date:  parsed.issue_date || null,
      total_value: parsed.total_value,
      status:      'pending',
      xml_content: xmlContent,
      created_by:  ctx.user_id,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    return { error: `Erro ao criar ordem de compra: ${orderErr?.message ?? ''}` }
  }

  // Inserir itens + auto-match por EAN
  for (const item of parsed.items) {
    let stock_item_id: string | null = null
    let is_matched = false

    if (item.ean) {
      const { data: found } = await admin
        .from('stock_items')
        .select('id')
        .eq('clinic_id', ctx.clinic_id)
        .eq('barcode', item.ean)
        .maybeSingle()
      if (found) { stock_item_id = found.id; is_matched = true }
    }

    if (!stock_item_id) {
      const { data: found } = await admin
        .from('stock_items')
        .select('id')
        .eq('clinic_id', ctx.clinic_id)
        .ilike('name', item.description.substring(0, 30))
        .maybeSingle()
      if (found) { stock_item_id = found.id; is_matched = true }
    }

    await admin.from('purchase_order_items').insert({
      purchase_order_id: order.id,
      stock_item_id,
      description:  item.description,
      ncm:          item.ncm  || null,
      ean:          item.ean  || null,
      cfop:         item.cfop || null,
      quantity:     item.quantity,
      unit:         item.unit || null,
      unit_price:   item.unit_price,
      total_price:  item.total_price,
      tax_icms:     item.tax_icms   ?? null,
      tax_pis:      item.tax_pis    ?? null,
      tax_cofins:   item.tax_cofins ?? null,
      is_matched,
    })
  }

  revalidatePath('/dashboard/purchases')
  return getOrderWithItems(order.id, ctx.clinic_id)
}

// ─── Get order with items ─────────────────────────────────────────────────────

async function getOrderWithItems(
  orderId: string,
  clinicId: string,
): Promise<PurchaseOrder | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, document),
      items:purchase_order_items(*)
    `)
    .eq('id', orderId)
    .eq('clinic_id', clinicId)
    .single()
  if (error || !data) return { error: 'Ordem não encontrada.' }
  return data as unknown as PurchaseOrder
}

// ─── List orders ──────────────────────────────────────────────────────────────

export async function listPurchaseOrders(filters?: {
  status?: 'pending' | 'received' | 'cancelled'
  supplier_id?: string
}): Promise<PurchaseOrder[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  let q = ctx.supabase
    .from('purchase_orders')
    .select(`
      id, clinic_id, supplier_id, nfe_key, nfe_number, nfe_series,
      issue_date, total_value, status, notes, created_at, updated_at,
      supplier:suppliers(id, name, document)
    `)
    .eq('clinic_id', ctx.clinic_id)
    .order('created_at', { ascending: false })

  if (filters?.status)      q = q.eq('status', filters.status)
  if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)

  const { data, error } = await q.limit(100)
  if (error) return { error: error.message }
  return (data ?? []) as unknown as PurchaseOrder[]
}

// ─── Get single order ─────────────────────────────────────────────────────────

export async function getPurchaseOrder(
  orderId: string,
): Promise<PurchaseOrder | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  return getOrderWithItems(orderId, ctx.clinic_id)
}

// ─── Confirm receipt (atualiza estoque) ──────────────────────────────────────

export async function confirmPurchaseReceipt(
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem confirmar recebimento.' }
  }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('purchase_orders')
    .select('id, status, clinic_id, items:purchase_order_items(*)')
    .eq('id', orderId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!order) return { error: 'Ordem não encontrada.' }
  if (order.status === 'received') return { error: 'Esta ordem já foi recebida.' }
  if (order.status === 'cancelled') return { error: 'Ordem cancelada não pode ser recebida.' }

  const items = (order as any).items as PurchaseOrderItem[]

  for (const item of items) {
    if (!item.stock_item_id) continue

    // Atualizar preço e quantidade do item no estoque
    const { data: stock } = await admin
      .from('stock_items')
      .select('quantity, unit_price')
      .eq('id', item.stock_item_id)
      .single()

    if (!stock) continue

    const newQty = (stock.quantity ?? 0) + item.quantity

    await admin.from('stock_items').update({
      quantity:     newQty,
      unit_price:   item.unit_price,
      last_restock: new Date().toISOString(),
      ncm:          item.ncm  || undefined,
      updated_at:   new Date().toISOString(),
    }).eq('id', item.stock_item_id)

    // Registrar movimento de estoque
    await admin.from('stock_movements').insert({
      clinic_id:     ctx.clinic_id,
      stock_item_id: item.stock_item_id,
      type:          'CREDIT',
      quantity:      item.quantity,
      reason:        `Recebimento NF-e — Ordem #${orderId.substring(0, 8)}`,
      created_by:    ctx.user_id,
    })
  }

  await admin.from('purchase_orders').update({
    status:     'received',
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)

  revalidatePath('/dashboard/purchases')
  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

// ─── Match item to stock ──────────────────────────────────────────────────────

export async function matchItemToStock(
  itemId: string,
  stockItemId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const admin = createAdminClient()
  const { error } = await admin
    .from('purchase_order_items')
    .update({ stock_item_id: stockItemId, is_matched: true })
    .eq('id', itemId)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Auto-create stock from item ──────────────────────────────────────────────

export async function autoCreateStockFromItem(
  itemId: string,
  overrides?: { name?: string; category?: string },
): Promise<{ stock_item_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const admin = createAdminClient()

  const { data: item } = await admin
    .from('purchase_order_items')
    .select('*, purchase_orders!inner(clinic_id)')
    .eq('id', itemId)
    .single()

  if (!item) return { error: 'Item não encontrado.' }

  const name = overrides?.name ?? item.description
  const category = overrides?.category ?? 'supply'

  const { data: created, error } = await admin
    .from('stock_items')
    .insert({
      clinic_id:       ctx.clinic_id,
      name,
      category,
      quantity:        0,
      unit:            item.unit ?? 'un',
      min_quantity:    1,
      unit_price:      item.unit_price,
      barcode:         item.ean  ?? null,
      ncm:             item.ncm  ?? null,
      cfop:            item.cfop ?? null,
    })
    .select('id')
    .single()

  if (error || !created) {
    return { error: `Erro ao criar produto: ${error?.message ?? ''}` }
  }

  await admin.from('purchase_order_items').update({
    stock_item_id: created.id,
    is_matched:    true,
  }).eq('id', itemId)

  return { stock_item_id: created.id }
}

// ─── Enrich product from NCM (BrasilAPI) ─────────────────────────────────────

export async function enrichProductFromNCM(
  ncm: string,
): Promise<NCMData | { error: string }> {
  const clean = ncm.replace(/\D/g, '').padStart(8, '0')
  if (clean.length !== 8) return { error: 'NCM deve ter 8 dígitos.' }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/ncm/v1/${clean}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return { error: `NCM ${clean} não encontrado na base pública.` }
    const data = await res.json()
    return {
      code:        data.codigo ?? clean,
      description: data.descricao ?? '',
      chapter:     data.capitulo ?? undefined,
    }
  } catch {
    return { error: 'Serviço BrasilAPI indisponível no momento.' }
  }
}

// ─── Search product by EAN (Open Food Facts fallback) ────────────────────────

export async function searchProductByEAN(
  ean: string,
): Promise<PublicProduct | { error: string }> {
  const clean = ean.replace(/\D/g, '')
  if (clean.length < 8) return { error: 'EAN inválido.' }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${clean}.json`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return { error: 'Produto não encontrado.' }
    const data = await res.json()
    if (data.status !== 1 || !data.product) return { error: 'Produto não encontrado na base pública.' }

    const p = data.product
    return {
      description: p.product_name_pt ?? p.product_name ?? p.abbreviated_product_name ?? '',
      ncm:         undefined,
      brand:       p.brands ?? undefined,
      unit:        p.quantity ?? undefined,
      source:      'Open Food Facts',
    }
  } catch {
    return { error: 'Serviço de busca pública indisponível.' }
  }
}

// ─── Export NF-e XMLs as ZIP ──────────────────────────────────────────────────

export async function exportNFeZip(params: {
  month: number
  year: number
}): Promise<{ data: string; filename: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { month, year } = params

  // Build date range for the selected month
  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const endDate   = new Date(year, month, 0).toISOString().split('T')[0]

  const admin = createAdminClient()

  const { data: orders, error } = await admin
    .from('purchase_orders')
    .select('id, nfe_number, nfe_series, issue_date, xml_content, supplier:suppliers(name, document)')
    .eq('clinic_id', ctx.clinic_id)
    .not('xml_content', 'is', null)
    .gte('issue_date', startDate)
    .lte('issue_date', endDate)
    .order('issue_date', { ascending: true })

  if (error) return { error: `Erro ao buscar NF-es: ${error.message}` }
  if (!orders || orders.length === 0) {
    return { error: `Nenhuma NF-e com XML encontrada para ${month.toString().padStart(2, '0')}/${year}.` }
  }

  // Dynamically import jszip (works in Node.js server action context)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  for (const order of orders) {
    const xmlContent = (order as any).xml_content as string | null
    if (!xmlContent) continue

    const nfeNum    = (order.nfe_number ?? order.id.substring(0, 8)).replace(/\W/g, '')
    const supplier  = (order as any).supplier as { name?: string; document?: string } | null
    const emitente  = supplier?.name
      ? supplier.name.replace(/[^\w\s]/g, '').replace(/\s+/g, '_').substring(0, 30)
      : 'Emitente'

    const filename = `NF${nfeNum}_${emitente}.xml`
    zip.file(filename, xmlContent)
  }

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
  const filename = `NFes_${year}-${String(month).padStart(2, '0')}_clinica.zip`

  return { data: base64, filename }
}

// ─── Cancel order ─────────────────────────────────────────────────────────────

export async function cancelPurchaseOrder(
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem cancelar ordens.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('purchase_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('clinic_id', ctx.clinic_id)
    .neq('status', 'received')

  if (error) return { error: error.message }
  revalidatePath('/dashboard/purchases')
  return { success: true }
}
