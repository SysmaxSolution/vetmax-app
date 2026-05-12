'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductPrice = {
  id: string
  clinic_id: string
  name: string
  category: 'grooming_supplies' | 'medications' | 'exams' | 'services' | 'other'
  price: number
  is_active: boolean
  created_at: string
  created_by?: string
}

export type CentralCashierEntry = {
  id: string
  clinic_id: string
  source_module: 'grooming' | 'pharmacy' | 'consultation' | 'exam' | 'manual' | 'adjustment'
  source_id?: string
  amount: number
  status: 'recorded' | 'verified' | 'archived'
  reason?: string
  created_at: string
  recorded_by?: string
}

export type CashierSummary = {
  total_recorded: number
  total_verified: number
  entry_count: number
  period: { from: string; to: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClinicContext(): Promise<{ clinic_id: string; user_id: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }

  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string }
}

// ─── Product Prices ───────────────────────────────────────────────────────────

/**
 * List all active product prices for a clinic.
 */
export async function listProductPrices(filters?: {
  category?: string
  is_active?: boolean
}): Promise<ProductPrice[] | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  let query = supabase
    .from('product_prices')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)

  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active)

  const { data, error } = await query.order('category').order('name')

  if (error) return { error: `Erro ao listar preços: ${error.message}` }

  return data || []
}

/**
 * Create or update a product price entry.
 */
export async function upsertProductPrice(data: {
  name: string
  category: string
  price: number
  is_active?: boolean
  id?: string // if provided, updates existing
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  // Only admin/owner can modify prices
  if (!['admin', 'owner'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem gerenciar preços' }
  }

  if (data.price < 0) return { error: 'Preço não pode ser negativo' }

  const supabase = await createClient()

  const payload = {
    clinic_id: ctx.clinic_id,
    name: data.name.trim(),
    category: data.category,
    price: data.price,
    is_active: data.is_active !== false,
    created_by: ctx.user_id,
  }

  if (data.id) {
    // Update
    const { data: result, error } = await supabase
      .from('product_prices')
      .update(payload)
      .eq('id', data.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()

    if (error) return { error: `Erro ao atualizar: ${error.message}` }
    revalidatePath('/dashboard/settings/pricing')
    return { id: result.id }
  } else {
    // Insert
    const { data: result, error } = await supabase
      .from('product_prices')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      if (error.message.includes('unique')) {
        return { error: `Produto "${data.name}" já existe nesta categoria` }
      }
      return { error: `Erro ao criar: ${error.message}` }
    }

    revalidatePath('/dashboard/settings/pricing')
    return { id: result.id }
  }
}

/**
 * Delete a product price (soft delete via is_active).
 */
export async function deactivateProductPrice(priceId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem deletar preços' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('product_prices')
    .update({ is_active: false })
    .eq('id', priceId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: `Erro ao deletar: ${error.message}` }

  revalidatePath('/dashboard/settings/pricing')
  return { success: true }
}

// ─── Central Cashier ──────────────────────────────────────────────────────────

/**
 * Record a manual cashier entry (adjustment, payment, etc).
 */
export async function recordCashierEntry(data: {
  source_module: string
  source_id?: string
  amount: number
  reason?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (data.amount === 0) return { error: 'Valor não pode ser zero' }

  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('central_cashier')
    .insert({
      clinic_id: ctx.clinic_id,
      source_module: data.source_module,
      source_id: data.source_id || null,
      amount: data.amount,
      reason: data.reason || null,
      recorded_by: ctx.user_id,
    })
    .select('id')
    .single()

  if (error) return { error: `Erro ao registrar: ${error.message}` }

  revalidatePath('/dashboard/cashier')
  return { id: result.id }
}

/**
 * List cashier entries for a clinic with optional filters.
 */
export async function listCashierEntries(filters?: {
  source_module?: string
  status?: string
  from_date?: string // ISO date
  to_date?: string // ISO date
}): Promise<CentralCashierEntry[] | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'accountant', 'manager', 'receptionist'].includes(ctx.role)) {
    return { error: 'Acesso negado ao cashier' }
  }

  const supabase = await createClient()
  let query = supabase
    .from('central_cashier')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)

  if (filters?.source_module) query = query.eq('source_module', filters.source_module)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.from_date) query = query.gte('created_at', filters.from_date)
  // Append end-of-day to include all records created during to_date (timestamp vs date comparison)
  if (filters?.to_date) query = query.lte('created_at', filters.to_date + 'T23:59:59.999Z')

  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)

  if (error) return { error: `Erro ao listar: ${error.message}` }

  return data || []
}

/**
 * Get cashier summary for a date range.
 */
export async function getCashierSummary(period: {
  from_date: string // ISO date
  to_date: string // ISO date
}): Promise<CashierSummary | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'accountant', 'manager', 'receptionist'].includes(ctx.role)) {
    return { error: 'Acesso negado ao cashier' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('central_cashier')
    .select('amount, status')
    .eq('clinic_id', ctx.clinic_id)
    .gte('created_at', period.from_date)
    // Append end-of-day to include all records created during to_date (timestamp vs date comparison)
    .lte('created_at', period.to_date + 'T23:59:59.999Z')

  if (error) return { error: `Erro ao buscar: ${error.message}` }

  const entries = data || []
  const summary: CashierSummary = {
    total_recorded: entries.filter((e) => e.status === 'recorded').reduce((sum, e) => sum + Number(e.amount), 0),
    total_verified: entries.filter((e) => e.status === 'verified').reduce((sum, e) => sum + Number(e.amount), 0),
    entry_count: entries.length,
    period: { from: period.from_date, to: period.to_date },
  }

  return summary
}

/**
 * Verify (mark as verified) a cashier entry.
 */
export async function verifyCashierEntry(entryId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'accountant'].includes(ctx.role)) {
    return { error: 'Apenas contadores podem verificar' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('central_cashier')
    .update({ status: 'verified' })
    .eq('id', entryId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: `Erro ao verificar: ${error.message}` }

  revalidatePath('/dashboard/cashier')
  return { success: true }
}

/**
 * Archive (hide from active list) a cashier entry.
 */
export async function archiveCashierEntry(entryId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner'].includes(ctx.role)) {
    return { error: 'Apenas administradores podem arquivar' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('central_cashier')
    .update({ status: 'archived' })
    .eq('id', entryId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: `Erro ao arquivar: ${error.message}` }

  revalidatePath('/dashboard/cashier')
  return { success: true }
}
