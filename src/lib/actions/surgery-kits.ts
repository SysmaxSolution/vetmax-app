'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { consumeStockForApplication } from './stock-consumption'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface KitItem {
  stock_item_id: string | null
  item_name:     string
  quantity:      number
}
export interface ServiceKitSummary { id: string; name: string; description: string | null; item_count: number }
export interface ServiceKit extends ServiceKitSummary { items: KitItem[] }

export interface SurgeryChargeRow {
  id: string; kind: string; description: string; amount: number; status: string; created_at: string
}
export interface SurgeryAccount { charges: SurgeryChargeRow[]; total: number }

export interface ApplyKitResult {
  charged: number          // valor lançado na fatura
  consumed: number         // itens baixados do estoque
  reconciliation: number   // itens que ficaram negativos (requires_reconciliation)
}

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── Kits CRUD ────────────────────────────────────────────────────────────────

export async function listServiceKits(): Promise<ServiceKitSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('service_kits')
    .select('id, name, description, service_kit_items(count)')
    .eq('clinic_id', ctx.clinicId).eq('is_active', true)
    .order('name', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []).map((r): ServiceKitSummary => ({
    id: r.id as string, name: r.name as string, description: (r.description as string | null) ?? null,
    item_count: Number((r.service_kit_items as { count: number }[] | null)?.[0]?.count ?? 0),
  }))
}

export async function createServiceKit(payload: { name: string; description?: string | null; items: KitItem[] }): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.name?.trim()) return { error: 'Informe o nome do kit.' }
  const items = (payload.items ?? []).filter(i => i.item_name?.trim() && i.quantity > 0)
  if (items.length === 0) return { error: 'Adicione ao menos um insumo ao kit.' }

  const admin = createAdminClient()
  const { data: kit, error } = await admin.from('service_kits')
    .insert({ clinic_id: ctx.clinicId, name: payload.name.trim(), description: payload.description?.trim() || null, created_by: ctx.userId })
    .select('id').single()
  if (error) return { error: 'Erro ao criar kit: ' + error.message }

  const rows = items.map((i, idx) => ({
    clinic_id: ctx.clinicId, kit_id: kit.id as string,
    stock_item_id: i.stock_item_id ?? null, item_name: i.item_name.trim(),
    quantity: i.quantity, sort_order: idx,
  }))
  const { error: itErr } = await admin.from('service_kit_items').insert(rows)
  if (itErr) { await admin.from('service_kits').delete().eq('id', kit.id); return { error: 'Erro ao salvar insumos: ' + itErr.message } }

  revalidatePath('/dashboard/surgery')
  return { id: kit.id as string }
}

export async function getServiceKit(id: string): Promise<ServiceKit | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data: kit, error } = await admin
    .from('service_kits')
    .select('id, name, description')
    .eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (error || !kit) return { error: error?.message ?? 'Kit não encontrado.' }
  const { data: items } = await admin
    .from('service_kit_items')
    .select('stock_item_id, item_name, quantity')
    .eq('kit_id', id).eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
  return {
    id: kit.id as string, name: kit.name as string, description: (kit.description as string | null) ?? null,
    item_count: items?.length ?? 0,
    items: (items ?? []).map((i): KitItem => ({
      stock_item_id: (i.stock_item_id as string | null) ?? null,
      item_name: i.item_name as string, quantity: Number(i.quantity ?? 1),
    })),
  }
}

export async function updateServiceKit(id: string, payload: { name: string; description?: string | null; items: KitItem[] }): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.name?.trim()) return { error: 'Informe o nome do kit.' }
  const items = (payload.items ?? []).filter(i => i.item_name?.trim() && i.quantity > 0)
  if (items.length === 0) return { error: 'Adicione ao menos um insumo ao kit.' }

  const admin = createAdminClient()
  const { error: upErr } = await admin.from('service_kits')
    .update({ name: payload.name.trim(), description: payload.description?.trim() || null })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (upErr) return { error: 'Erro ao atualizar kit: ' + upErr.message }

  // Substitui os insumos (delete + reinsert) para refletir a edição.
  await admin.from('service_kit_items').delete().eq('kit_id', id).eq('clinic_id', ctx.clinicId)
  const rows = items.map((i, idx) => ({
    clinic_id: ctx.clinicId, kit_id: id,
    stock_item_id: i.stock_item_id ?? null, item_name: i.item_name.trim(),
    quantity: i.quantity, sort_order: idx,
  }))
  const { error: itErr } = await admin.from('service_kit_items').insert(rows)
  if (itErr) return { error: 'Erro ao salvar insumos: ' + itErr.message }

  revalidatePath('/dashboard/surgery')
  return { success: true }
}

export async function deleteServiceKit(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin.from('service_kits').update({ is_active: false }).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

// ─── Aplicar Kit a uma cirurgia (baixa FIFO + fatura) ─────────────────────────

/**
 * Faz o unroll do kit: consome cada insumo via rpc_apply_stock_consumption
 * (FIFO da Fase 1b) e lança o valor total na fatura da cirurgia (surgery_charges).
 */
export async function applyKitToSurgery(kitId: string, surgeryId: string): Promise<ApplyKitResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: kit } = await admin.from('service_kits').select('id, name').eq('id', kitId).eq('clinic_id', ctx.clinicId).single()
  if (!kit) return { error: 'Kit não encontrado.' }

  const { data: surgery } = await admin.from('surgeries').select('id').eq('id', surgeryId).eq('clinic_id', ctx.clinicId).single()
  if (!surgery) return { error: 'Cirurgia não encontrada.' }

  const { data: items } = await admin
    .from('service_kit_items')
    .select('stock_item_id, item_name, quantity')
    .eq('kit_id', kitId).eq('clinic_id', ctx.clinicId).order('sort_order', { ascending: true })
  if (!items || items.length === 0) return { error: 'Kit sem insumos.' }

  // Preços unitários dos insumos vinculados a estoque.
  const stockIds = items.map(i => i.stock_item_id).filter((x): x is string => !!x)
  const priceMap = new Map<string, number>()
  if (stockIds.length > 0) {
    const { data: stk } = await admin.from('stock_items').select('id, unit_price').in('id', stockIds)
    for (const r of stk ?? []) priceMap.set(r.id as string, Number(r.unit_price ?? 0))
  }

  let total = 0, consumed = 0, reconciliation = 0
  for (const it of items) {
    const qty = Number(it.quantity ?? 1)
    if (it.stock_item_id) {
      const res = await consumeStockForApplication({
        stock_item_id:   it.stock_item_id as string,
        medication_name: it.item_name as string,
        quantity:        qty,
        source:          'CONSULTATION',
        reference_id:    surgeryId,
        notes:           `Kit Cirúrgico: ${kit.name}`,
      })
      if (!('error' in res)) {
        consumed++
        if (res.requires_reconciliation) reconciliation++
      }
      total += (priceMap.get(it.stock_item_id as string) ?? 0) * qty
    }
  }

  // Lança o valor total do kit na fatura da cirurgia.
  await admin.from('surgery_charges').insert({
    clinic_id: ctx.clinicId, surgery_id: surgeryId, kind: 'kit',
    description: `Kit: ${kit.name}`, quantity: 1, unit_amount: total, amount: total,
    status: 'open', source_ref: kitId, created_by: ctx.userId,
  })

  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/pharmacy')
  return { charged: total, consumed, reconciliation }
}

// ─── Fatura da cirurgia ───────────────────────────────────────────────────────

export async function getSurgeryAccount(surgeryId: string): Promise<SurgeryAccount | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('surgery_charges')
    .select('id, kind, description, amount, status, created_at')
    .eq('clinic_id', ctx.clinicId).eq('surgery_id', surgeryId).neq('status', 'void')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  const charges = (data ?? []).map((r): SurgeryChargeRow => ({
    id: r.id as string, kind: r.kind as string, description: r.description as string,
    amount: Number(r.amount ?? 0), status: r.status as string, created_at: r.created_at as string,
  }))
  return { charges, total: charges.reduce((s, c) => s + c.amount, 0) }
}
