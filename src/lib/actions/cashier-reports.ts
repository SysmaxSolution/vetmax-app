'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashierReportFilters {
  from:           string                  // YYYY-MM-DD
  to:             string                  // YYYY-MM-DD
  source_module?: string
  payment_method?:string
  status?:        string
  supplier_id?:   string
  q?:             string
  limit?:         number
}

export interface CashierReportRow {
  entry_id:       string
  entry_type:     'inflow' | 'outflow'
  occurred_at:    string
  amount:         number
  source_module:  string
  payment_method: string | null
  status:         string
  patient_name:   string | null
  tutor_name:     string | null
  supplier_id:    string | null
  supplier_name:  string | null
  description:    string | null
}

export interface CashierReportSummary {
  rows:               CashierReportRow[]
  totals: {
    inflows:          number
    outflows:         number
    balance:          number
    count:            number
  }
  by_module:          Record<string, { amount: number; count: number }>
  by_payment_method:  Record<string, { amount: number; count: number }>
  by_supplier:        Record<string, { amount: number; count: number }>
  by_day:             Array<{ date: string; inflows: number; outflows: number }>
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

// ─── Generate Report ──────────────────────────────────────────────────────────

export async function generateCashierReport(
  filters: CashierReportFilters,
): Promise<CashierReportSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  if (!['admin','owner','manager','accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado aos relatórios' }
  }

  if (!filters.from || !filters.to) return { error: 'Período é obrigatório' }
  if (filters.from > filters.to) return { error: 'Data inicial maior que final' }

  const rpcFilters: Record<string, unknown> = {}
  if (filters.source_module)  rpcFilters.source_module  = filters.source_module
  if (filters.payment_method) rpcFilters.payment_method = filters.payment_method
  if (filters.status)         rpcFilters.status         = filters.status
  if (filters.supplier_id)    rpcFilters.supplier_id    = filters.supplier_id
  if (filters.q?.trim())      rpcFilters.q              = filters.q.trim()
  if (filters.limit)          rpcFilters.limit          = Math.min(filters.limit, 5000)

  const { data, error } = await ctx.supabase.rpc('rpc_cashier_report', {
    p_clinic_id: ctx.clinic_id,
    p_from:      filters.from,
    p_to:        filters.to,
    p_filters:   rpcFilters,
  })

  if (error) return { error: `Erro ao gerar relatório: ${error.message}` }

  const rows = (data ?? []) as CashierReportRow[]

  // Aggregations
  let totalInflows = 0
  let totalOutflows = 0
  const byModule:   Record<string, { amount: number; count: number }> = {}
  const byMethod:   Record<string, { amount: number; count: number }> = {}
  const bySupplier: Record<string, { amount: number; count: number }> = {}
  const byDayMap:   Record<string, { inflows: number; outflows: number }> = {}

  for (const r of rows) {
    const amt = Number(r.amount)
    if (r.entry_type === 'inflow') totalInflows += amt
    else totalOutflows += amt

    byModule[r.source_module] ??= { amount: 0, count: 0 }
    byModule[r.source_module].amount += amt
    byModule[r.source_module].count  += 1

    const method = r.payment_method ?? 'nao_informado'
    if (r.entry_type === 'inflow') {
      byMethod[method] ??= { amount: 0, count: 0 }
      byMethod[method].amount += amt
      byMethod[method].count  += 1
    }

    if (r.supplier_name) {
      bySupplier[r.supplier_name] ??= { amount: 0, count: 0 }
      bySupplier[r.supplier_name].amount += amt
      bySupplier[r.supplier_name].count  += 1
    }

    const day = r.occurred_at.slice(0, 10)
    byDayMap[day] ??= { inflows: 0, outflows: 0 }
    if (r.entry_type === 'inflow') byDayMap[day].inflows  += amt
    else                            byDayMap[day].outflows += amt
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    rows,
    totals: {
      inflows:  totalInflows,
      outflows: totalOutflows,
      balance:  totalInflows - totalOutflows,
      count:    rows.length,
    },
    by_module:         byModule,
    by_payment_method: byMethod,
    by_supplier:       bySupplier,
    by_day:            byDay,
  }
}
