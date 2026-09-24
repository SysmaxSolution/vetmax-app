'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { accumulateDre, dreTotals } from '@/lib/reports/dre-logic'
import { type EntryLike } from '@/lib/finance/reconciliation'
import { agingBucket, daysOverdue, summarizeAging } from '@/lib/reports/aging-logic'
import { projectCashflow, type CashPeriod } from '@/lib/reports/cashflow-logic'
import { groupSum, type GroupRow } from '@/lib/reports/revenue-breakdown'
import { classifyStock, type StockRow, type StockSummary } from '@/lib/reports/stock-report-logic'
import { summarizeClients, type ClientRow, type ClientsSummary } from '@/lib/reports/clients-logic'
import { isIntercompany, isCreditBalance, isRecognizedRevenue, netAmount } from '@/lib/finance/reconciliation'

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getCtx(): Promise<{ error: string } | { clinic_id: string; role: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }
  return { clinic_id: profile.clinic_id, role: profile.role as string }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PetFrequencyRow {
  pet_id:         string
  pet_name:       string
  species:        string
  breed:          string | null
  tutor_name:     string
  tutor_phone:    string | null
  consult_count:  number
  last_visit:     string | null
}

export interface ProfessionalProductivityRow {
  user_id:            string
  user_name:          string
  role:               string
  specialties:        string[] | null
  crmv:               string | null
  consult_total:      number
  exam_total:         number
  prescription_total: number
}

export interface ProfessionalProductivitySummary {
  rows: ProfessionalProductivityRow[]
  totals: {
    consult_total:      number
    exam_total:         number
    prescription_total: number
  }
}

export interface FinancialReportSummary {
  total_receivable: number
  total_payable:    number
  total_received:   number
  total_paid:       number
  result:           number
  by_day:           Array<{ date: string; inflow: number; outflow: number }>
  rows:             Array<{
    id:             string
    type:           'inflow' | 'outflow'
    amount:         number
    description:    string | null
    category:       string | null
    payment_method: string | null
    status:         string
    due_date:       string | null
    paid_at:        string | null   // mapped from payment_date
  }>
}

export interface DRELine {
  label:    string
  value:    number
  indent:   number
  bold:     boolean
  negative: boolean
}

export interface CurvaABCRow {
  rank:         number
  description:  string
  category:     string | null
  revenue:      number
  pct:          number
  pct_accum:    number
  class:        'A' | 'B' | 'C'
}

export interface WhatsAppReportSummary {
  sent:        number
  read_rate:   number
  replies:     number
  conversions: number
  by_trigger:  Record<string, number>
}

export interface OperationalSummary {
  appointments: {
    by_day:          Array<{ date: string; count: number }>
    attendance_rate: number
    cancellations:   number
    total:           number
  }
  hospitalization: {
    admissions:   number
    avg_days:     number
    discharges:   number
  }
  grooming: {
    services:       number
    revenue:        number
    recurring_tutors: number
  }
}

// ─── G13-2: Pet Frequency ─────────────────────────────────────────────────────

export async function getPetFrequencyReport(params: {
  from:     string
  to:       string
  species?: string
  breed?:   string
}): Promise<PetFrequencyRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()

  let query = admin
    .from('consultations')
    .select(`
      patient_id,
      created_at,
      patients:patient_id (
        id, name, species, breed,
        tutors:tutor_id ( name, phone )
      )
    `)
    .eq('clinic_id', ctx.clinic_id)
    .gte('created_at', params.from)
    .lte('created_at', params.to + 'T23:59:59')

  const { data, error } = await query
  if (error) return { error: error.message }

  const map = new Map<string, {
    pet_id: string; pet_name: string; species: string; breed: string | null
    tutor_name: string; tutor_phone: string | null
    consult_count: number; last_visit: string | null
  }>()

  for (const row of data ?? []) {
    const pet   = Array.isArray(row.patients) ? row.patients[0] : row.patients as any
    const tutor = Array.isArray(pet?.tutors)  ? pet.tutors[0]  : pet?.tutors   as any

    if (!pet) continue
    if (params.species && pet.species !== params.species) continue
    if (params.breed   && pet.breed   !== params.breed)   continue

    const key = pet.id as string
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        pet_id:      pet.id,
        pet_name:    pet.name,
        species:     pet.species,
        breed:       pet.breed ?? null,
        tutor_name:  tutor?.name  ?? '—',
        tutor_phone: tutor?.phone ?? null,
        consult_count: 1,
        last_visit:  row.created_at,
      })
    } else {
      existing.consult_count += 1
      if (row.created_at > (existing.last_visit ?? '')) {
        existing.last_visit = row.created_at
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.consult_count - a.consult_count)
}

// ─── G13-3: Professional Productivity ────────────────────────────────────────

export async function getProfessionalProductivityReport(params: {
  from: string
  to:   string
}): Promise<ProfessionalProductivitySummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()
  const toTs  = params.to + 'T23:59:59'

  // Busca paralela: profissionais + atividades do período
  const [profRes, consultRes, examRes, rxRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, role, specialties, crmv')
      .eq('clinic_id', ctx.clinic_id)
      .in('role', ['vet', 'admin', 'technician', 'groomer', 'receptionist'])
      .eq('is_active', true)
      .not('is_sysmax', 'is', true)
      .order('full_name'),
    admin
      .from('consultations')
      .select('vet_id')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', toTs),
    admin
      .from('exam_requests')
      .select('requested_by')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', toTs),
    admin
      .from('prescriptions')
      .select('prescriber_id, consultation_id')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', toTs)
      .not('prescriber_id', 'is', null),
  ])

  if (profRes.error)    return { error: profRes.error.message }
  if (consultRes.error) return { error: consultRes.error.message }

  // Agrupa por profissional
  const consultsByVet = new Map<string, number>()
  for (const c of consultRes.data ?? []) {
    if (c.vet_id) consultsByVet.set(c.vet_id, (consultsByVet.get(c.vet_id) ?? 0) + 1)
  }

  const examsByVet = new Map<string, number>()
  for (const e of examRes.data ?? []) {
    if (e.requested_by) examsByVet.set(e.requested_by, (examsByVet.get(e.requested_by) ?? 0) + 1)
  }

  // Conta receituários por consulta única (evita contar múltiplos medicamentos como receitas separadas)
  const rxByVet = new Map<string, Set<string>>()
  for (const p of rxRes.data ?? []) {
    if (!p.prescriber_id) continue
    if (!rxByVet.has(p.prescriber_id)) rxByVet.set(p.prescriber_id, new Set())
    const key = p.consultation_id ?? p.prescriber_id + Math.random()
    rxByVet.get(p.prescriber_id)!.add(key)
  }

  const rows: ProfessionalProductivityRow[] = (profRes.data ?? []).map(prof => ({
    user_id:            prof.id,
    user_name:          prof.full_name ?? '—',
    role:               prof.role,
    specialties:        (prof.specialties as string[] | null) ?? null,
    crmv:               prof.crmv ?? null,
    consult_total:      consultsByVet.get(prof.id) ?? 0,
    exam_total:         examsByVet.get(prof.id) ?? 0,
    prescription_total: rxByVet.get(prof.id)?.size ?? 0,
  }))

  const totals = {
    consult_total:      rows.reduce((s, r) => s + r.consult_total, 0),
    exam_total:         rows.reduce((s, r) => s + r.exam_total, 0),
    prescription_total: rows.reduce((s, r) => s + r.prescription_total, 0),
  }

  return { rows, totals }
}

export async function listProfessionals(): Promise<Array<{ id: string; name: string }>> {
  const ctx = await getCtx()
  if ('error' in ctx) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('clinic_id', ctx.clinic_id)
    .in('role', ['vet', 'admin'])
    .not('is_sysmax', 'is', true)
    .order('full_name')

  return (data ?? []).map(p => ({ id: p.id, name: p.full_name }))
}

// ─── G13-4: Financial Report ──────────────────────────────────────────────────

export async function getFinancialReport(params: {
  from:            string
  to:              string
  category?:       string
  payment_method?: string
}): Promise<FinancialReportSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()
  const SEL = 'id, type, amount, description, category, payment_method, status, due_date, payment_date, created_at, is_intercompany'
  const toEnd = params.to + 'T23:59:59'

  // Janela correta (PONTA 3): pagos pela data de pagamento; pendentes pelo
  // vencimento — não por created_at.
  const applyFilters = (qq: any) => {
    if (params.category)       qq = qq.eq('category',       params.category)
    if (params.payment_method) qq = qq.eq('payment_method', params.payment_method)
    return qq
  }
  const [paidRes, pendRes] = await Promise.all([
    applyFilters(admin.from('financial_entries').select(SEL).eq('clinic_id', ctx.clinic_id).eq('status', 'paid').gte('payment_date', params.from).lte('payment_date', toEnd)),
    applyFilters(admin.from('financial_entries').select(SEL).eq('clinic_id', ctx.clinic_id).eq('status', 'pending').gte('due_date', params.from).lte('due_date', params.to)),
  ])
  if (paidRes.error) return { error: paidRes.error.message }
  if (pendRes.error) return { error: pendRes.error.message }
  const rows = [...(paidRes.data ?? []), ...(pendRes.data ?? [])]

  let totalReceivable = 0, totalPayable = 0, totalReceived = 0, totalPaid = 0
  const byDayMap = new Map<string, { inflow: number; outflow: number }>()

  for (const r of rows) {
    // Elimina movimento interno inter-CNPJ (não é caixa do grupo).
    if ((r as any).is_intercompany) continue
    const amt = Number(r.amount)
    const isPaid = r.status === 'paid'
    // "Utilização de crédito" não é caixa novo — o dinheiro entrou no adiantamento.
    const isCreditBalance = r.payment_method === 'credit_balance'
    const day = (((isPaid ? r.payment_date : r.due_date) as string) ?? (r.created_at as string)).slice(0, 10)
    const entry = byDayMap.get(day) ?? { inflow: 0, outflow: 0 }

    if (r.type === 'receivable') {
      if (isPaid) { if (!isCreditBalance) { totalReceived += amt; entry.inflow += amt } }
      else totalReceivable += amt
    } else {
      if (isPaid) { if (!isCreditBalance) { totalPaid += amt; entry.outflow += amt } }
      else totalPayable += amt
    }

    byDayMap.set(day, entry)
  }

  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    total_receivable: totalReceivable,
    total_payable:    totalPayable,
    total_received:   totalReceived,
    total_paid:       totalPaid,
    result:           totalReceived - totalPaid,
    by_day:           byDay,
    rows: rows.map(r => ({
      id:             r.id,
      type:           (r.type === 'receivable' ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
      amount:         Number(r.amount),
      description:    r.description ?? null,
      category:       r.category    ?? null,
      payment_method: r.payment_method ?? null,
      status:         r.status,
      due_date:       r.due_date ?? null,
      paid_at:        (r as any).payment_date ?? null,
    })),
  }
}

// ─── G13-5: DRE ───────────────────────────────────────────────────────────────

export async function getDREReport(params: {
  from: string
  to:   string
}): Promise<DRELine[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()
  const [{ data, error }, cmv] = await Promise.all([
    admin
      .from('financial_entries')
      .select('type, amount, category, status, payment_date, is_intercompany, purchase_order_id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('status', 'paid')
      .gte('payment_date', params.from)
      .lte('payment_date', params.to + 'T23:59:59'),
    computeCMVFromConsumption(admin, ctx.clinic_id, params.from, params.to),
  ])

  if (error) return { error: error.message }

  const buckets = accumulateDre((data ?? []) as EntryLike[])
  const t = dreTotals(buckets, cmv)

  return [
    { label: 'Receita Bruta',                 value: t.receita_bruta,   indent: 0, bold: true,  negative: false },
    { label: '(-) Deduções e Impostos',       value: t.deducoes,        indent: 1, bold: false, negative: true  },
    { label: 'Receita Líquida',               value: t.receita_liquida, indent: 0, bold: true,  negative: false },
    { label: '(-) CMV (custo dos produtos)',  value: t.cmv,             indent: 1, bold: false, negative: true  },
    { label: 'Lucro Bruto',                   value: t.lucro_bruto,     indent: 0, bold: true,  negative: false },
    { label: '(-) Despesas Variáveis (comissões)', value: t.desp_var,   indent: 1, bold: false, negative: true  },
    { label: 'Margem de Contribuição',        value: t.margem_contrib,  indent: 0, bold: true,  negative: false },
    { label: '(-) Despesas Operacionais',     value: t.desp_op,         indent: 1, bold: false, negative: true  },
    { label: 'EBITDA',                        value: t.ebitda,          indent: 0, bold: true,  negative: false },
    { label: '(-) Amortizações/Deprec.',      value: t.amort,           indent: 1, bold: false, negative: true  },
    { label: 'LAJIR (EBIT)',                  value: t.lajir,           indent: 0, bold: true,  negative: false },
  ]
}

// CMV por CONSUMO no período: valor de custo das saídas de PRODUTOS (não serviços).
// Fontes: sale_items (PDV) + stock_movements DEBIT de consulta/internação. Custo
// unitário = cost_price → purchase_price → 0. Perdas/ajustes NÃO entram no CMV.
async function computeCMVFromConsumption(
  admin: ReturnType<typeof createAdminClient>, clinicId: string, from: string, to: string,
): Promise<number> {
  const toEnd = to + 'T23:59:59'
  const { data: itemsRaw } = await admin
    .from('stock_items')
    .select('id, cost_price, purchase_price, is_service')
    .eq('clinic_id', clinicId)
  const cost = new Map<string, number>()
  for (const it of (itemsRaw ?? []) as any[]) {
    if (it.is_service) continue
    cost.set(it.id, Number(it.cost_price ?? it.purchase_price ?? 0))
  }
  if (cost.size === 0) return 0

  let cmv = 0

  // PDV: sale_items de vendas não canceladas no período
  const { data: saleRaw } = await admin
    .from('sale_items')
    .select('stock_item_id, quantity, sale:sales!inner(created_at, cancelled_at)')
    .eq('clinic_id', clinicId)
  for (const s of (saleRaw ?? []) as any[]) {
    const sale = Array.isArray(s.sale) ? s.sale[0] : s.sale
    if (!sale || sale.cancelled_at) continue
    if (sale.created_at < from || sale.created_at > toEnd) continue
    const c = cost.get(s.stock_item_id); if (c == null) continue
    cmv += Number(s.quantity ?? 0) * c
  }

  // Consumo clínico: stock_movements DEBIT de consulta/internação no período
  const { data: movRaw } = await admin
    .from('stock_movements')
    .select('stock_item_id, quantity_change, movement_type, source, created_at')
    .eq('clinic_id', clinicId)
    .eq('movement_type', 'DEBIT')
    .in('source', ['CONSULTATION', 'HOSPITALIZATION'])
    .gte('created_at', from)
    .lte('created_at', toEnd)
  for (const m of (movRaw ?? []) as any[]) {
    const c = cost.get(m.stock_item_id); if (c == null) continue
    cmv += Math.abs(Number(m.quantity_change ?? 0)) * c
  }

  return Math.round(cmv * 100) / 100
}

// ─── G13-6: Curva ABC ─────────────────────────────────────────────────────────

export async function getCurvaABCReport(params: {
  from: string
  to:   string
  type: 'services' | 'products' | 'all'
}): Promise<CurvaABCRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()

  let q = admin
    .from('financial_entries')
    .select('description, category, amount, type')
    .eq('clinic_id', ctx.clinic_id)
    .eq('type', 'receivable')
    .eq('status', 'paid')
    .gte('payment_date', params.from)
    .lte('payment_date', params.to + 'T23:59:59')

  if (params.type === 'services') {
    q = q.ilike('category', '%servi%')
  } else if (params.type === 'products') {
    q = q.ilike('category', '%produto%')
  }

  const { data, error } = await q
  if (error) return { error: error.message }

  const rows = data ?? []

  const map = new Map<string, { description: string; category: string | null; revenue: number }>()
  for (const r of rows) {
    const key = (r.description ?? 'Sem descrição').trim()
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { description: key, category: r.category ?? null, revenue: Number(r.amount) })
    } else {
      existing.revenue += Number(r.amount)
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  const total  = sorted.reduce((sum, r) => sum + r.revenue, 0)

  let accum = 0
  return sorted.map((item, i) => {
    accum += item.revenue
    const pct       = total > 0 ? (item.revenue / total) * 100 : 0
    const pct_accum = total > 0 ? (accum        / total) * 100 : 0
    const cls: 'A' | 'B' | 'C' = pct_accum <= 80 ? 'A' : pct_accum <= 95 ? 'B' : 'C'
    return {
      rank:        i + 1,
      description: item.description,
      category:    item.category,
      revenue:     item.revenue,
      pct,
      pct_accum,
      class: cls,
    }
  })
}

// ─── G13-7: WhatsApp Report ───────────────────────────────────────────────────

export async function getWhatsAppReport(params: {
  from: string
  to:   string
}): Promise<WhatsAppReportSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()

  const [logsRes, convsRes] = await Promise.all([
    admin
      .from('whatsapp_campaign_logs')
      .select('id, response_received, sent_at, whatsapp_campaigns:campaign_id(trigger_type)')
      .eq('clinic_id', ctx.clinic_id)
      .gte('sent_at', params.from)
      .lte('sent_at', params.to + 'T23:59:59'),
    admin
      .from('whatsapp_conversations')
      .select('id, status, created_at')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', params.to + 'T23:59:59'),
  ])

  const logs  = logsRes.data  ?? []
  const convs = convsRes.data ?? []

  const sent     = logs.length
  const replies  = logs.filter(l => l.response_received).length
  const readRate = sent > 0 ? Math.round((replies / sent) * 100) : 0

  const conversions = convs.filter(c => c.status === 'closed').length

  const byTrigger: Record<string, number> = {}
  for (const l of logs) {
    const camp    = Array.isArray(l.whatsapp_campaigns) ? l.whatsapp_campaigns[0] : l.whatsapp_campaigns as any
    const trigger = camp?.trigger_type ?? 'outros'
    byTrigger[trigger] = (byTrigger[trigger] ?? 0) + 1
  }

  return {
    sent,
    read_rate:  readRate,
    replies,
    conversions,
    by_trigger: byTrigger,
  }
}

// ─── G13-8: Operational Report ───────────────────────────────────────────────

export async function getOperationalReport(params: {
  from: string
  to:   string
}): Promise<OperationalSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado' }
  }

  const admin = createAdminClient()

  const [apptRes, hospRes, groomRes] = await Promise.all([
    admin
      .from('consultations')
      .select('id, status, created_at')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', params.to + 'T23:59:59'),
    admin
      .from('hospitalizations')
      .select('id, created_at, discharged_at, status')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', params.to + 'T23:59:59'),
    admin
      .from('grooming_sessions')
      .select('id, tutor_id, total_price, created_at')
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', params.from)
      .lte('created_at', params.to + 'T23:59:59'),
  ])

  const appts  = apptRes.data  ?? []
  const hosps  = hospRes.data  ?? []
  const grooms = groomRes.data ?? []

  // Appointments by day
  const byDay = new Map<string, number>()
  let cancellations = 0
  for (const a of appts) {
    const day = (a.created_at as string).slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
    if (a.status === 'cancelled') cancellations++
  }
  const attendance_rate = appts.length > 0
    ? Math.round(((appts.length - cancellations) / appts.length) * 100)
    : 0

  // Hospitalization stats
  const discharges = hosps.filter(h => h.discharged_at).length
  let totalDays = 0
  let countWithDays = 0
  for (const h of hosps) {
    if (h.discharged_at) {
      const days = Math.ceil(
        (new Date(h.discharged_at).getTime() - new Date(h.created_at).getTime()) / 86400000
      )
      if (days >= 0) { totalDays += days; countWithDays++ }
    }
  }

  // Grooming stats
  const groomRevenue = grooms.reduce((s, g) => s + Number(g.total_price ?? 0), 0)
  const tutorSet     = new Set(grooms.map(g => g.tutor_id))
  const recurring    = Math.max(0, tutorSet.size - grooms.filter(g => {
    const count = grooms.filter(g2 => g2.tutor_id === g.tutor_id).length
    return count === 1
  }).length)

  return {
    appointments: {
      by_day: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      attendance_rate,
      cancellations,
      total: appts.length,
    },
    hospitalization: {
      admissions: hosps.length,
      avg_days:   countWithDays > 0 ? Math.round(totalDays / countWithDays) : 0,
      discharges,
    },
    grooming: {
      services:        grooms.length,
      revenue:         groomRevenue,
      recurring_tutors: recurring,
    },
  }
}

// ─── G13-9: Reports Settings ──────────────────────────────────────────────────

// Tarefa 0 — TODO relatório é ativável/desativável por clínica. As 12 chaves
// abaixo das 7 originais eram forçadas por um ALWAYS_ON em ReportsWorkspace que
// burlava este mecanismo: o admin via os relatórios e NÃO conseguia desligá-los,
// porque as chaves nem existiam aqui.
//
// DECISÃO DE DEFAULT (Tarefa 0, documentada): todas nascem LIGADAS para quem já
// tem o módulo Relatórios. Motivo: desligar por padrão seria uma REGRESSÃO para
// a Clínica Animais, que já usa esses relatórios no ambiente de testes. O que
// muda é que agora dá para desligar — a ativação vira escolha, não imposição.
// Relatórios presos a uma rotina (Boletos, Rejeição de Exame) continuam ANDados
// com a flag da rotina na tela, então ligado aqui não significa visível lá.
export interface ReportsEnabled {
  pet_frequency:    boolean
  productivity:     boolean
  financial:        boolean
  dre:              boolean
  curva_abc:        boolean
  whatsapp:         boolean
  operational:      boolean
  // ── antes no ALWAYS_ON ──
  dashboard:        boolean
  smart:            boolean
  commissions:      boolean
  controlled:       boolean
  aging:            boolean
  cashflow:         boolean
  revenue:          boolean
  stock_position:   boolean
  clients:          boolean
  dre_company:      boolean
  boleto_movement:  boolean
  exam_rejections:  boolean
  // Extrato do Cliente (treinamento Animais 18/09/2026)
  client_statement: boolean
}

const REPORTS_DEFAULTS: ReportsEnabled = {
  pet_frequency:    true,
  productivity:     true,
  financial:        true,
  dre:              true,
  curva_abc:        true,
  whatsapp:         true,
  operational:      true,
  dashboard:        true,
  smart:            true,
  commissions:      true,
  controlled:       true,
  aging:            true,
  cashflow:         true,
  revenue:          true,
  stock_position:   true,
  clients:          true,
  dre_company:      true,
  boleto_movement:  true,
  exam_rejections:  true,
  client_statement: true,
}

export async function getReportsEnabled(): Promise<ReportsEnabled | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinic_settings')
    .select('reports_enabled')
    .eq('clinic_id', ctx.clinic_id)
    .single()

  const raw = (data as any)?.reports_enabled
  if (!raw || typeof raw !== 'object') return REPORTS_DEFAULTS

  // `?? true` preserva o comportamento de quem já tinha reports_enabled gravado
  // sem as chaves novas: elas entram ligadas, como estavam de fato.
  return {
    pet_frequency:   raw.pet_frequency   ?? true,
    productivity:    raw.productivity    ?? true,
    financial:       raw.financial       ?? true,
    dre:             raw.dre             ?? true,
    curva_abc:       raw.curva_abc       ?? true,
    whatsapp:        raw.whatsapp        ?? true,
    operational:     raw.operational     ?? true,
    dashboard:       raw.dashboard       ?? true,
    smart:           raw.smart           ?? true,
    commissions:     raw.commissions     ?? true,
    controlled:      raw.controlled      ?? true,
    aging:           raw.aging           ?? true,
    cashflow:        raw.cashflow        ?? true,
    revenue:         raw.revenue         ?? true,
    stock_position:  raw.stock_position  ?? true,
    clients:         raw.clients         ?? true,
    dre_company:     raw.dre_company     ?? true,
    boleto_movement: raw.boleto_movement ?? true,
    exam_rejections: raw.exam_rejections ?? true,
    client_statement: raw.client_statement ?? true,
  }
}

export async function saveReportsEnabled(
  enabled: ReportsEnabled,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_settings')
    .upsert(
      { clinic_id: ctx.clinic_id, reports_enabled: enabled },
      { onConflict: 'clinic_id' }
    )

  if (error) return { error: error.message }
  return { success: true }
}

// ─── Aging de Recebíveis / Pagáveis (P0) ──────────────────────────────────────
// Sintético: totais por faixa de atraso (a vencer / 0-30 / 31-60 / 61-90 / 90+).
// Analítico: cada título pendente com dias de atraso e a parte (cliente/fornecedor).

export interface AgingRow {
  id:           string
  party:        string          // cliente (receivable) ou fornecedor (payable)
  document:     string | null   // nº documento / OS
  description:  string
  due_date:     string
  days_overdue: number          // <0 = a vencer
  amount:       number
  bucket:       string
}
export interface AgingBucket { key: string; label: string; total: number; count: number }
export interface AgingReport {
  as_of:   string
  type:    'receivable' | 'payable'
  buckets: AgingBucket[]
  rows:    AgingRow[]
  total:   number
}

export async function getAgingReport(params: {
  type:  'receivable' | 'payable'
  as_of?: string
}): Promise<AgingReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }

  const asOf = params.as_of ?? new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('financial_entries')
    .select('id, type, amount, discount, description, due_date, document_number, beneficiary, is_intercompany, is_clinic_discount, tutors(name), consultation:consultations!consultation_id(os_number)')
    .eq('clinic_id', ctx.clinic_id)
    .eq('type', params.type)
    .eq('status', 'pending')
    .eq('is_clinic_discount', false)
    .order('due_date', { ascending: true })
    .limit(5000)
  if (error) return { error: error.message }

  const rows: AgingRow[] = []
  let total = 0
  for (const r of (data ?? []) as any[]) {
    if (r.is_intercompany) continue
    const net = Math.round((Number(r.amount) - Number(r.discount ?? 0)) * 100) / 100
    const due = (r.due_date as string)
    const days = daysOverdue(due, asOf)
    const bucket = agingBucket(days)
    const tut = Array.isArray(r.tutors) ? r.tutors[0] : r.tutors
    const party = params.type === 'receivable'
      ? (tut?.name ?? 'Cliente não informado')
      : (r.beneficiary ?? 'Fornecedor não informado')
    const cons = Array.isArray(r.consultation) ? r.consultation[0] : r.consultation
    const osNum = cons?.os_number as string | null | undefined
    rows.push({
      id: r.id, party, document: r.document_number ?? (osNum ? `OS ${osNum}` : null),
      description: r.description ?? '', due_date: due, days_overdue: days,
      amount: net, bucket,
    })
    total += net
  }

  const buckets: AgingBucket[] = summarizeAging(rows.map(r => ({ bucket: r.bucket, amount: r.amount })))
  return { as_of: asOf, type: params.type, buckets, rows, total: Math.round(total * 100) / 100 }
}

// ─── Fluxo de Caixa Projetado (realizado × a realizar) ────────────────────────
export interface CashflowReport { from: string; to: string; periods: CashPeriod[]; totals: { realizado_in: number; realizado_out: number; previsto_in: number; previsto_out: number } }

export async function getCashflowProjection(params: { from: string; to: string }): Promise<CashflowReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  const admin = createAdminClient()
  const toEnd = params.to + 'T23:59:59'
  const SEL = 'type, amount, discount, status, payment_date, due_date, payment_method, is_intercompany, is_clinic_discount'
  const [paidRes, pendRes] = await Promise.all([
    admin.from('financial_entries').select(SEL).eq('clinic_id', ctx.clinic_id).eq('is_clinic_discount', false).eq('status', 'paid').gte('payment_date', params.from).lte('payment_date', toEnd),
    admin.from('financial_entries').select(SEL).eq('clinic_id', ctx.clinic_id).eq('is_clinic_discount', false).eq('status', 'pending').gte('due_date', params.from).lte('due_date', params.to),
  ])
  if (paidRes.error) return { error: paidRes.error.message }
  if (pendRes.error) return { error: pendRes.error.message }

  const items: { type: string; amount: number; date: string; realized: boolean }[] = []
  for (const r of (paidRes.data ?? []) as any[]) {
    if (isIntercompany(r) || isCreditBalance(r)) continue   // realizado = caixa real
    items.push({ type: r.type, amount: netAmount(r), date: (r.payment_date as string).slice(0, 10), realized: true })
  }
  for (const r of (pendRes.data ?? []) as any[]) {
    if (isIntercompany(r)) continue
    items.push({ type: r.type, amount: netAmount(r), date: (r.due_date as string).slice(0, 10), realized: false })
  }
  const periods = projectCashflow(items)
  const totals = periods.reduce((a, p) => ({
    realizado_in: a.realizado_in + p.realizado_in, realizado_out: a.realizado_out + p.realizado_out,
    previsto_in: a.previsto_in + p.previsto_in, previsto_out: a.previsto_out + p.previsto_out,
  }), { realizado_in: 0, realizado_out: 0, previsto_in: 0, previsto_out: 0 })
  return { from: params.from, to: params.to, periods, totals }
}

// ─── Faturamento por dimensão (receita reconhecida) ───────────────────────────
export type RevenueDimension = 'category' | 'payment_method' | 'company' | 'month'
export interface RevenueBreakdownReport { from: string; to: string; dimension: RevenueDimension; rows: GroupRow[]; total: number }

const PM_LABEL: Record<string, string> = { cash: 'Dinheiro', pix: 'PIX', credit: 'Cartão de crédito', debit: 'Cartão de débito', credit_balance: 'Crédito do cliente', transfer: 'Transferência', boleto: 'Boleto', voucher: 'Voucher', convenio: 'Convênio', other: 'Outro' }

export async function getRevenueBreakdown(params: { from: string; to: string; dimension: RevenueDimension }): Promise<RevenueBreakdownReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  const admin = createAdminClient()
  const toEnd = params.to + 'T23:59:59'
  const { data, error } = await admin
    .from('financial_entries')
    .select('type, amount, discount, status, payment_date, category, payment_method, company_id, is_intercompany, is_clinic_discount')
    .eq('clinic_id', ctx.clinic_id).eq('is_clinic_discount', false)
    .eq('type', 'receivable').eq('status', 'paid')
    .gte('payment_date', params.from).lte('payment_date', toEnd)
  if (error) return { error: error.message }

  const companyName = new Map<string, string>()
  if (params.dimension === 'company') {
    const { data: comps } = await admin.from('companies').select('id, name').eq('clinic_id', ctx.clinic_id)
    for (const c of (comps ?? []) as any[]) companyName.set(c.id, c.name)
  }

  const items = ((data ?? []) as any[])
    .filter(r => isRecognizedRevenue(r))
    .map(r => {
      const amount = netAmount(r)
      if (params.dimension === 'category')       return { key: r.category ?? '—', label: r.category ?? 'Sem categoria', amount }
      if (params.dimension === 'payment_method') { const pm = r.payment_method ?? '—'; return { key: pm, label: PM_LABEL[pm] ?? pm, amount } }
      if (params.dimension === 'company')        { const cid = r.company_id ?? '—'; return { key: cid, label: cid === '—' ? 'Sem empresa' : (companyName.get(cid) ?? 'Empresa'), amount } }
      const mo = (r.payment_date as string).slice(0, 7); return { key: mo, label: mo, amount }
    })
  const { rows, total } = groupSum(items)
  return { from: params.from, to: params.to, dimension: params.dimension, rows, total }
}

// ─── Posição de Estoque (ruptura / validade / valor) ──────────────────────────
export interface StockReport { as_of: string; expiry_days: number; rows: StockRow[]; summary: StockSummary }

export async function getStockReport(params: { as_of?: string; expiry_days?: number }): Promise<StockReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  const admin = createAdminClient()
  const asOf = params.as_of ?? new Date().toISOString().slice(0, 10)
  const expiryDays = params.expiry_days ?? 60
  const { data, error } = await admin
    .from('stock_items')
    .select('id, name, quantity, min_quantity, unit_price, cost_price, purchase_price, expiry_date, is_service, archived_at')
    .eq('clinic_id', ctx.clinic_id)
    .is('archived_at', null)
    .eq('is_service', false)
  if (error) return { error: error.message }
  const { rows, summary } = classifyStock((data ?? []) as any[], asOf, expiryDays)
  return { as_of: asOf, expiry_days: expiryDays, rows, summary }
}

// ─── Clientes: novos × recorrentes + ticket médio ─────────────────────────────
export interface ClientsReport { from: string; to: string; summary: ClientsSummary; rows: ClientRow[] }

export async function getClientsReport(params: { from: string; to: string }): Promise<ClientsReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  const admin = createAdminClient()
  const toEnd = params.to + 'T23:59:59'

  // Atendimentos do período por tutor
  const { data: cons, error } = await admin
    .from('consultations')
    .select('tutor_id, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .gte('created_at', params.from).lte('created_at', toEnd)
    .not('tutor_id', 'is', null)
  if (error) return { error: error.message }
  const apptByTutor = new Map<string, number>()
  for (const c of (cons ?? []) as any[]) apptByTutor.set(c.tutor_id, (apptByTutor.get(c.tutor_id) ?? 0) + 1)
  const tutorIds = [...apptByTutor.keys()]
  if (tutorIds.length === 0) return { from: params.from, to: params.to, summary: summarizeClients([]), rows: [] }

  // Primeiro atendimento de sempre (para novo × recorrente) + nomes + faturamento
  const [firstRes, nameRes, revRes] = await Promise.all([
    admin.from('consultations').select('tutor_id, created_at').eq('clinic_id', ctx.clinic_id).in('tutor_id', tutorIds).order('created_at', { ascending: true }),
    admin.from('tutors').select('id, name').eq('clinic_id', ctx.clinic_id).in('id', tutorIds),
    admin.from('financial_entries').select('tutor_id, amount, discount, type, status, category, is_intercompany').eq('clinic_id', ctx.clinic_id).eq('type', 'receivable').eq('status', 'paid').gte('payment_date', params.from).lte('payment_date', toEnd).in('tutor_id', tutorIds),
  ])
  const firstSeen = new Map<string, string>()
  for (const c of (firstRes.data ?? []) as any[]) if (!firstSeen.has(c.tutor_id)) firstSeen.set(c.tutor_id, c.created_at)
  const nameById = new Map<string, string>()
  for (const t of (nameRes.data ?? []) as any[]) nameById.set(t.id, t.name)
  const revByTutor = new Map<string, number>()
  for (const r of (revRes.data ?? []) as any[]) {
    if (isRecognizedRevenue(r)) revByTutor.set(r.tutor_id, (revByTutor.get(r.tutor_id) ?? 0) + netAmount(r))
  }

  const rows: ClientRow[] = tutorIds.map(id => ({
    tutor_id: id,
    name: nameById.get(id) ?? 'Cliente',
    appointments: apptByTutor.get(id) ?? 0,
    faturamento: Math.round((revByTutor.get(id) ?? 0) * 100) / 100,
    is_new: (firstSeen.get(id) ?? '') >= params.from,
  })).sort((a, b) => b.faturamento - a.faturamento || b.appointments - a.appointments)

  return { from: params.from, to: params.to, summary: summarizeClients(rows), rows }
}

// ─── DRE por CNPJ (comparativo por empresa faturante) ─────────────────────────
export interface DREByCompanyRow { company_id: string | null; company_name: string; receita: number; deducoes: number; despesas: number; resultado: number }
export interface DREByCompanyReport { from: string; to: string; rows: DREByCompanyRow[] }

export async function getDREByCompany(params: { from: string; to: string }): Promise<DREByCompanyReport | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  const admin = createAdminClient()
  const toEnd = params.to + 'T23:59:59'

  const [entRes, acctRes, compRes] = await Promise.all([
    admin.from('financial_entries').select('type, amount, category, status, settlement_bank_id, is_intercompany, purchase_order_id, is_clinic_discount').eq('clinic_id', ctx.clinic_id).eq('is_clinic_discount', false).eq('status', 'paid').gte('payment_date', params.from).lte('payment_date', toEnd),
    admin.from('bank_accounts').select('id, company_id').eq('clinic_id', ctx.clinic_id),
    admin.from('companies').select('id, name').eq('clinic_id', ctx.clinic_id),
  ])
  if (entRes.error) return { error: entRes.error.message }
  const acctCompany = new Map<string, string | null>()
  for (const a of (acctRes.data ?? []) as any[]) acctCompany.set(a.id, a.company_id ?? null)
  const compName = new Map<string, string>()
  for (const c of (compRes.data ?? []) as any[]) compName.set(c.id, c.name)

  const byCompany = new Map<string | null, EntryLike[]>()
  for (const e of (entRes.data ?? []) as any[]) {
    const cid = e.settlement_bank_id ? (acctCompany.get(e.settlement_bank_id) ?? null) : null
    if (!byCompany.has(cid)) byCompany.set(cid, [])
    byCompany.get(cid)!.push(e)
  }

  const rows: DREByCompanyRow[] = [...byCompany.entries()].map(([cid, entries]) => {
    const b = accumulateDre(entries)
    const t = dreTotals(b, 0)   // CMV consolidado fica no DRE principal
    const despesas = Math.round((t.deducoes + t.desp_var + t.desp_op + t.amort) * 100) / 100
    return {
      company_id: cid,
      company_name: cid ? (compName.get(cid) ?? 'Empresa') : 'Sem empresa/conta',
      receita: t.receita_bruta,
      deducoes: t.deducoes,
      despesas,
      resultado: Math.round((t.receita_bruta - despesas) * 100) / 100,
    }
  }).sort((a, b) => b.receita - a.receita)

  return { from: params.from, to: params.to, rows }
}
