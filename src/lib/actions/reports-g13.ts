'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  let q = admin
    .from('financial_entries')
    .select('id, type, amount, description, category, payment_method, status, due_date, payment_date, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .gte('created_at', params.from)
    .lte('created_at', params.to + 'T23:59:59')

  if (params.category)       q = q.eq('category',       params.category)
  if (params.payment_method) q = q.eq('payment_method', params.payment_method)

  const { data, error } = await q
  if (error) return { error: error.message }

  const rows = data ?? []

  let totalReceivable = 0, totalPayable = 0, totalReceived = 0, totalPaid = 0
  const byDayMap = new Map<string, { inflow: number; outflow: number }>()

  for (const r of rows) {
    const amt = Number(r.amount)
    const day = (r.created_at as string).slice(0, 10)
    const entry = byDayMap.get(day) ?? { inflow: 0, outflow: 0 }

    if (r.type === 'inflow') {
      if (r.status === 'paid') { totalReceived += amt; entry.inflow += amt }
      else totalReceivable += amt
    } else {
      if (r.status === 'paid') { totalPaid += amt; entry.outflow += amt }
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
      type:           r.type as 'inflow' | 'outflow',
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
  const { data, error } = await admin
    .from('financial_entries')
    .select('type, amount, category, status, payment_date')
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'paid')
    .gte('payment_date', params.from)
    .lte('payment_date', params.to + 'T23:59:59')

  if (error) return { error: error.message }

  const rows = data ?? []

  let receita_bruta = 0
  let deducoes      = 0
  let cmv           = 0
  let desp_op       = 0
  let amort         = 0

  for (const r of rows) {
    const amt = Number(r.amount)
    const cat = (r.category ?? '').toLowerCase()

    if (r.type === 'inflow') {
      receita_bruta += amt
    } else {
      if (cat.includes('deduc') || cat.includes('imposto') || cat.includes('tax')) {
        deducoes += amt
      } else if (cat.includes('cmv') || cat.includes('custo') || cat.includes('estoque') || cat.includes('produto')) {
        cmv += amt
      } else if (cat.includes('amort') || cat.includes('deprec')) {
        amort += amt
      } else {
        desp_op += amt
      }
    }
  }

  const receita_liquida = receita_bruta - deducoes
  const lucro_bruto     = receita_liquida - cmv
  const ebitda          = lucro_bruto - desp_op
  const lajir           = ebitda - amort

  const fmt = (v: number) => v

  return [
    { label: 'Receita Bruta',            value: fmt(receita_bruta),   indent: 0, bold: true,  negative: false },
    { label: '(-) Deduções e Impostos',  value: fmt(deducoes),        indent: 1, bold: false, negative: true  },
    { label: 'Receita Líquida',          value: fmt(receita_liquida), indent: 0, bold: true,  negative: false },
    { label: '(-) CMV',                  value: fmt(cmv),             indent: 1, bold: false, negative: true  },
    { label: 'Lucro Bruto',              value: fmt(lucro_bruto),     indent: 0, bold: true,  negative: false },
    { label: '(-) Despesas Operacionais',value: fmt(desp_op),         indent: 1, bold: false, negative: true  },
    { label: 'EBITDA',                   value: fmt(ebitda),          indent: 0, bold: true,  negative: false },
    { label: '(-) Amortizações/Deprec.', value: fmt(amort),           indent: 1, bold: false, negative: true  },
    { label: 'LAJIR (EBIT)',             value: fmt(lajir),           indent: 0, bold: true,  negative: false },
  ]
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
    .eq('type', 'inflow')
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

export interface ReportsEnabled {
  pet_frequency:    boolean
  productivity:     boolean
  financial:        boolean
  dre:              boolean
  curva_abc:        boolean
  whatsapp:         boolean
  operational:      boolean
}

const REPORTS_DEFAULTS: ReportsEnabled = {
  pet_frequency:    true,
  productivity:     true,
  financial:        true,
  dre:              true,
  curva_abc:        true,
  whatsapp:         true,
  operational:      true,
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

  return {
    pet_frequency: raw.pet_frequency ?? true,
    productivity:  raw.productivity  ?? true,
    financial:     raw.financial     ?? true,
    dre:           raw.dre           ?? true,
    curva_abc:     raw.curva_abc     ?? true,
    whatsapp:      raw.whatsapp      ?? true,
    operational:   raw.operational   ?? true,
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
