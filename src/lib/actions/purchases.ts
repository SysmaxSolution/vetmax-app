'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { XMLParser } from 'fast-xml-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedSupplier {
  cnpj:       string
  name:       string
  ie?:        string
  address?:   string
  city?:      string
  state?:     string
  zip_code?:  string
  phone?:     string
  email?:     string
}

export interface ParsedNFeItem {
  description: string
  ncm:         string
  ean?:        string
  cfop?:       string
  quantity:    number
  unit?:       string
  unit_price:  number
  total_price: number
  tax_icms?:   number
  tax_pis?:    number
  tax_cofins?: number
}

export interface ParsedNFe {
  nfe_key:     string
  nfe_number:  string
  nfe_series:  string
  issue_date:  string
  total_value: number
  supplier:    ParsedSupplier
  items:       ParsedNFeItem[]
}

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

// ─── NF-e XML Parser ──────────────────────────────────────────────────────────

export function parseNFeXML(xmlContent: string): ParsedNFe | { error: string } {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true })
    const obj = parser.parse(xmlContent)

    // Suporte a nfeProc e NFe raiz
    const nfe = obj?.nfeProc?.NFe ?? obj?.NFe
    if (!nfe) return { error: 'Arquivo XML não reconhecido como NF-e válida.' }

    const inf = nfe.infNFe
    if (!inf) return { error: 'Estrutura infNFe não encontrada no XML.' }

    const emit = inf.emit ?? {}
    const total = inf.total?.ICMSTot ?? {}
    const ide = inf.ide ?? {}

    const key: string = inf['@_Id']?.replace('NFe', '') ?? ''
    const nfe_number: string = String(ide.nNF ?? '')
    const nfe_series: string = String(ide.serie ?? '')
    const dh_emi: string = String(ide.dhEmi ?? ide.dEmi ?? '')
    const issue_date = dh_emi.substring(0, 10)

    const supplier: ParsedSupplier = {
      cnpj:     String(emit.CNPJ ?? emit.CPF ?? '').replace(/\D/g, ''),
      name:     String(emit.xNome ?? ''),
      ie:       emit.IE ? String(emit.IE) : undefined,
      city:     emit.enderEmit?.xMun ? String(emit.enderEmit.xMun) : undefined,
      state:    emit.enderEmit?.UF   ? String(emit.enderEmit.UF)   : undefined,
      zip_code: emit.enderEmit?.CEP  ? String(emit.enderEmit.CEP)  : undefined,
      address: emit.enderEmit
        ? [emit.enderEmit.xLgr, emit.enderEmit.nro, emit.enderEmit.xBairro]
            .filter(Boolean).join(', ')
        : undefined,
    }

    // Normalizar det para array
    const detRaw = inf.det ?? []
    const detArr = Array.isArray(detRaw) ? detRaw : [detRaw]

    const items: ParsedNFeItem[] = detArr.map((det: any) => {
      const prod = det.prod ?? {}
      const imposto = det.imposto ?? {}

      const icmsEntry = imposto.ICMS
        ? Object.values(imposto.ICMS as Record<string, any>)[0]
        : null
      const pisEntry  = imposto.PIS
        ? Object.values(imposto.PIS as Record<string, any>)[0]
        : null
      const cofinsEntry = imposto.COFINS
        ? Object.values(imposto.COFINS as Record<string, any>)[0]
        : null

      const ean = String(prod.cEAN ?? '').replace(/\D/g, '').length >= 8
        ? String(prod.cEAN ?? '')
        : undefined

      return {
        description: String(prod.xProd ?? ''),
        ncm:         String(prod.NCM ?? ''),
        ean,
        cfop:        String(prod.CFOP ?? ''),
        quantity:    parseFloat(String(prod.qCom ?? prod.qTrib ?? 1)),
        unit:        String(prod.uCom ?? prod.uTrib ?? 'un'),
        unit_price:  parseFloat(String(prod.vUnCom ?? prod.vUnTrib ?? 0)),
        total_price: parseFloat(String(prod.vProd ?? 0)),
        tax_icms:    icmsEntry?.pICMS   ? parseFloat(String(icmsEntry.pICMS))   : undefined,
        tax_pis:     pisEntry?.pPIS     ? parseFloat(String(pisEntry.pPIS))     : undefined,
        tax_cofins:  cofinsEntry?.pCOFINS ? parseFloat(String(cofinsEntry.pCOFINS)) : undefined,
      }
    })

    return {
      nfe_key:     key,
      nfe_number,
      nfe_series,
      issue_date,
      total_value: parseFloat(String(total.vNF ?? total.vTotTrib ?? 0)),
      supplier,
      items,
    }
  } catch (e: any) {
    return { error: `Erro ao processar XML: ${e?.message ?? 'desconhecido'}` }
  }
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
