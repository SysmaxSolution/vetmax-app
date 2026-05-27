'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CashierSessionStatus = 'open' | 'closed'

export interface CashierSession {
  id: string
  clinic_id: string
  opened_by: string
  opened_at: string
  closed_by?: string
  closed_at?: string
  opening_balance: number
  closing_balance?: number
  status: CashierSessionStatus
  notes?: string
}

export interface CashierOutflow {
  id: string
  clinic_id: string
  session_id?: string
  amount: number
  category: 'sangria' | 'despesa_operacional' | 'fornecedor' | 'estorno' | 'troco' | 'other'
  description: string
  supplier_id?: string | null
  created_by: string
  created_at: string
}

export interface CashierDashboard {
  total_inflows: number
  total_outflows: number
  net_balance: number
  pending_amount: number
  pending_count: number
  session_id?: string
  session_status?: string
  opening_balance?: number
  by_payment_method: Record<string, { amount: number; count: number }>
}

export interface CashierClosingReport {
  session: CashierSession
  total_inflows: number
  total_outflows: number
  net_balance: number
  by_module: Record<string, { amount: number; count: number }>
  by_payment_method: Record<string, { amount: number; count: number }>
  outflows: CashierOutflow[]
  entry_count: number
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getClinicContext(): Promise<
  { clinic_id: string; user_id: string; role: string } | { error: string }
> {
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

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Open a new cashier session for today.
 * Only admin/owner/manager. One session per clinic (enforced by UNIQUE partial index).
 */
export async function openCashierSession(
  openingBalance: number = 0,
  notes?: string,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas gerentes podem abrir o caixa' }
  }

  if (openingBalance < 0) return { error: 'Saldo de abertura não pode ser negativo' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cashier_sessions')
    .insert({
      clinic_id:       ctx.clinic_id,
      opened_by:       ctx.user_id,
      opening_balance: openingBalance,
      notes:           notes ?? null,
      status:          'open',
    })
    .select('id')
    .single()

  if (error) {
    if (error.message.includes('uidx_cashier_sessions_one_open_per_clinic')) {
      return { error: 'Já existe um caixa aberto para esta clínica. Feche-o antes de abrir outro.' }
    }
    return { error: `Erro ao abrir caixa: ${error.message}` }
  }

  revalidatePath('/dashboard/cashier')
  return { id: data.id }
}

/**
 * Close the current open session and generate closing report.
 */
export async function closeCashierSession(
  sessionId: string,
): Promise<CashierClosingReport | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas gerentes podem fechar o caixa' }
  }

  const supabase = await createClient()

  // Fetch session
  const { data: session, error: sesErr } = await supabase
    .from('cashier_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (sesErr || !session) return { error: 'Sessão não encontrada' }
  if (session.status === 'closed') return { error: 'Sessão já está fechada' }

  // Fetch all entries for this session
  const [entriesRes, outflowsRes] = await Promise.all([
    supabase
      .from('central_cashier')
      .select('amount, status, source_module, payment_method')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId)
      .neq('status', 'reversed'),

    supabase
      .from('cashier_outflows')
      .select('*')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId),
  ])

  if (entriesRes.error) return { error: `Erro ao buscar lançamentos: ${entriesRes.error.message}` }
  if (outflowsRes.error) return { error: `Erro ao buscar saídas: ${outflowsRes.error.message}` }

  const entries  = entriesRes.data ?? []
  const outflows = outflowsRes.data ?? []

  const totalInflows  = entries.reduce((s, e) => s + Number(e.amount), 0)
  const totalOutflows = outflows.reduce((s, o) => s + Number(o.amount), 0)
  const closingBalance = (session.opening_balance ?? 0) + totalInflows - totalOutflows

  // Aggregates
  const byModule: Record<string, { amount: number; count: number }> = {}
  const byMethod: Record<string, { amount: number; count: number }> = {}

  for (const e of entries) {
    const mod = e.source_module ?? 'other'
    byModule[mod] = byModule[mod] ?? { amount: 0, count: 0 }
    byModule[mod].amount += Number(e.amount)
    byModule[mod].count  += 1

    const method = e.payment_method ?? 'nao_informado'
    byMethod[method] = byMethod[method] ?? { amount: 0, count: 0 }
    byMethod[method].amount += Number(e.amount)
    byMethod[method].count  += 1
  }

  // Close the session
  const { error: closeErr } = await supabase
    .from('cashier_sessions')
    .update({
      status:          'closed',
      closed_by:       ctx.user_id,
      closed_at:       new Date().toISOString(),
      closing_balance: closingBalance,
    })
    .eq('id', sessionId)
    .eq('clinic_id', ctx.clinic_id)

  if (closeErr) return { error: `Erro ao fechar caixa: ${closeErr.message}` }

  revalidatePath('/dashboard/cashier')

  return {
    session: { ...session, status: 'closed', closing_balance: closingBalance },
    total_inflows:       totalInflows,
    total_outflows:      totalOutflows,
    net_balance:         closingBalance,
    by_module:           byModule,
    by_payment_method:   byMethod,
    outflows,
    entry_count:         entries.length,
  }
}

/**
 * Get current open session for today (if any).
 */
export async function getCurrentSession(): Promise<CashierSession | null | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cashier_sessions')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'open')
    .single()

  if (error && error.code !== 'PGRST116') return { error: error.message }
  return data ?? null
}

// ─── Orphan Sales Hook ────────────────────────────────────────────────────────

/**
 * Vincula lançamentos do central_cashier sem session_id (vendas órfãs do dia)
 * à sessão recém-aberta. Chamado automaticamente após openCashierSession.
 */
export async function linkOrphanSalesToSession(sessionId: string): Promise<void> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return

  const today = new Date().toISOString().split('T')[0]
  const supabase = await createClient()

  await supabase
    .from('central_cashier')
    .update({ session_id: sessionId })
    .eq('clinic_id', ctx.clinic_id)
    .is('session_id', null)
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lte('created_at', `${today}T23:59:59.999Z`)
}

// ─── Outflows (Saídas) ────────────────────────────────────────────────────────

/**
 * Register a cash outflow (expense, sangria, etc).
 * Only admin/owner/manager.
 */
export async function registerOutflow(data: {
  amount: number
  category: CashierOutflow['category']
  description: string
  session_id?: string
  supplier_id?: string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas gerentes podem registrar saídas' }
  }

  if (data.amount <= 0) return { error: 'Valor deve ser positivo' }
  if (!data.description.trim()) return { error: 'Descrição é obrigatória' }

  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('cashier_outflows')
    .insert({
      clinic_id:   ctx.clinic_id,
      session_id:  data.session_id ?? null,
      amount:      data.amount,
      category:    data.category,
      description: data.description.trim(),
      supplier_id: data.supplier_id ?? null,
      created_by:  ctx.user_id,
    })
    .select('id')
    .single()

  if (error) return { error: `Erro ao registrar saída: ${error.message}` }

  revalidatePath('/dashboard/cashier')
  return { id: result.id }
}

/**
 * List outflows for the current session or today.
 */
export async function listOutflows(filters?: {
  session_id?: string
  date?: string
}): Promise<CashierOutflow[] | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager', 'accountant', 'receptionist'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const supabase = await createClient()
  let query = supabase
    .from('cashier_outflows')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)

  if (filters?.session_id) query = query.eq('session_id', filters.session_id)
  if (filters?.date) {
    query = query
      .gte('created_at', `${filters.date}T00:00:00`)
      .lte('created_at', `${filters.date}T23:59:59`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return data ?? []
}

// ─── Reversal ─────────────────────────────────────────────────────────────────

/**
 * Reverse (estornar) a cashier entry. Calls the DB RPC for atomic execution.
 * Only admin/owner/manager. Reason is mandatory.
 */
export async function reverseCashierEntry(
  entryId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas gerentes podem estornar lançamentos' }
  }

  if (!reason.trim()) return { error: 'Justificativa de estorno é obrigatória' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rpc_reverse_cashier_entry', {
    p_entry_id:    entryId,
    p_reason:      reason.trim(),
    p_reversed_by: ctx.user_id,
  })

  if (error) return { error: `Erro ao estornar: ${error.message}` }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.success) return { error: result?.message ?? 'Estorno falhou' }

  revalidatePath('/dashboard/cashier')
  return { success: true }
}

// ─── Dashboard Aggregate ──────────────────────────────────────────────────────

/**
 * Get cashier dashboard data for a given date.
 */
export async function getCashierDashboard(
  date?: string,
): Promise<CashierDashboard | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager', 'accountant', 'receptionist'].includes(ctx.role)) {
    return { error: 'Acesso negado ao caixa' }
  }

  const targetDate = date ?? new Date().toISOString().split('T')[0]
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('rpc_get_cashier_dashboard', {
    p_clinic_id: ctx.clinic_id,
    p_date:      targetDate,
  })

  if (error) return { error: `Erro ao buscar dashboard: ${error.message}` }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return {
    total_inflows: 0, total_outflows: 0, net_balance: 0,
    pending_amount: 0, pending_count: 0, by_payment_method: {},
  }

  return {
    total_inflows:       Number(row.total_inflows ?? 0),
    total_outflows:      Number(row.total_outflows ?? 0),
    net_balance:         Number(row.net_balance ?? 0),
    pending_amount:      Number(row.pending_amount ?? 0),
    pending_count:       Number(row.pending_count ?? 0),
    session_id:          row.session_id ?? undefined,
    session_status:      row.session_status ?? undefined,
    opening_balance:     Number(row.opening_balance ?? 0),
    by_payment_method:   row.by_payment_method ?? {},
  }
}
