'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendWhatsAppMessage } from './whatsapp'
import { isEAN } from '@/lib/utils/ean'

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
  notes?:           string | null
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
  })

  if (error) return { error: 'Erro ao registrar venda: ' + error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/cashier')

  return { id: (data as any).id, total: Number((data as any).total) }
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
