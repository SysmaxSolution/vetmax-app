'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CentralCashierEntry = {
  id: string
  clinic_id: string
  source_module: 'grooming' | 'pharmacy' | 'consultation' | 'exam' | 'manual' | 'adjustment' | 'sales'
  source_id?: string
  amount: number
  status: 'pending' | 'recorded' | 'verified' | 'archived' | 'reversed'
  reason?: string
  patient_name?: string
  tutor_name?: string
  payment_method?: string
  created_at: string
  recorded_by?: string
}

export type CashierSummary = {
  total_pending:  number
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
    total_pending:  entries.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0),
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
