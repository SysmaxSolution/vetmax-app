'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { parseNFeXML } from '@/lib/utils/nfe-parser'
import type { ParsedNFe } from '@/lib/utils/nfe-parser'
import type { AjustesDaEntrada } from '@/types/entrada-mercadoria'

import { mensagemErro } from '@/lib/errors'
import { cfopDeEntrada, naturezaDaNota, EFEITO_DA_NATUREZA } from '@/lib/fiscal/cfop'
import { fatorDe, precoPorUnidadeDeSaldo, unidadeDe } from '@/lib/stock/unidades'
import type { PurchaseOrder, PurchaseOrderItem, NCMData, PublicProduct, ManualPurchaseItem, ManualPurchasePayload, PurchaseInstallmentInput, StockMatchSuggestion } from '@/types/purchases'
// ─── Types ────────────────────────────────────────────────────────────────────

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
  /**
   * O que o operador corrigiu antes de confirmar.
   *
   * O XML NÃO é tocado — ele é o documento fiscal e continua registrando o que
   * o fornecedor emitiu. Os ajustes valem para o que entra no sistema: a
   * quantidade realmente recebida, a descrição que vai para o estoque, o
   * vencimento combinado por fora.
   */
  ajustes?: AjustesDaEntrada,
): Promise<PurchaseOrder | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem importar NF-e.' }
  }

  const lido = parseNFeXML(xmlContent)
  if ('error' in lido) return lido

  const { aplicarAjustes, resumirAjustes } = await import('@/lib/financial/ajustes-entrada')
  const parsed = aplicarAjustes(lido, ajustes)
  const oQueMudou = resumirAjustes(lido, parsed)

  if (!parsed.items.length) {
    return { error: 'Nenhum item para dar entrada — todos foram removidos.' }
  }

  const admin = createAdminClient()

  // A mesma nota não entra duas vezes: seria estoque em dobro e título a pagar
  // em dobro, e os dois só apareceriam na conferência. A chave de acesso
  // identifica a nota; o índice único da 0519 é a garantia no banco, mas a
  // mensagem para quem opera precisa vir daqui, antes de criar qualquer coisa.
  const nfeKey = parsed.nfe_key || null
  if (nfeKey) {
    const { data: repetida } = await admin
      .from('purchase_orders')
      .select('id, nfe_number, nfe_series, created_at')
      .eq('clinic_id', ctx.clinic_id)
      .eq('nfe_key', nfeKey)
      .limit(1)
      .maybeSingle()
    if (repetida) return { error: mensagemDeNotaRepetida(repetida) }
  }

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

  // Sem chave de acesso (XML antigo/incompleto), o que identifica a nota é
  // número + série do mesmo fornecedor.
  if (!nfeKey && parsed.nfe_number && supplier_id) {
    const { data: repetida } = await admin
      .from('purchase_orders')
      .select('id, nfe_number, nfe_series, created_at')
      .eq('clinic_id', ctx.clinic_id)
      .eq('supplier_id', supplier_id)
      .eq('nfe_number', parsed.nfe_number)
      .eq('nfe_series', parsed.nfe_series || '')
      .limit(1)
      .maybeSingle()
    if (repetida) return { error: mensagemDeNotaRepetida(repetida) }
  }

  // ── O que esta nota faz aqui dentro, pelo CFOP ─────────────────────────────
  // O fornecedor emite com CFOP de saída (5102); a entrada é lançada com o de
  // entrada (1102). E a natureza decide o resto: bonificação não gera contas a
  // pagar, faturamento de entrega futura não mexe no estoque, remessa de
  // entrega futura não repete o financeiro.
  const natureza = naturezaDaNota(parsed.items.map(i => i.cfop))
  const efeito   = EFEITO_DA_NATUREZA[natureza]

  // Entrega futura: a remessa procura o faturamento que veio antes, pela nota
  // referenciada no próprio XML.
  const chaveRef = (parsed.chaves_referenciadas ?? [])[0] ?? null
  let notaOrigemId: string | null = null
  if (chaveRef && natureza === 'entrega_futura_remessa') {
    const { data: origem } = await admin
      .from('purchase_orders')
      .select('id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('nfe_key', chaveRef)
      .maybeSingle()
    notaOrigemId = (origem as { id?: string } | null)?.id ?? null
  }

  // Criar purchase_order
  const { data: order, error: orderErr } = await admin
    .from('purchase_orders')
    .insert({
      cfop_natureza:        natureza,
      lanca_financeiro:     efeito.financeiro,
      movimenta_estoque:    efeito.estoque,
      nfe_key_referenciada: chaveRef,
      nota_origem_id:       notaOrigemId,
      clinic_id:   ctx.clinic_id,
      supplier_id,
      nfe_key:     parsed.nfe_key   || null,
      nfe_number:  parsed.nfe_number || null,
      nfe_series:  parsed.nfe_series || null,
      issue_date:  parsed.issue_date || null,
      total_value: parsed.total_value,
      status:      'pending',
      // O XML guardado é o ORIGINAL, sempre: é o documento fiscal, e os
      // ajustes do operador valem para o que entrou, não para o que o
      // fornecedor emitiu.
      xml_content: xmlContent,
      duplicatas:  parsed.duplicatas ?? [],
      // Fica registrado o que foi corrigido na conferência — sem isso,
      // quem olhar depois vê um total diferente do XML e não sabe por quê.
      notes:       oQueMudou ? `Conferência: ${oQueMudou}` : null,
      created_by:  ctx.user_id,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    return { error: `Erro ao criar ordem de compra: ${(orderErr ? mensagemErro(orderErr, 'lib/actions/purchases.ts') : '')}` }
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
      cfop_entrada: cfopDeEntrada(item.cfop),
      quantity:     item.quantity,
      unit:         item.unit || null,
      unit_price:   item.unit_price,
      total_price:  item.total_price,
      tax_icms:     item.tax_icms   ?? null,
      tax_pis:      item.tax_pis    ?? null,
      tax_cofins:   item.tax_cofins ?? null,
      // Impostos por item (0519): como vieram no XML ou corrigidos na conferência.
      cst:           item.cst           ?? null,
      icms_origin:   item.icms_origin   ?? null,
      icms_base:     item.icms_base     ?? null,
      icms_value:    item.icms_value    ?? null,
      icms_st_value: item.icms_st_value ?? null,
      ipi_value:     item.ipi_value     ?? null,
      pis_value:     item.pis_value     ?? null,
      cofins_value:  item.cofins_value  ?? null,
      is_matched,
    })
  }

  await ligarEntregaFutura(admin, order.id, natureza, notaOrigemId)

  revalidatePath('/dashboard/purchases')
  return getOrderWithItems(order.id, ctx.clinic_id)
}

/** Nome comparável: sem acento, sem pontuação, sem espaço duplicado. */
function chaveDeNome(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Amarra as duas pontas da venda para entrega futura.
 *
 * No faturamento, cada linha nasce com o saldo inteiro pendente de entrega.
 * Na remessa, cada linha procura a linha correspondente do faturamento (pelo
 * código de barras, senão pelo nome) e abate o que chegou — é isso que deixa
 * o operador conferir depois quanto o fornecedor ainda deve.
 */
async function ligarEntregaFutura(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  natureza: string,
  notaOrigemId: string | null,
): Promise<void> {
  if (natureza === 'entrega_futura_faturamento') {
    const { data: itens } = await admin
      .from('purchase_order_items').select('id, quantity').eq('purchase_order_id', orderId)
    for (const it of (itens ?? []) as { id: string; quantity: number }[]) {
      await admin.from('purchase_order_items')
        .update({ quantidade_pendente: it.quantity }).eq('id', it.id)
    }
    return
  }

  if (natureza !== 'entrega_futura_remessa' || !notaOrigemId) return

  const { data: daRemessa } = await admin
    .from('purchase_order_items').select('id, description, ean, quantity')
    .eq('purchase_order_id', orderId)
  const { data: daOrigem } = await admin
    .from('purchase_order_items').select('id, description, ean, quantity, quantidade_pendente')
    .eq('purchase_order_id', notaOrigemId)

  const origem = (daOrigem ?? []) as { id: string; description: string; ean: string | null; quantity: number; quantidade_pendente: number | null }[]
  const pendente = new Map(origem.map(o => [o.id, Number(o.quantidade_pendente ?? o.quantity)]))

  for (const item of (daRemessa ?? []) as { id: string; description: string; ean: string | null; quantity: number }[]) {
    const par = origem.find(o => item.ean && o.ean && o.ean === item.ean)
      ?? origem.find(o => chaveDeNome(o.description) === chaveDeNome(item.description))
    if (!par) continue
    const falta = Math.max(0, (pendente.get(par.id) ?? 0) - Number(item.quantity))
    pendente.set(par.id, falta)
    await admin.from('purchase_order_items').update({ item_origem_id: par.id }).eq('id', item.id)
    await admin.from('purchase_order_items').update({ quantidade_pendente: falta }).eq('id', par.id)
  }
}

/** Frase para quem tentou importar uma nota que já está no sistema. */
function mensagemDeNotaRepetida(compra: { nfe_number?: string | null; nfe_series?: string | null; created_at?: string | null }): string {
  const numero = compra.nfe_number ? `nº ${compra.nfe_number}${compra.nfe_series ? ` série ${compra.nfe_series}` : ''}` : 'com esta chave'
  const quando = compra.created_at
    ? ` em ${new Date(compra.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    : ''
  return `Esta nota (${numero}) já foi lançada${quando}. Para corrigir a entrada, abra a compra que já existe em vez de importar o XML de novo.`
}

// ─── Entrada manual (sem XML) ─────────────────────────────────────────────────

export async function createManualPurchaseOrder(
  payload: ManualPurchasePayload,
): Promise<PurchaseOrder | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem registrar entradas manuais.' }
  }

  if (!payload.items || payload.items.length === 0) {
    return { error: 'Informe ao menos um item.' }
  }
  for (const it of payload.items) {
    if (!it.description.trim())     return { error: 'Descrição do item é obrigatória.' }
    if (!(it.quantity > 0))         return { error: `Quantidade inválida para "${it.description}".` }
    if (!(it.unit_price >= 0))      return { error: `Preço unitário inválido para "${it.description}".` }
  }

  const total = payload.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  const admin = createAdminClient()

  const { data: order, error: orderErr } = await admin
    .from('purchase_orders')
    .insert({
      clinic_id:   ctx.clinic_id,
      supplier_id: payload.supplier_id,
      nfe_key:     null,
      nfe_number:  null,
      nfe_series:  null,
      issue_date:  payload.issue_date || null,
      total_value: total,
      status:      'pending',
      xml_content: null,
      notes:       payload.notes ?? 'Entrada manual (sem NF-e)',
      created_by:  ctx.user_id,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    return { error: `Erro ao criar entrada manual: ${(orderErr ? mensagemErro(orderErr, 'lib/actions/purchases.ts') : '')}` }
  }

  // Auto-match dos itens contra estoque (EAN ou nome)
  for (const item of payload.items) {
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

    const total_price = item.quantity * item.unit_price
    await admin.from('purchase_order_items').insert({
      purchase_order_id: order.id,
      stock_item_id,
      description:  item.description.trim(),
      ncm:          item.ncm || null,
      ean:          item.ean || null,
      cfop:         null,
      quantity:     item.quantity,
      unit:         item.unit || null,
      unit_price:   item.unit_price,
      total_price,
      tax_icms:     null,
      tax_pis:      null,
      tax_cofins:   null,
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
      issue_date, total_value, status, notes, created_at, updated_at, duplicatas,
      cfop_natureza, lanca_financeiro, movimenta_estoque, nota_origem_id, nfe_key_referenciada,
      supplier:suppliers(id, name, document)
    `)
    .eq('clinic_id', ctx.clinic_id)
    .order('created_at', { ascending: false })

  if (filters?.status)      q = q.eq('status', filters.status)
  if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)

  const { data, error } = await q.limit(100)
  if (error) return { error: mensagemErro(error, 'lib/actions/purchases.ts') }
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
  /** Decisão do operador na tela de conferência — fica registrada na nota. */
  decisao?: { lancaFinanceiro?: boolean },
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem confirmar recebimento.' }
  }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('purchase_orders')
    .select('id, status, clinic_id, supplier_id, nfe_number, cfop_natureza, movimenta_estoque, items:purchase_order_items(*)')
    .eq('id', orderId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!order) return { error: 'Ordem não encontrada.' }
  if (order.status === 'received') return { error: 'Esta ordem já foi recebida.' }
  if (order.status === 'cancelled') return { error: 'Ordem cancelada não pode ser recebida.' }

  // Faturamento de entrega futura (5922/6922) é dinheiro, não mercadoria: a
  // nota entra como recebida e sem crédito de saldo. A mercadoria chega depois,
  // na nota de remessa, que aponta para esta.
  const movimentaEstoque = (order as { movimenta_estoque?: boolean | null }).movimenta_estoque !== false

  const items = movimentaEstoque ? ((order as any).items as PurchaseOrderItem[]) : []

  // Fornecedor e nº da NF-e vão para o HISTÓRICO do Livro de Controlados.
  let fornecedorNome: string | null = null
  if (order.supplier_id) {
    const { data: sup } = await admin.from('suppliers').select('name').eq('id', order.supplier_id as string).eq('clinic_id', ctx.clinic_id).maybeSingle()
    fornecedorNome = (sup?.name as string | undefined) ?? null
  }
  const nfeNumero = (order.nfe_number as string | null) ?? null

  for (const item of items) {
    if (!item.stock_item_id) continue

    // Atualizar preço e quantidade do item no estoque
    const { data: stock } = await admin
      .from('stock_items')
      .select('quantity, unit_price, units_per_package, unit, unit_purchase, factor_purchase, unit_use, factor_use, unit_sale, factor_sale')
      .eq('id', item.stock_item_id)
      .single()

    if (!stock) continue

    const qtyBefore = Number(stock.quantity ?? 0)

    // A nota vem na unidade do fornecedor (1 CX, 1 FR); o saldo é contado na
    // unidade menor do produto (mL). O fator de compra faz a ponte — e o
    // units_per_package antigo continua valendo quando não há fator novo
    // (migrations 0404 e 0532).
    const unidades = stock as Parameters<typeof fatorDe>[0]
    const upp = fatorDe(unidades, 'purchase')
    const creditQty    = Number(item.quantity) * upp
    const perUnitPrice = precoPorUnidadeDeSaldo(unidades, Number(item.unit_price ?? 0))

    // ── Retroalimentação FIFO: TODA entrada de NF-e cria um lote em
    //    stock_batches (sem furo de FIFO na entrada de notas). Lote-base do
    //    saldo prévio se o item ainda não tinha lotes; depois espelha
    //    stock_items.quantity = SUM(lotes).
    const { count: batchCount } = await admin
      .from('stock_batches').select('id', { count: 'exact', head: true }).eq('stock_item_id', item.stock_item_id)
    if ((batchCount ?? 0) === 0 && qtyBefore !== 0) {
      await admin.from('stock_batches').insert({
        clinic_id: ctx.clinic_id, stock_item_id: item.stock_item_id, quantity: qtyBefore, received_at: new Date().toISOString(),
      })
    }
    await admin.from('stock_batches').insert({
      clinic_id:     ctx.clinic_id,
      stock_item_id: item.stock_item_id,
      batch_number:  (item as { batch_number?: string | null }).batch_number ?? null,
      expiry_date:   (item as { expiry_date?: string | null }).expiry_date ?? null,
      quantity:      creditQty,
      received_at:   new Date().toISOString(),
      supplier:      null,
    })
    const { data: batches } = await admin
      .from('stock_batches').select('quantity').eq('stock_item_id', item.stock_item_id)
    const newQty = (batches ?? []).reduce((s, b) => s + Number(b.quantity ?? 0), 0)

    await admin.from('stock_items').update({
      quantity:     newQty,
      unit_price:   perUnitPrice,
      last_restock: new Date().toISOString(),
      ncm:          item.ncm  || undefined,
      updated_at:   new Date().toISOString(),
    }).eq('id', item.stock_item_id)

    // Registrar movimento de estoque (em itens-base). Antes este insert usava
    // colunas que não existem (type/quantity/reason) e falhava em silêncio:
    // a entrada por NF-e nunca chegava ao Livro de Controlados.
    const { error: movErr } = await admin.from('stock_movements').insert({
      clinic_id:       ctx.clinic_id,
      stock_item_id:   item.stock_item_id,
      medication_name: item.description ?? 'Item da NF-e',
      movement_type:   'CREDIT',
      quantity_change: creditQty,
      quantity_before: qtyBefore,
      quantity_after:  newQty,
      source:          'RESTOCK',
      reference_id:    orderId,
      notes:           upp !== 1
        ? `Recebimento NF-e — Ordem #${orderId.substring(0, 8)} (${item.quantity} ${unidadeDe(unidades, 'purchase')} × ${upp} = ${creditQty} ${unidades.unit ?? ''})`
        : `Recebimento NF-e — Ordem #${orderId.substring(0, 8)}`,
      created_by:      ctx.user_id,
      // HISTÓRICO do Livro de Controlados
      counterparty:    fornecedorNome,
      document_number: nfeNumero,
      batch_number:    (item as { batch_number?: string | null }).batch_number ?? null,
      expires_at:      (item as { expiry_date?: string | null }).expiry_date ?? null,
    })
    if (movErr) {
      return { error: `Entrada no estoque gravada, mas o movimento do item "${item.description ?? ''}" não foi registrado: ${mensagemErro(movErr, 'lib/actions/purchases.ts')}` }
    }
  }

  await admin.from('purchase_orders').update({
    status:     'received',
    // A decisão sobre o financeiro deixa de ser só um checkbox que some: fica
    // escrito na nota por que ela não gerou contas a pagar (bonificação, por
    // exemplo), e o relatório consegue explicar depois.
    ...(decisao?.lancaFinanceiro === undefined ? {} : { lanca_financeiro: decisao.lancaFinanceiro }),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)

  revalidatePath('/dashboard/purchases')
  revalidatePath('/dashboard/pharmacy')
  return { success: true }
}

// ─── Lançar Contas a Pagar a partir da compra (1.8) ───────────────────────────
// Gera N títulos (parcelas) em financial_entries (type='payable'), amarrando
// fornecedor, ordem de compra, nº do documento, espécie e parcela. Idempotente
// por ordem (não relança se já houver títulos desta compra).

export async function launchPayablesFromPurchase(
  orderId: string,
  input: { installments: PurchaseInstallmentInput[]; category?: string; chart_of_accounts_id?: string | null },
): Promise<{ ok: true; count: number; total: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão para lançar contas a pagar.' }
  if (!input.installments?.length) return { error: 'Informe ao menos uma parcela.' }
  if (input.installments.some(i => !i.due_date || !(i.amount > 0))) return { error: 'Todas as parcelas precisam de vencimento e valor positivo.' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('purchase_orders')
    .select('id, nfe_number, issue_date, supplier_id, supplier:suppliers(id, name)')
    .eq('id', orderId).eq('clinic_id', ctx.clinic_id).maybeSingle()
  if (!order) return { error: 'Ordem de compra não encontrada.' }

  // Idempotência: não relança se já há títulos desta compra.
  const { count: existing } = await admin
    .from('financial_entries')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinic_id).eq('purchase_order_id', orderId)
  if ((existing ?? 0) > 0) return { error: 'Esta compra já teve contas a pagar lançadas.' }

  const supplierName = ((order as any).supplier?.name as string | null) ?? null
  const n = input.installments.length
  const rows = input.installments.map((inst, i) => ({
    clinic_id:            ctx.clinic_id,
    type:                 'payable',
    description:          `Compra${order.nfe_number ? ` NF ${order.nfe_number}` : ''}${supplierName ? ` — ${supplierName}` : ''}${n > 1 ? ` (${i + 1}/${n})` : ''}`,
    amount:               Math.round(inst.amount * 100) / 100,
    due_date:             inst.due_date,
    issue_date:           (order.issue_date as string) ?? null,
    category:             input.category ?? 'Fornecedores',
    chart_of_accounts_id: input.chart_of_accounts_id ?? null,
    beneficiary:          supplierName,
    supplier_id:          order.supplier_id ?? null,
    purchase_order_id:    orderId,
    document_number:      order.nfe_number ? `${order.nfe_number}${n > 1 ? `/${i + 1}` : ''}` : null,
    especie:              inst.especie ?? null,
    installment_number:   i + 1,
    total_installments:   n,
    status:               'pending',
    created_by:           ctx.user_id,
  }))
  const { error } = await admin.from('financial_entries').insert(rows)
  if (error) return { error: 'Erro ao lançar contas a pagar: ' + mensagemErro(error, 'lib/actions/purchases.ts') }

  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/purchases')
  const sum = input.installments.reduce((s, x) => s + x.amount, 0)
  return { ok: true, count: n, total: Math.round(sum * 100) / 100 }
}

// ─── Match item to stock ──────────────────────────────────────────────────────

/**
 * Confere que o item da nota é desta clínica e devolve a compra dele.
 *
 * Sem isto o vínculo aceitava qualquer `itemId` do banco: o filtro era só
 * `.eq('id', itemId)`, sem clinic_id.
 */
async function itemDaClinica(
  admin: ReturnType<typeof createAdminClient>, itemId: string, clinicId: string,
): Promise<{ purchaseId: string; status: string } | { error: string }> {
  const { data } = await admin
    .from('purchase_order_items')
    .select('id, purchase_order_id, purchase_orders!inner(id, clinic_id, status)')
    .eq('id', itemId)
    .maybeSingle()
  const ordem = (data as { purchase_orders?: { clinic_id?: string; status?: string } } | null)?.purchase_orders
  if (!data || !ordem) return { error: 'Item da nota não encontrado.' }
  if (ordem.clinic_id !== clinicId) return { error: 'Este item pertence a outra clínica.' }
  return { purchaseId: (data as { purchase_order_id: string }).purchase_order_id, status: ordem.status ?? '' }
}

export async function matchItemToStock(
  itemId: string,
  stockItemId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const admin = createAdminClient()
  const dono = await itemDaClinica(admin, itemId, ctx.clinic_id)
  if ('error' in dono) return { error: dono.error }

  // O produto também precisa ser desta clínica — vincular item de nota a
  // produto de outra clínica misturaria estoque no recebimento.
  const { data: produto } = await admin
    .from('stock_items').select('id').eq('id', stockItemId).eq('clinic_id', ctx.clinic_id).maybeSingle()
  if (!produto) return { error: 'Produto não encontrado nesta clínica.' }

  const { error } = await admin
    .from('purchase_order_items')
    .update({ stock_item_id: stockItemId, is_matched: true })
    .eq('id', itemId)

  if (error) return { error: mensagemErro(error, 'lib/actions/purchases.ts') }
  revalidatePath('/dashboard/purchases')
  return { success: true }
}

/**
 * Desfaz o vínculo de um item da nota com o produto do estoque.
 *
 * Pedido da Clínica Animais (30/10/2026): "às vezes o operador seleciona o
 * produto errado". Antes disso, vínculo errado não tinha volta pela tela.
 *
 * Só vale enquanto a entrada não foi recebida. Depois do recebimento o saldo
 * já entrou no produto, e desvincular aqui deixaria o estoque sem explicação —
 * nesse caso o caminho é o ajuste de estoque, que deixa rastro.
 */
export async function unmatchItemFromStock(
  itemId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const admin = createAdminClient()
  const dono = await itemDaClinica(admin, itemId, ctx.clinic_id)
  if ('error' in dono) return { error: dono.error }
  if (dono.status === 'received') {
    return { error: 'Esta entrada já foi recebida. O saldo já entrou no produto — corrija por um ajuste de estoque, que fica registrado.' }
  }
  if (dono.status === 'cancelled') return { error: 'Esta entrada está cancelada.' }

  const { error } = await admin
    .from('purchase_order_items')
    .update({ stock_item_id: null, is_matched: false })
    .eq('id', itemId)

  if (error) return { error: mensagemErro(error, 'lib/actions/purchases.ts') }
  revalidatePath('/dashboard/purchases')
  return { success: true }
}

// ─── M13(a): sugestão inteligente de vínculo ──────────────────────────────────

/**
 * Sugere itens do estoque que podem corresponder a um item da nota, rankeados:
 * EAN (100) > NCM (70) > nome parecido (50). Usado pelo "Vincular" para já
 * mostrar candidatos sem o usuário ter que buscar manualmente.
 */
export async function searchStockMatchesForPurchaseItem(input: {
  ean?:         string | null
  ncm?:         string | null
  description:  string
}): Promise<StockMatchSuggestion[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const admin = createAdminClient()
  const byId = new Map<string, StockMatchSuggestion>()
  const add = (rows: Array<{ id: string; name: string; category: string; unit_price: number }> | null, score: number, reason: string) => {
    for (const r of rows ?? []) {
      if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, category: r.category, unit_price: Number(r.unit_price ?? 0), score, reason })
    }
  }

  if (input.ean) {
    const { data } = await admin.from('stock_items')
      .select('id, name, category, unit_price')
      .eq('clinic_id', ctx.clinic_id).eq('barcode', input.ean).limit(5)
    add(data, 100, 'Mesmo código de barras (EAN)')
  }
  if (input.ncm) {
    const { data } = await admin.from('stock_items')
      .select('id, name, category, unit_price')
      .eq('clinic_id', ctx.clinic_id).eq('ncm', input.ncm).limit(8)
    add(data, 70, 'Mesma NCM')
  }
  // Nome: usa as 2-3 primeiras palavras significativas da descrição.
  const term = input.description.trim().split(/\s+/).slice(0, 3).join(' ').substring(0, 30)
  if (term.length >= 2) {
    const { data } = await admin.from('stock_items')
      .select('id, name, category, unit_price')
      .eq('clinic_id', ctx.clinic_id).ilike('name', `%${term}%`).limit(8)
    add(data, 50, 'Nome parecido')
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 6)
}

// ─── Auto-create stock from item ──────────────────────────────────────────────

export async function autoCreateStockFromItem(
  itemId: string,
  overrides?: { name?: string; category?: string; units_per_package?: number; unit?: string },
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
      clinic_id:         ctx.clinic_id,
      name,
      category,
      quantity:          0,
      unit:              overrides?.unit ?? item.unit ?? 'un',
      min_quantity:      1,
      unit_price:        item.unit_price,
      barcode:           item.ean  ?? null,
      ncm:               item.ncm  ?? null,
      cfop:              item.cfop ?? null,
      units_per_package: overrides?.units_per_package && overrides.units_per_package > 1 ? overrides.units_per_package : 1,
    })
    .select('id')
    .single()

  if (error || !created) {
    return { error: `Erro ao criar produto: ${(error ? mensagemErro(error, 'lib/actions/purchases.ts') : '')}` }
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

  if (error) return { error: `Erro ao buscar NF-es: ${mensagemErro(error, 'lib/actions/purchases.ts')}` }
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

  if (error) return { error: mensagemErro(error, 'lib/actions/purchases.ts') }
  revalidatePath('/dashboard/purchases')
  return { success: true }
}
