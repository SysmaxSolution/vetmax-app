import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  DollarSign, Stethoscope, CalendarDays, AlertCircle,
  ClipboardList, FlaskConical, Receipt, ArrowRight, TrendingUp, BedDouble,
  Scissors, Package, MessageCircle,
} from 'lucide-react'
import WeeklyChart from '@/components/director/WeeklyChart'
import WhatsappDirectorPanel from '@/components/director/WhatsappDirectorPanel'
import { getDashboardMetrics, getActionCenter } from '@/lib/actions/dashboard'
import { getHospitalizationOccupancy } from '@/lib/actions/hospitalizations'
import { getWhatsappDirectorStats } from '@/lib/actions/whatsapp-director'

export const metadata = { title: 'Painel do Diretor | SysVetMax' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub: string
  icon: React.ComponentType<{ className: string }>
  color: 'green' | 'blue' | 'indigo' | 'amber'
}) {
  const palette = {
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'bg-green-100 text-green-700',   value: 'text-green-700'  },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'bg-blue-100 text-blue-700',     value: 'text-blue-700'   },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: 'bg-indigo-100 text-indigo-700', value: 'text-indigo-700' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'bg-amber-100 text-amber-700',   value: 'text-amber-700'  },
  }[color]

  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} p-5 flex items-start gap-4`}>
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${palette.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${palette.value}`}>{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

// ─── Action Center Item ───────────────────────────────────────────────────────

function ActionItem({
  label, count, href, icon: Icon, color, emptyLabel,
}: {
  label: string; count: number; href: string
  icon: React.ComponentType<{ className: string }>
  color: string; emptyLabel: string
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors group">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{count === 0 ? emptyLabel : `${count} aguardando`}</p>
      </div>
      {count > 0 ? (
        <span className="flex-shrink-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-100 px-1.5 text-xs font-bold text-rose-700">
          {count}
        </span>
      ) : (
        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
      )}
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DirectorPanelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  if (profile.role !== 'admin') redirect('/dashboard/reception')
  const [metricsResult, actionResult, occupancyResult, clinicResult] = await Promise.all([
    getDashboardMetrics(),
    getActionCenter(),
    getHospitalizationOccupancy(),
    admin
      .from('clinics')
      .select('active_modules')
      .eq('id', profile.clinic_id)
      .single(),
  ])

  const activeModulesRaw: string[] = (clinicResult.data?.active_modules as string[] | null) ?? []
  const wppStats = activeModulesRaw.includes('whatsapp_intelligent')
    ? await getWhatsappDirectorStats()
    : null

  const metrics        = 'error' in metricsResult   ? null : metricsResult
  const action         = 'error' in actionResult     ? null : actionResult
  const occupancy      = 'error' in occupancyResult  ? null : occupancyResult
  const activeModules: string[] = activeModulesRaw.length > 0
    ? activeModulesRaw
    : ['reception', 'triage', 'consultation', 'exams', 'hospitalization', 'pharmacy', 'grooming']

  const has = (mod: string) => activeModules.includes(mod)

  const kpis       = metrics?.kpis
  const weeklyData = metrics?.weekly_data ?? []

  // "Tudo em dia" só considera os módulos ativos
  const relevantCounts = [
    has('reception')       ? (action?.reception_count       ?? 0) : 0,
    has('exams')           ? (action?.waiting_exam_count    ?? 0) : 0,
    action?.pending_invoice_count ?? 0, // caixa sempre relevante
  ]
  const allOk = action && relevantCounts.every(c => c === 0)

  return (
    <div className="space-y-8">

      {/* ── Saudação ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greetingByHour()}, {profile.full_name.split(' ')[0]}!
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{todayLabel()}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex-shrink-0">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Painel do Diretor</span>
        </div>
      </div>

      {/* ── KPIs — sempre visíveis (financeiro é universal) ───────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Faturamento Hoje"
          value={kpis ? formatCurrency(kpis.revenue_today) : '—'}
          sub="Recebimentos confirmados"
          icon={DollarSign}
          color="green"
        />
        {has('consultation') && (
          <KpiCard
            label="Consultas Hoje"
            value={kpis ? String(kpis.consultations_today) : '—'}
            sub="Atendimentos abertos"
            icon={Stethoscope}
            color="blue"
          />
        )}
        <KpiCard
          label="Agendamentos Amanhã"
          value={kpis ? String(kpis.appointments_tomorrow) : '—'}
          sub="Confirmados e agendados"
          icon={CalendarDays}
          color="indigo"
        />
        <KpiCard
          label="Caixa Pendente"
          value={kpis ? formatCurrency(kpis.pending_revenue) : '—'}
          sub="Faturas a receber"
          icon={AlertCircle}
          color="amber"
        />
      </div>

      {/* ── Ocupação Internação — só se módulo ativo ──────────────────────── */}
      {has('hospitalization') && (
        <Link
          href="/dashboard/hospitalization"
          className="flex items-center gap-4 rounded-xl border border-rose-100 bg-rose-50 px-5 py-4 hover:bg-rose-100 transition-colors group"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 group-hover:bg-rose-200 transition-colors">
            <BedDouble className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Internação</p>
            <p className="text-xl font-bold text-rose-700 mt-0.5">
              {occupancy ? occupancy.active : '—'} internado{occupancy?.active !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {occupancy && occupancy.by_status['icu']
                ? `${occupancy.by_status['icu']} em UTI · `
                : ''}
              {occupancy && occupancy.by_status['ready_for_discharge']
                ? `${occupancy.by_status['ready_for_discharge']} aguardando alta · `
                : ''}
              Ver Internação
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-rose-400 group-hover:text-rose-600 transition-colors flex-shrink-0" />
        </Link>
      )}

      {/* ── Layout Dividido ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Gráfico semanal */}
        <div className="lg:col-span-2">
          <WeeklyChart data={weeklyData} />
        </div>

        {/* Radar Operacional */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
              <ClipboardList className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Radar Operacional</h3>
              <p className="text-xs text-slate-400">Ações pendentes agora</p>
            </div>
          </div>

          {allOk ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
                <span className="text-xl">✅</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-teal-700">Tudo em dia!</p>
                <p className="text-xs text-slate-400 mt-0.5">Nenhuma ação pendente no momento</p>
              </div>
            </div>
          ) : (
            <div className="py-2 divide-y divide-slate-50">
              {has('reception') && (
                <ActionItem
                  label="Recepção"
                  count={action?.reception_count ?? 0}
                  href="/dashboard/reception"
                  icon={ClipboardList}
                  color="bg-blue-100 text-blue-600"
                  emptyLabel="Nenhum em espera"
                />
              )}
              {has('exams') && (
                <ActionItem
                  label="Exames Pendentes"
                  count={action?.waiting_exam_count ?? 0}
                  href="/dashboard/exams"
                  icon={FlaskConical}
                  color="bg-purple-100 text-purple-600"
                  emptyLabel="Laboratório livre"
                />
              )}
              {has('grooming') && (
                <ActionItem
                  label="Banho e Tosa"
                  count={action?.grooming_count ?? 0}
                  href="/dashboard/grooming"
                  icon={Scissors}
                  color="bg-teal-100 text-teal-600"
                  emptyLabel="Nenhuma sessão pendente"
                />
              )}
              {has('pharmacy') && (
                <ActionItem
                  label="Estoque Crítico"
                  count={action?.low_stock_count ?? 0}
                  href="/dashboard/pharmacy"
                  icon={Package}
                  color="bg-orange-100 text-orange-600"
                  emptyLabel="Estoque normalizado"
                />
              )}
              <ActionItem
                label="Faturas no Caixa"
                count={action?.pending_invoice_count ?? 0}
                href="/dashboard/reception/checkout"
                icon={Receipt}
                color="bg-amber-100 text-amber-600"
                emptyLabel="Caixa zerado"
              />
              {has('whatsapp_intelligent') && (
                <ActionItem
                  label="WhatsApp — Handoffs"
                  count={wppStats?.awaiting_human ?? 0}
                  href="/dashboard/whatsapp"
                  icon={MessageCircle}
                  color="bg-emerald-100 text-emerald-600"
                  emptyLabel="Nenhum handoff pendente"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp Inteligente ───────────────────────────────────────────── */}
      {has('whatsapp_intelligent') && wppStats && (
        <WhatsappDirectorPanel stats={wppStats} />
      )}

    </div>
  )
}
