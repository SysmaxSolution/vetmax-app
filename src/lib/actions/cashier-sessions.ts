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
  /** Conferência cega: total contado fisicamente pelo operador no fechamento. */
  counted_total?: number | null
  /** Contado por forma de pagamento { cash, pix, credit, debit, ... }. */
  counted_by_method?: Record<string, number> | null
  /** contado − esperado (negativo = quebra de caixa). */
  difference?: number | null
  closing_notes?: string | null
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
  verified_at?: string | null
  verified_by?: string | null
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
 * Totais esperados da sessão para o fechamento com conferência cega.
 * NÃO retorna os valores quebrados por forma ao operador antes da contagem —
 * o componente decide quando exibir (após o operador digitar o contado).
 */
export async function getSessionExpectedTotals(
  sessionId: string,
): Promise<{
  opening_balance: number
  by_method: Record<string, number>
  total_inflows: number
  total_outflows: number
  expected_cash: number      // abertura + entradas em dinheiro − saídas (gaveta)
  expected_total: number     // abertura + todas entradas − saídas
} | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('cashier_sessions')
    .select('opening_balance')
    .eq('id', sessionId)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!session) return { error: 'Sessão não encontrada' }

  // Vincula órfãos à sessão de forma atômica (advisory lock) antes de calcular,
  // para que a query por session_id seja correta por construção (migration 0392).
  const { error: linkErr } = await supabase.rpc('rpc_link_session_orphans', { p_session_id: sessionId })
  if (linkErr) return { error: `Erro ao consolidar lançamentos da sessão: ${linkErr.message}` }

  const [entriesRes, outflowsRes] = await Promise.all([
    supabase
      .from('central_cashier')
      .select('amount, payment_method, status')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId)
      .in('status', ['recorded', 'verified']),
    supabase
      .from('cashier_outflows')
      .select('amount')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId),
  ])
  const entries  = entriesRes.data ?? []
  const outflows = outflowsRes.data ?? []

  const byMethod: Record<string, number> = {}
  let totalInflows = 0
  for (const e of entries) {
    const m = e.payment_method ?? 'nao_informado'
    byMethod[m] = (byMethod[m] ?? 0) + Number(e.amount)
    totalInflows += Number(e.amount)
  }
  const totalOutflows = outflows.reduce((s, o) => s + Number(o.amount), 0)
  const opening = Number(session.opening_balance ?? 0)

  return {
    opening_balance: opening,
    by_method:       byMethod,
    total_inflows:   totalInflows,
    total_outflows:  totalOutflows,
    expected_cash:   opening + (byMethod['cash'] ?? 0) - totalOutflows,
    expected_total:  opening + totalInflows - totalOutflows,
  }
}

// ─── Reconciliação ao vivo (P2) ─────────────────────────────────────────────

export interface SessionReconciliation {
  opening_balance: number
  /** Esperado agora por forma (apenas recorded+verified). */
  by_method: Record<string, number>
  total_inflows: number
  total_outflows: number
  /** abertura + entradas em dinheiro − saídas (esperado na gaveta agora). */
  expected_cash: number
  /** abertura + todas entradas − saídas. */
  expected_total: number
  /** Movimentação por operador (quem registrou entradas / lançou saídas). */
  by_operator: Array<{ id: string; name: string; inflows: number; outflows: number }>
  /** Quanto ainda está pendente de recebimento (status pending) na sessão. */
  pending_amount: number
  /** Consistência: lançamentos órfãos (sem session_id) durante a sessão. 0 = OK. */
  orphan_count: number
}

/**
 * Posição atual do caixa a qualquer momento — sem fechar a sessão.
 * Permite ao gerente reconciliar em tempo real e detectar divergência ANTES
 * do fechamento, além de auditar a movimentação por operador.
 */
export async function getSessionReconciliation(
  sessionId: string,
): Promise<SessionReconciliation | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado à reconciliação do caixa' }
  }

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('cashier_sessions')
    .select('opening_balance')
    .eq('id', sessionId)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!session) return { error: 'Sessão não encontrada' }

  // Consolida órfãos na sessão (atômico) antes de medir.
  const { error: linkErr } = await supabase.rpc('rpc_link_session_orphans', { p_session_id: sessionId })
  if (linkErr) return { error: `Erro ao consolidar lançamentos: ${linkErr.message}` }

  const [entriesRes, outflowsRes, orphanRes] = await Promise.all([
    supabase
      .from('central_cashier')
      .select('amount, payment_method, status, recorded_by')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId)
      .neq('status', 'reversed')
      .neq('status', 'archived'),
    supabase
      .from('cashier_outflows')
      .select('amount, created_by')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId),
    supabase
      .from('v_cashier_orphan_entries')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id),
  ])

  const entries  = entriesRes.data ?? []
  const outflows = outflowsRes.data ?? []

  const byMethod: Record<string, number> = {}
  const opAgg: Record<string, { inflows: number; outflows: number }> = {}
  let totalInflows = 0
  let pendingAmount = 0

  for (const e of entries) {
    const amt = Number(e.amount)
    if (e.status === 'pending') { pendingAmount += amt; continue }
    // recorded/verified entram no esperado
    const m = e.payment_method ?? 'nao_informado'
    byMethod[m] = (byMethod[m] ?? 0) + amt
    totalInflows += amt
    const op = e.recorded_by ?? 'desconhecido'
    opAgg[op] = opAgg[op] ?? { inflows: 0, outflows: 0 }
    opAgg[op].inflows += amt
  }

  let totalOutflows = 0
  for (const o of outflows) {
    const amt = Number(o.amount)
    totalOutflows += amt
    const op = o.created_by ?? 'desconhecido'
    opAgg[op] = opAgg[op] ?? { inflows: 0, outflows: 0 }
    opAgg[op].outflows += amt
  }

  // Resolve nomes dos operadores
  const opIds = Object.keys(opAgg).filter(id => id !== 'desconhecido')
  const names: Record<string, string> = {}
  if (opIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', opIds)
    for (const p of profiles ?? []) names[p.id] = p.full_name
  }

  const opening = Number(session.opening_balance ?? 0)
  return {
    opening_balance: opening,
    by_method:       byMethod,
    total_inflows:   totalInflows,
    total_outflows:  totalOutflows,
    expected_cash:   opening + (byMethod['cash'] ?? 0) - totalOutflows,
    expected_total:  opening + totalInflows - totalOutflows,
    by_operator: Object.entries(opAgg)
      .map(([id, v]) => ({ id, name: names[id] ?? 'Operador', inflows: v.inflows, outflows: v.outflows }))
      .sort((a, b) => (b.inflows + b.outflows) - (a.inflows + a.outflows)),
    pending_amount:  pendingAmount,
    orphan_count:    orphanRes.count ?? 0,
  }
}

/**
 * Close the current open session and generate closing report.
 * `conference` (opcional) grava a conferência cega: o que o operador contou,
 * por forma de pagamento, e a divergência vs esperado.
 */
export async function closeCashierSession(
  sessionId: string,
  conference?: {
    counted_by_method: Record<string, number>
    closing_notes?: string
  },
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

  // Vincula órfãos à sessão (advisory lock) antes de somar, para que o
  // comprovante salvo bata com a conferência exibida ao operador (migration 0392).
  const { error: linkErr } = await supabase.rpc('rpc_link_session_orphans', { p_session_id: sessionId })
  if (linkErr) return { error: `Erro ao consolidar lançamentos da sessão: ${linkErr.message}` }

  // Fetch all entries for this session
  const [entriesRes, outflowsRes] = await Promise.all([
    supabase
      .from('central_cashier')
      .select('amount, status, source_module, payment_method')
      .eq('clinic_id', ctx.clinic_id)
      .eq('session_id', sessionId)
      .neq('status', 'reversed')
      // Arquivados (lump da venda substituído pelos splits) não entram no total
      // do fechamento — senão o mesmo valor conta em dobro no closing_balance.
      .neq('status', 'archived'),

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

  // Conferência cega: compara o contado pelo operador com o esperado
  const countedTotal = conference
    ? Object.values(conference.counted_by_method).reduce((s, v) => s + Number(v || 0), 0)
    : null
  const difference = countedTotal != null ? countedTotal - closingBalance : null

  // Close the session
  const { error: closeErr } = await supabase
    .from('cashier_sessions')
    .update({
      status:            'closed',
      closed_by:         ctx.user_id,
      closed_at:         new Date().toISOString(),
      closing_balance:   closingBalance,
      counted_total:     countedTotal,
      counted_by_method: conference?.counted_by_method ?? null,
      difference,
      closing_notes:     conference?.closing_notes ?? null,
    })
    .eq('id', sessionId)
    .eq('clinic_id', ctx.clinic_id)

  if (closeErr) return { error: `Erro ao fechar caixa: ${closeErr.message}` }

  revalidatePath('/dashboard/cashier')

  return {
    session: {
      ...session, status: 'closed', closing_balance: closingBalance,
      counted_total: countedTotal, difference,
      counted_by_method: conference?.counted_by_method ?? null,
      closing_notes: conference?.closing_notes ?? null,
    },
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
 * Histórico de fechamentos da clínica (mais recentes primeiro),
 * com divergência de conferência para auditoria por operador.
 */
export async function listClosedSessions(limit = 30): Promise<
  Array<CashierSession & { opened_by_name?: string; closed_by_name?: string }> | { error: string }
> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado ao histórico de fechamentos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cashier_sessions')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  const sessions = data ?? []

  // Resolve nomes dos operadores (abertura/fechamento)
  const userIds = [...new Set(sessions.flatMap(s => [s.opened_by, s.closed_by]).filter(Boolean))]
  const names: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)
    for (const p of profiles ?? []) names[p.id] = p.full_name
  }

  return sessions.map(s => ({
    ...s,
    opened_by_name: names[s.opened_by],
    closed_by_name: s.closed_by ? names[s.closed_by] : undefined,
  }))
}

/**
 * Verifica (confere) uma saída de caixa — admin/contador.
 * Espelho do verifyCashierEntry para o lado das saídas.
 */
export async function verifyOutflow(outflowId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext()
  if ('error' in ctx) return ctx

  if (!['admin', 'owner', 'accountant'].includes(ctx.role)) {
    return { error: 'Apenas administradores e contadores podem verificar saídas' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cashier_outflows')
    .update({ verified_at: new Date().toISOString(), verified_by: ctx.user_id })
    .eq('id', outflowId)
    .eq('clinic_id', ctx.clinic_id)
    .is('verified_at', null)

  if (error) return { error: `Erro ao verificar saída: ${error.message}` }

  revalidatePath('/dashboard/cashier')
  return { success: true }
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
    // Não puxa lançamentos arquivados (supersedidos) para a sessão — eles não
    // devem entrar na reconciliação/fechamento.
    .neq('status', 'archived')
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
