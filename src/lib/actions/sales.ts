'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendWhatsAppMessage } from './whatsapp'
import { isEAN } from '@/lib/utils/ean'
import { processCommissions } from './commissions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleItem {
  stock_item_id?: string | null
  description:   string
  quantity:      number
  unit_price:    number
  discount:      number
}

export interface CreateSaleParams {
  clinic_id:        string
  items:            SaleItem[]
  payment_method:   'cash' | 'credit' | 'debit' | 'pix' | 'convenio' | 'other'
  discount_amount?: number
  tutor_id?:        string | null
  consultation_id?: string | null
  patient_id?:      string | null
  notes?:           string | null
  /**
   * Quando informado, registra cada split em invoice_payment_splits-like:
   * para PDV usamos central_cashier com payment_method e dados de cartão por split.
   * Para vendas com 1 método, o payment_method principal cobre tudo.
   */
  splits?: Array<{
    amount:              number
    payment_method:      string
    payment_card_id?:    string | null
    installments?:       number
    card_acquirer?:      string | null
    card_brand?:         string | null
    card_nsu?:           string | null
    card_authorization?: string | null
    transaction_date?:   string | null
  }>
}

export interface Sale {
  id:               string
  clinic_id:        string
  seller_id:        string | null
  tutor_id:         string | null
  total_amount:     number
  discount_amount:  number
  payment_method:   string
  payment_status:   string
  notes:            string | null
  created_at:       string
  cancelled_at:     string | null
  seller_name?:     string | null
  tutor_name?:      string | null
  items?:           SaleItemRow[]
}

export interface SaleItemRow {
  id:            string
  stock_item_id: string | null
  description:   string
  quantity:      number
  unit_price:    number
  discount:      number
  total:         number
}

export interface SalesSummary {
  total_revenue:    number
  total_sales:      number
  cancelled_count:  number
  by_method: {
    method: string
    amount: number
    count:  number
  }[]
}

export interface StockProduct {
  id:         string
  name:       string
  category:   string
  unit_price: number
  quantity:   number
  unit:       string
}

// ─── Buscar produtos do estoque para autocomplete ─────────────────────────────

async function getClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  return profile?.clinic_id ?? null
}

export async function searchSalesProducts(query: string): Promise<StockProduct[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return []

  const q = query.trim()

  // Se parece EAN: busca barcode primeiro
  if (isEAN(q)) {
    const { data: byBarcode } = await supabase
      .from('stock_items')
      .select('id, name, category, unit_price, quantity, unit')
      .eq('clinic_id', profile.clinic_id)
      .eq('barcode', q)
      .limit(5)
    if (byBarcode && byBarcode.length > 0) {
      return byBarcode.map((p: any) => ({
        id:         p.id,
        name:       p.name,
        category:   p.category,
        unit_price: Number(p.unit_price ?? 0),
        quantity:   Number(p.quantity ?? 0),
        unit:       p.unit ?? 'un',
      }))
    }
  }

  const { data } = await supabase
    .from('stock_items')
    .select('id, name, category, unit_price, quantity, unit')
    .eq('clinic_id', profile.clinic_id)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(20)

  return (data ?? []).map((p: any) => ({
    id:         p.id,
    name:       p.name,
    category:   p.category,
    unit_price: Number(p.unit_price ?? 0),
    quantity:   Number(p.quantity ?? 0),
    unit:       p.unit ?? 'un',
  }))
}

// ─── Criar venda via RPC ──────────────────────────────────────────────────────

export async function createSale(
  params: CreateSaleParams
): Promise<{ id: string; total: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  if (params.items.length === 0) return { error: 'Adicione pelo menos um item à venda.' }

  const { data, error } = await supabase.rpc('rpc_create_sale', {
    p_clinic_id:       params.clinic_id,
    p_items:           params.items as any,
    p_payment_method:  params.payment_method,
    p_discount_amount: params.discount_amount ?? 0,
    p_tutor_id:        params.tutor_id ?? null,
    p_consultation_id: params.consultation_id ?? null,
    p_notes:           params.notes ?? null,
    p_patient_id:      params.patient_id ?? null,
  })

  if (error) return { error: 'Erro ao registrar venda: ' + error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/cashier')

  const saleId = (data as any).id as string
  const total  = Number((data as any).total)

  // Quando há splits (múltiplos métodos), substituímos o lançamento único do
  // central_cashier por uma linha por split — preservando NSU/parcelas para
  // conciliação. Também criamos card_installments e pending entries
  // (source=card_acquirer) para parcelas de cartão.
  if (params.splits && params.splits.length > 0) {
    const admin = createAdminClient()
    await admin
      .from('central_cashier')
      .update({ status: 'archived' })
      .eq('clinic_id', params.clinic_id)
      .eq('source_module', 'sales')
      .eq('source_id', saleId)

    // Carrega nomes para preencher caixa
    let tutorName: string | null = null
    let patientName: string | null = null
    if (params.tutor_id) {
      const { data: t } = await admin.from('tutors').select('name').eq('id', params.tutor_id).maybeSingle()
      tutorName = (t as { name?: string } | null)?.name ?? null
    }
    if (params.patient_id) {
      const { data: p } = await admin.from('patients').select('name, tutor_id').eq('id', params.patient_id).maybeSingle()
      patientName = (p as { name?: string } | null)?.name ?? null
      if (!tutorName) {
        const tId = (p as { tutor_id?: string } | null)?.tutor_id
        if (tId) {
          const { data: t } = await admin.from('tutors').select('name').eq('id', tId).maybeSingle()
          tutorName = (t as { name?: string } | null)?.name ?? null
        }
      }
    }

    for (const split of params.splits) {
      await admin.from('central_cashier').insert({
        clinic_id:          params.clinic_id,
        source_module:      'sales',
        source_id:          saleId,
        amount:             split.amount,
        status:             'recorded',
        payment_method:     split.payment_method,
        recorded_by:        user.id,
        tutor_name:         tutorName,
        patient_name:       patientName,
        reason:             `Venda PDV — ${patientName ?? tutorName ?? 'avulsa'}`,
        payment_card_id:    split.payment_card_id ?? null,
        card_nsu:           split.card_nsu ?? null,
        card_authorization: split.card_authorization ?? null,
        card_installments:  split.payment_method === 'credit' ? (split.installments ?? 1) : null,
      })
    }

    // Gera invoice_payment_splits + card_installments para parcelas de cartão.
    // Métodos não-cartão não geram card_installments (a entrada já é em caixa).
    await supabase.rpc('rpc_record_sale_card_splits', {
      p_clinic_id:    params.clinic_id,
      p_sale_id:      saleId,
      p_recorded_by:  user.id,
      p_patient_name: patientName,
      p_tutor_name:   tutorName,
      p_splits:       params.splits.map(s => ({
        amount:             s.amount,
        payment_method:     s.payment_method,
        payment_card_id:    s.payment_card_id ?? null,
        installments:       s.installments ?? 1,
        card_acquirer:      s.card_acquirer ?? null,
        card_brand:         s.card_brand ?? null,
        card_nsu:           s.card_nsu ?? null,
        card_authorization: s.card_authorization ?? null,
        transaction_date:   s.transaction_date ?? null,
      })),
    })
  }

  // Processar comissões de forma não-bloqueante
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  processCommissions({
    sale_id:     saleId,
    clinic_id:   params.clinic_id,
    seller_id:   user.id,
    seller_name: sellerProfile?.full_name ?? 'Vendedor',
    items:       params.items.map(i => ({ ...i, stock_item_id: i.stock_item_id ?? null })),
    sale_date:   new Date().toISOString().split('T')[0],
  }).catch(() => {})

  return { id: saleId, total }
}

// ─── Venda LANÇADA (pendente) — Caixa unificado (05/06/2026) ─────────────────
//
// Cenário do PO: tutor faz a consulta e, no caixa, leva um item — paga TUDO
// num cartão só. O operador LANÇA a venda (fica pendente nos Recebimentos)
// e recebe junto com a consulta via recebimento agrupado. Estoque é baixado
// no lançamento (reserva); cancelar o lançamento devolve.

export interface PendingSale {
  id:              string
  tutor_id:        string | null
  tutor_name:      string | null
  tutor_phone:     string | null
  patient_id:      string | null
  patient_name:    string | null
  patient_species: string | null
  total_amount:    number
  created_at:      string
  items_count:     number
  items_preview:   string
}

/** Pets do tutor — para vincular a venda lançada a um pet (opcional). */
export async function listTutorPets(
  tutorId: string,
): Promise<Array<{ id: string; name: string; species: string }> | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('patients')
    .select('id, name, species')
    .eq('clinic_id', clinicId)
    .eq('tutor_id', tutorId)
    .is('deleted_at', null)   // PDV não deve listar pets arquivados (B11)
    .order('name')
    .limit(30)
  if (error) return { error: error.message }
  return (data ?? []).map(p => ({ id: p.id as string, name: p.name as string, species: (p.species as string) ?? '' }))
}

export async function launchPendingSale(params: {
  items:      SaleItem[]
  tutor_id?:  string | null
  patient_id?: string | null
  notes?:     string | null
}): Promise<{ id: string; total: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  if (params.items.length === 0) return { error: 'Adicione pelo menos um item.' }

  // clinic_id SEMPRE derivado da sessão — nunca aceito do cliente (isolamento multi-tenant).
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const clinicId = profile.clinic_id

  const admin = createAdminClient()
  const total = Number(params.items
    .reduce((s, i) => s + (i.unit_price - i.discount) * i.quantity, 0)
    .toFixed(2))

  // 1) Valida e baixa estoque dos itens-produto (reserva no lançamento)
  const decremented: Array<{ id: string; qty: number }> = []
  for (const it of params.items) {
    if (!it.stock_item_id) continue
    const { data: stock } = await admin
      .from('stock_items')
      .select('id, name, quantity, is_service')
      .eq('id', it.stock_item_id)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (!stock) return { error: `Item não encontrado no estoque.` }
    if (stock.is_service) continue
    if (Number(stock.quantity) < it.quantity) {
      // Estorna o que já baixou antes de abortar
      for (const d of decremented) {
        const { data: s2 } = await admin.from('stock_items').select('quantity').eq('id', d.id).single()
        await admin.from('stock_items').update({ quantity: Number(s2?.quantity ?? 0) + d.qty }).eq('id', d.id)
      }
      return { error: `Estoque insuficiente de "${stock.name}" (disponível: ${stock.quantity}).` }
    }
    await admin
      .from('stock_items')
      .update({ quantity: Number(stock.quantity) - it.quantity })
      .eq('id', it.stock_item_id)
      .eq('clinic_id', clinicId)
    decremented.push({ id: it.stock_item_id, qty: it.quantity })
  }

  // 2) Venda pendente + itens
  const { data: sale, error: saleErr } = await admin
    .from('sales')
    .insert({
      clinic_id:       clinicId,
      seller_id:       user.id,
      tutor_id:        params.tutor_id ?? null,
      patient_id:      params.patient_id ?? null,
      total_amount:    total,
      discount_amount: 0,
      payment_method:  'other',          // definido no recebimento
      payment_status:  'pending',
      notes:           params.notes ?? null,
    })
    .select('id')
    .single()
  if (saleErr || !sale) {
    for (const d of decremented) {
      const { data: s2 } = await admin.from('stock_items').select('quantity').eq('id', d.id).single()
      await admin.from('stock_items').update({ quantity: Number(s2?.quantity ?? 0) + d.qty }).eq('id', d.id)
    }
    return { error: 'Erro ao lançar venda: ' + (saleErr?.message ?? 'falha') }
  }

  const { error: itemsErr } = await admin.from('sale_items').insert(
    params.items.map(i => ({
      sale_id:       sale.id,
      clinic_id:     clinicId,
      stock_item_id: i.stock_item_id ?? null,
      description:   i.description,
      quantity:      i.quantity,
      unit_price:    i.unit_price,
      discount:      i.discount,
    })),
  )
  if (itemsErr) return { error: 'Venda lançada, mas falha nos itens: ' + itemsErr.message }

  revalidatePath('/dashboard/cashier')
  return { id: sale.id as string, total }
}

export async function listPendingSales(): Promise<PendingSale[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sales')
    .select('id, tutor_id, patient_id, total_amount, notes, created_at, tutors!tutor_id ( name, phone ), patients!patient_id ( name, species ), sale_items ( description )')
    .eq('clinic_id', clinicId)
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return { error: error.message }

  return (data ?? []).map((s: any) => {
    const items: Array<{ description: string }> = s.sale_items ?? []
    return {
      id:              s.id,
      tutor_id:        s.tutor_id ?? null,
      tutor_name:      s.tutors?.name ?? (s.notes === 'Consumidor avulso' ? 'Consumidor avulso' : null),
      tutor_phone:     s.tutors?.phone ?? null,
      patient_id:      s.patient_id ?? null,
      patient_name:    s.patients?.name ?? null,
      patient_species: s.patients?.species ?? null,
      total_amount:    Number(s.total_amount),
      created_at:      s.created_at,
      items_count:     items.length,
      items_preview:   items.slice(0, 3).map(i => i.description).join(', '),
    }
  })
}

/**
 * Baixa uma venda lançada (pendente) com os splits informados — mesma
 * contabilidade do createSale com splits: central_cashier por split (trigger
 * 0127 espelha no financeiro) + rpc_record_sale_card_splits para parcelas de
 * cartão (card_installments + pending source=card_acquirer).
 */
export async function settlePendingSale(
  saleId: string,
  splits: NonNullable<CreateSaleParams['splits']>,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (!splits || splits.length === 0) return { error: 'Informe ao menos um pagamento.' }

  const admin = createAdminClient()
  const { data: sale } = await admin
    .from('sales')
    .select('id, payment_status, total_amount, tutor_id, tutors!tutor_id ( name )')
    .eq('id', saleId)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  if (!sale) return { error: 'Venda não encontrada.' }
  if (sale.payment_status !== 'pending') return { error: 'Esta venda não está pendente.' }

  const tutorName = ((sale as any).tutors?.name as string | undefined) ?? null

  const { error: updErr } = await admin
    .from('sales')
    .update({
      payment_status: 'paid',
      payment_method: (splits[0]?.payment_method ?? 'other') as string,
    })
    .eq('id', saleId)
  if (updErr) return { error: 'Erro ao baixar venda: ' + updErr.message }

  for (const split of splits) {
    await admin.from('central_cashier').insert({
      clinic_id:          profile.clinic_id,
      source_module:      'sales',
      source_id:          saleId,
      amount:             split.amount,
      status:             'recorded',
      payment_method:     split.payment_method,
      recorded_by:        user.id,
      tutor_name:         tutorName,
      reason:             `Venda Caixa — ${tutorName ?? 'avulsa'}`,
      payment_card_id:    split.payment_card_id ?? null,
      card_nsu:           split.card_nsu ?? null,
      card_authorization: split.card_authorization ?? null,
      card_installments:  split.payment_method === 'credit' ? (split.installments ?? 1) : null,
    })
  }

  await supabase.rpc('rpc_record_sale_card_splits', {
    p_clinic_id:    profile.clinic_id,
    p_sale_id:      saleId,
    p_recorded_by:  user.id,
    p_patient_name: null,
    p_tutor_name:   tutorName,
    p_splits:       splits.map(s => ({
      amount:             s.amount,
      payment_method:     s.payment_method,
      payment_card_id:    s.payment_card_id ?? null,
      installments:       s.installments ?? 1,
      card_acquirer:      s.card_acquirer ?? null,
      card_brand:         s.card_brand ?? null,
      card_nsu:           s.card_nsu ?? null,
      card_authorization: s.card_authorization ?? null,
      transaction_date:   s.transaction_date ?? null,
    })),
  })

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { success: true }
}

/**
 * Cancela um LANÇAMENTO pendente (rascunho — permitido ao operador, conforme
 * regra B4 do PO) devolvendo o estoque. Vendas pagas seguem no rpc_cancel_sale
 * (só admin).
 */
export async function cancelPendingLaunch(
  saleId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data: sale } = await admin
    .from('sales')
    .select('id, payment_status, sale_items ( stock_item_id, quantity )')
    .eq('id', saleId)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  if (!sale) return { error: 'Venda não encontrada.' }
  if (sale.payment_status !== 'pending') {
    return { error: 'Apenas lançamentos pendentes podem ser cancelados aqui. Venda paga: solicite ao administrador.' }
  }

  // Devolve o estoque dos itens-produto
  for (const it of ((sale as any).sale_items ?? []) as Array<{ stock_item_id: string | null; quantity: number }>) {
    if (!it.stock_item_id) continue
    const { data: stock } = await admin
      .from('stock_items')
      .select('quantity, is_service')
      .eq('id', it.stock_item_id)
      .maybeSingle()
    if (stock && !stock.is_service) {
      await admin
        .from('stock_items')
        .update({ quantity: Number(stock.quantity) + Number(it.quantity) })
        .eq('id', it.stock_item_id)
    }
  }

  await admin
    .from('sales')
    .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'Lançamento cancelado no caixa (pendente)' })
    .eq('id', saleId)

  revalidatePath('/dashboard/cashier')
  return { success: true }
}

// ─── Cancelar venda ───────────────────────────────────────────────────────────

export async function cancelSale(
  saleId: string,
  reason: string
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { error } = await supabase.rpc('rpc_cancel_sale', {
    p_sale_id: saleId,
    p_reason:  reason,
  })

  if (error) return { error: 'Erro ao cancelar venda: ' + error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/cashier')
  return { success: true }
}

// ─── Solicitar correção de venda (B4, reunião 04/06/2026) ────────────────────
//
// Operador (receptionist) não pode cancelar venda fechada — rpc_cancel_sale
// exige admin/owner/manager. Decisão do PO: em vez de travar sem saída, o
// operador registra uma SOLICITAÇÃO DE CORREÇÃO que chega ao(s) admin(s) via
// chat interno (sininho) e fica auditada. O admin cancela/ajusta depois.

export async function requestSaleCorrection(
  saleId: string,
  reason: string,
): Promise<{ success: true; notified_admins: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const trimmedReason = (reason ?? '').trim()
  if (!trimmedReason) return { error: 'Informe o motivo da correção.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, full_name, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Venda da mesma clínica, ainda não cancelada
  const { data: sale } = await admin
    .from('sales')
    .select('id, clinic_id, total_amount, payment_status, created_at, tutors!tutor_id ( name )')
    .eq('id', saleId)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  if (!sale) return { error: 'Venda não encontrada.' }
  if (sale.payment_status === 'cancelled') return { error: 'Esta venda já está cancelada.' }

  // Admins da clínica (quem pode corrigir)
  const { data: admins } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('clinic_id', profile.clinic_id)
    .in('role', ['admin', 'owner', 'manager'])
    .neq('id', user.id)
  if (!admins || admins.length === 0) {
    return { error: 'Nenhum administrador encontrado para notificar.' }
  }

  const saleTime  = new Date(sale.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const tutorName = (sale as { tutors?: { name?: string } | null }).tutors?.name
  const message =
    `⚠️ Solicitação de correção de venda\n` +
    `Venda #${saleId.slice(0, 8)} de ${saleTime}${tutorName ? ` · ${tutorName}` : ''} · R$ ${Number(sale.total_amount).toFixed(2)}\n` +
    `Motivo: ${trimmedReason}\n` +
    `Solicitado por: ${profile.full_name ?? 'operador'} (sem permissão para cancelar — corrigir no PDV/Caixa).`

  // Notifica cada admin via chat direto (sininho consolidado do Épico 2)
  const { openOrCreateDirectChat, sendChatMessage } = await import('./internal-chat')
  let notified = 0
  const errors: string[] = []
  for (const adm of admins) {
    const chat = await openOrCreateDirectChat(adm.id as string)
    if ('error' in chat) { errors.push(`${adm.full_name ?? adm.id}: ${chat.error}`); continue }
    const sent = await sendChatMessage({ chat_id: chat.chat_id, body: message })
    if ('error' in sent) { errors.push(`${adm.full_name ?? adm.id}: ${sent.error}`); continue }
    notified++
  }
  if (notified === 0) {
    return { error: `Falha ao notificar administradores: ${errors.join(' · ')}` }
  }

  // Auditoria (quem pediu, quando, motivo) — exigência do PO
  const { logAudit } = await import('./audit')
  await logAudit({
    action:      'SALE_CORRECTION_REQUESTED',
    entity_type: 'sales',
    entity_id:   saleId,
    details: {
      reason:          trimmedReason,
      requested_by:    profile.full_name ?? null,
      requester_role:  profile.role ?? null,
      total_amount:    Number(sale.total_amount),
      notified_admins: notified,
    },
  })

  revalidatePath('/dashboard/internal-chat')
  return { success: true, notified_admins: notified }
}

// ─── Listar vendas do dia ─────────────────────────────────────────────────────

export async function getDailySales(date?: string): Promise<Sale[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const targetDate = date ?? new Date().toISOString().split('T')[0]
  const startOf = `${targetDate}T00:00:00.000Z`
  const endOf   = `${targetDate}T23:59:59.999Z`

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sales')
    .select(`
      id, clinic_id, seller_id, tutor_id, total_amount, discount_amount,
      payment_method, payment_status, notes, created_at, cancelled_at,
      profiles!seller_id ( full_name ),
      tutors!tutor_id ( name ),
      sale_items ( id, stock_item_id, description, quantity, unit_price, discount )
    `)
    .eq('clinic_id', profile.clinic_id)
    .gte('created_at', startOf)
    .lte('created_at', endOf)
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar vendas: ' + error.message }

  return (data ?? []).map((s: any) => ({
    id:              s.id,
    clinic_id:       s.clinic_id,
    seller_id:       s.seller_id,
    tutor_id:        s.tutor_id,
    total_amount:    Number(s.total_amount),
    discount_amount: Number(s.discount_amount),
    payment_method:  s.payment_method,
    payment_status:  s.payment_status,
    notes:           s.notes,
    created_at:      s.created_at,
    cancelled_at:    s.cancelled_at,
    seller_name:     s.profiles?.full_name ?? null,
    tutor_name:      s.tutors?.name ?? null,
    items: (s.sale_items ?? []).map((i: any) => ({
      id:            i.id,
      stock_item_id: i.stock_item_id,
      description:   i.description,
      quantity:      Number(i.quantity),
      unit_price:    Number(i.unit_price),
      discount:      Number(i.discount),
      total:         Number(i.quantity) * Number(i.unit_price) - Number(i.discount),
    })),
  }))
}

// ─── Resumo de vendas por período ─────────────────────────────────────────────

export async function getSalesSummary(
  startDate: string,
  endDate:   string
): Promise<SalesSummary | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sales')
    .select('id, total_amount, payment_method, payment_status')
    .eq('clinic_id', profile.clinic_id)
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)

  if (error) return { error: 'Erro ao buscar resumo: ' + error.message }

  const rows = data ?? []
  const active = rows.filter((r: any) => r.payment_status !== 'cancelled')
  const cancelled = rows.filter((r: any) => r.payment_status === 'cancelled')

  const byMethod = active.reduce<Record<string, { amount: number; count: number }>>((acc, r: any) => {
    const m = r.payment_method ?? 'other'
    if (!acc[m]) acc[m] = { amount: 0, count: 0 }
    acc[m].amount += Number(r.total_amount)
    acc[m].count  += 1
    return acc
  }, {})

  return {
    total_revenue:   active.reduce((sum: number, r: any) => sum + Number(r.total_amount), 0),
    total_sales:     active.length,
    cancelled_count: cancelled.length,
    by_method: Object.entries(byMethod).map(([method, v]) => ({
      method,
      amount: v.amount,
      count:  v.count,
    })),
  }
}

// ─── Buscar tutores para vincular à venda ─────────────────────────────────────

export interface SaleTutor {
  id:    string
  name:  string
  phone: string
}

export async function searchSalesTutors(query: string): Promise<SaleTutor[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return []

  const { data } = await supabase
    .from('tutors')
    .select('id, name, phone')
    .eq('clinic_id', profile.clinic_id)
    .ilike('name', `%${query.trim()}%`)
    .order('name')
    .limit(10)

  return (data ?? []).map((t: any) => ({
    id:    t.id,
    name:  t.name,
    phone: t.phone ?? '',
  }))
}

// ─── Enviar recibo por WhatsApp ───────────────────────────────────────────────

export async function sendSaleReceipt(params: {
  tutorId:    string
  tutorName:  string
  tutorPhone: string
  saleId:     string
  total:      number
  items:      { description: string; quantity: number; unit_price: number }[]
  clinicName: string
  paymentMethod: string
}): Promise<{ success: boolean } | { error: string }> {
  const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Dinheiro', credit: 'Cartão Crédito', debit: 'Cartão Débito',
    pix: 'Pix', convenio: 'Convênio', other: 'Outro',
  }

  const itemLines = params.items
    .map(i => `• ${i.description} (${i.quantity}x) — R$ ${(i.quantity * i.unit_price).toFixed(2)}`)
    .join('\n')

  const message =
    `Olá, ${params.tutorName}! Segue o comprovante da sua compra em ${params.clinicName}.\n\n` +
    `${itemLines}\n\n` +
    `Total: R$ ${params.total.toFixed(2)}\n` +
    `Pagamento: ${PAYMENT_LABELS[params.paymentMethod] ?? params.paymentMethod}\n\n` +
    `Obrigado pela preferência! 🐾`

  return sendWhatsAppMessage({
    phone:     params.tutorPhone,
    message,
    trigger:   'sale_receipt',
    tutorName: params.tutorName,
    tutorId:   params.tutorId,
  })
}
