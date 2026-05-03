'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  revenue_today:         number   // R$ faturado (paid) no dia
  consultations_today:   number   // Atendimentos abertos hoje
  appointments_tomorrow: number   // Agendamentos para amanhã
  pending_revenue:       number   // Caixa pendente (invoices pending)
}

export interface WeeklyDataPoint {
  date:  string   // 'YYYY-MM-DD'
  label: string   // 'Seg', 'Ter', etc.
  count: number
}

export interface DashboardMetrics {
  kpis:        DashboardKPIs
  weekly_data: WeeklyDataPoint[]
}

export interface ActionCenterData {
  reception_count:       number
  waiting_exam_count:    number
  pending_invoice_count: number
  hospitalization_count: number
  hospitalization_icu:   number
  grooming_count:        number
  low_stock_count:       number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function tomorrowBounds() {
  const { end: start } = todayBounds()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

const DAY_LABELS: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

// ─── getDashboardMetrics ──────────────────────────────────────────────────────

export async function getDashboardMetrics(): Promise<DashboardMetrics | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin    = createAdminClient()
  const clinicId = profile.clinic_id
  const { start: todayStart, end: todayEnd }       = todayBounds()
  const { start: tomorrowStart, end: tomorrowEnd } = tomorrowBounds()

  // Semana: últimos 7 dias (hoje inclusive)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 6)

  const [
    paidTodayRes,
    consultTodayRes,
    apptTomorrowRes,
    pendingRes,
    weeklyConsultRes,
    groomingPaidTodayRes,
    groomingPendingRes,
  ] = await Promise.all([
    // Faturamento hoje (consultas/invoices)
    admin
      .from('invoices')
      .select('total_amount')
      .eq('clinic_id', clinicId)
      .eq('status', 'paid')
      .gte('paid_at', todayStart.toISOString())
      .lt('paid_at', todayEnd.toISOString()),

    // Consultas hoje (exclui agendamentos futuros)
    admin
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .neq('status', 'scheduled_future')
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString()),

    // Agendamentos amanhã
    admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('appointment_datetime', tomorrowStart.toISOString())
      .lt('appointment_datetime', tomorrowEnd.toISOString()),

    // Caixa pendente (consultas/invoices)
    admin
      .from('invoices')
      .select('total_amount')
      .eq('clinic_id', clinicId)
      .eq('status', 'pending'),

    // Atendimentos nos últimos 7 dias (para o gráfico)
    admin
      .from('consultations')
      .select('created_at')
      .eq('clinic_id', clinicId)
      .neq('status', 'scheduled_future')
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', todayEnd.toISOString()),

    // Faturamento Banho e Tosa recebido hoje
    admin
      .from('grooming_sessions')
      .select('price_total')
      .eq('clinic_id', clinicId)
      .eq('payment_status', 'paid')
      .gte('updated_at', todayStart.toISOString())
      .lt('updated_at', todayEnd.toISOString()),

    // Caixa pendente Banho e Tosa
    admin
      .from('grooming_sessions')
      .select('price_total')
      .eq('clinic_id', clinicId)
      .eq('payment_status', 'pending')
      .neq('status', 'delivered'),
  ])

  const revenueToday   = (paidTodayRes.data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
                       + (groomingPaidTodayRes.data ?? []).reduce((s, r) => s + (r.price_total ?? 0), 0)
  const pendingRevenue = (pendingRes.data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
                       + (groomingPendingRes.data ?? []).reduce((s, r) => s + (r.price_total ?? 0), 0)

  // Agrupa consultas por dia nos últimos 7 dias
  const weekly_data: WeeklyDataPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart)
    day.setDate(day.getDate() - i)
    const dayKey = day.toISOString().split('T')[0]
    const count = (weeklyConsultRes.data ?? []).filter(
      c => c.created_at.startsWith(dayKey)
    ).length
    weekly_data.push({
      date:  dayKey,
      label: DAY_LABELS[day.getDay()],
      count,
    })
  }

  return {
    kpis: {
      revenue_today:         revenueToday,
      consultations_today:   consultTodayRes.count ?? 0,
      appointments_tomorrow: apptTomorrowRes.count ?? 0,
      pending_revenue:       pendingRevenue,
    },
    weekly_data,
  }
}

// ─── getActionCenter ──────────────────────────────────────────────────────────

export async function getActionCenter(): Promise<ActionCenterData | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin    = createAdminClient()
  const clinicId = profile.clinic_id

  const [receptionRes, examRes, invoiceRes, hospRes, icuRes, groomingRes, stockRes] = await Promise.all([
    admin
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'reception'),
    admin
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'waiting_exam'),
    admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'pending'),
    admin
      .from('hospitalizations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .neq('status', 'discharged'),
    admin
      .from('hospitalizations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'icu'),
    admin
      .from('grooming_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('status', ['received', 'bathing', 'grooming', 'waiting_pickup']),
    admin
      .from('stock_items')
      .select('quantity, min_quantity')
      .eq('clinic_id', clinicId),
  ])

  const lowStockCount = (stockRes.data ?? []).filter(
    (item: any) => Number(item.quantity) <= Number(item.min_quantity)
  ).length

  return {
    reception_count:       receptionRes.count ?? 0,
    waiting_exam_count:    examRes.count ?? 0,
    pending_invoice_count: invoiceRes.count ?? 0,
    hospitalization_count: hospRes.count ?? 0,
    hospitalization_icu:   icuRes.count ?? 0,
    grooming_count:        groomingRes.count ?? 0,
    low_stock_count:       lowStockCount,
  }
}
