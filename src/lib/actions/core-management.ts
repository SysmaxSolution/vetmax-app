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
  payment_card_id?: string | null
  card_nsu?: string | null
  card_authorization?: string | null
  card_installments?: number | null
  effective_date?: string | null
  created_at: string
  recorded_by?: string
}

export type CashierSummary = {
  /** A receber do TUTOR no balcão (exclui repasse futuro de convênio/Petlove). */
  total_pending:  number
  /** Total movimentado registrado: entradas efetivadas (recorded+verified) − saídas. */
  total_recorded: number
  /** Total já conferido pelo admin: entradas verificadas − saídas verificadas. */
  total_verified: number
  /** Total de movimentações no período (entradas não arquivadas + saídas). */
  entry_count: number
  period: { from: string; to: string }
  // ── Detalhamento para os cards e o rodapé de saldo ──
  inflows_received:  number   // entradas efetivadas (recorded + verified)
  inflows_cash:      number   // entradas efetivadas em dinheiro (espécie)
  outflows_total:    number   // saídas do período
  outflows_verified: number   // saídas já verificadas pelo admin
  inflows_verified:  number   // entradas verificadas
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
  // Arquivados são lançamentos supersedidos (ex.: o "lump" da venda PDV que foi
  // substituído pelos splits). Só aparecem se o usuário filtrar explicitamente
  // por status='archived'; caso contrário ficam ocultos da lista ativa para não
  // duplicar o valor (um Recebido + um Arquivado).
  if (filters?.status) query = query.eq('status', filters.status)
  else query = query.neq('status', 'archived')
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
  const toEnd = period.to_date + 'T23:59:59.999Z'
  const [entriesRes, outflowsRes] = await Promise.all([
    supabase
      .from('central_cashier')
      .select('amount, status, payment_method')
      .eq('clinic_id', ctx.clinic_id)
      .neq('status', 'archived')   // arquivados não entram no resumo (nem no entry_count)
      .gte('created_at', period.from_date)
      // Append end-of-day to include all records created during to_date (timestamp vs date comparison)
      .lte('created_at', toEnd),
    supabase
      .from('cashier_outflows')
      .select('amount, verified_at')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', period.from_date)
      .lte('created_at', toEnd),
  ])

  if (entriesRes.error) return { error: `Erro ao buscar: ${entriesRes.error.message}` }
  if (outflowsRes.error) return { error: `Erro ao buscar saídas: ${outflowsRes.error.message}` }

  const entries  = entriesRes.data || []
  const outflows = outflowsRes.data || []
  const sum = (arr: { amount: number }[]) => arr.reduce((s, e) => s + Number(e.amount), 0)

  // A receber do tutor no balcão: pendentes EXCETO modalidade convênio
  // (repasse futuro Petlove não passa pelo caixa — fica em Contas a Receber).
  const pendingTutor = entries.filter(e =>
    e.status === 'pending' && !['insurance', 'convenio'].includes(e.payment_method ?? ''))

  const received         = entries.filter(e => e.status === 'recorded' || e.status === 'verified')
  const receivedCash     = received.filter(e => e.payment_method === 'cash')
  const inflowsVerified  = entries.filter(e => e.status === 'verified')
  const outflowsVerified = outflows.filter(o => o.verified_at != null)
  const activeEntries    = entries.filter(e => e.status !== 'reversed')

  const summary: CashierSummary = {
    total_pending:     sum(pendingTutor),
    total_recorded:    sum(received) - sum(outflows),
    total_verified:    sum(inflowsVerified) - sum(outflowsVerified),
    entry_count:       activeEntries.length + outflows.length,
    period:            { from: period.from_date, to: period.to_date },
    inflows_received:  sum(received),
    inflows_cash:      sum(receivedCash),
    outflows_total:    sum(outflows),
    outflows_verified: sum(outflowsVerified),
    inflows_verified:  sum(inflowsVerified),
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
