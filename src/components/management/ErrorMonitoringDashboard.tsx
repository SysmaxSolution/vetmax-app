'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Activity, RefreshCw, AlertTriangle, AlertCircle, Info,
  ChevronRight, FileText, CheckCircle2, XCircle, Clock, Bug, Zap, MessageSquare,
} from 'lucide-react'
import { getUnresolvedErrors, getFixPlans, approveFixPlan, rejectFixPlan, triggerFixPlanGeneration, resendPlanNotification } from '@/lib/actions/error-logs'
import FixPlanSlideOver from './FixPlanSlideOver'

// ─── Types ────────────────────────────────────────────────────────────────────

type ErrorLog = {
  id: string
  path: string
  error_message: string
  severity: string
  priority: string | null
  module: string | null
  source: string
  occurrence_count: number
  created_at: string
  clinic_id:   string | null
  clinic_name: string | null
}

type FixPlan = {
  id: string
  title: string
  priority: 'P0' | 'P1' | 'P2'
  status: string
  affected_modules: string[]
  error_summary: string | null
  description_md: string | null
  branch_name: string | null
  pr_url: string | null
  created_at: string
  approved_at: string | null
}

type SubTab = 'logs' | 'pending' | 'history'

// ─── Configs visuais ──────────────────────────────────────────────────────────

const P_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border border-red-300 font-bold animate-pulse',
  P1: 'bg-orange-100 text-orange-700 border border-orange-200 font-semibold',
  P2: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
}
const P_ICON: Record<string, React.ElementType> = {
  P0: AlertTriangle,
  P1: AlertCircle,
  P2: Info,
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Aguardando Aprovação', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  approved:         { label: 'Aprovado — aguardando execução', cls: 'bg-green-100 text-green-700 border border-green-200' },
  in_progress:      { label: 'Em Progresso',    cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  pr_opened:        { label: 'PR Aberto',        cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  completed:        { label: 'Concluído',        cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  fix_failed:       { label: 'Falha na Correção', cls: 'bg-red-100 text-red-700 border border-red-200' },
  rejected:         { label: 'Rejeitado',        cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
  draft:            { label: 'Rascunho',         cls: 'bg-slate-50 text-slate-500 border border-slate-200' },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ErrorMonitoringDashboard() {
  const [subTab,        setSubTab]        = useState<SubTab>('logs')
  const [errors,        setErrors]        = useState<ErrorLog[]>([])
  const [pendingPlans,  setPendingPlans]  = useState<FixPlan[]>([])
  const [historyPlans,  setHistoryPlans]  = useState<FixPlan[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selectedPlan,  setSelectedPlan]  = useState<FixPlan | null>(null)
  const [actionId,      setActionId]      = useState<string | null>(null)
  const [toast,         setToast]         = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [generating,    setGenerating]    = useState(false)
  const [resending,     setResending]     = useState<string | null>(null)
  const [,             startTransition]   = useTransition()

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [errRes, pendRes, histRes] = await Promise.all([
      getUnresolvedErrors(),
      getFixPlans('pending_approval'),
      getFixPlans(['completed', 'rejected', 'fix_failed', 'pr_opened', 'approved']),
    ])
    if (!('error' in errRes))  setErrors(errRes as ErrorLog[])
    if (!('error' in pendRes)) setPendingPlans(pendRes as FixPlan[])
    if (!('error' in histRes)) setHistoryPlans(histRes as FixPlan[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    setGenerating(true)
    const res = await triggerFixPlanGeneration()
    if ('error' in res) {
      showToast('err', res.error)
    } else {
      const parts: string[] = []
      if (res.created  > 0) parts.push(`${res.created} novo${res.created > 1 ? 's' : ''} plano${res.created > 1 ? 's' : ''} gerado${res.created > 1 ? 's' : ''}`)
      if (res.skipped  > 0) parts.push(`${res.skipped} já existia${res.skipped > 1 ? 'm' : ''}`)
      if (res.notified > 0) parts.push(`${res.notified} notificaç${res.notified > 1 ? 'ões' : 'ão'} enviada${res.notified > 1 ? 's' : ''} via WhatsApp`)
      if (parts.length === 0) parts.push('Nenhum erro elegível no momento')
      showToast('ok', parts.join(' · ') + '.')
      if (res.created > 0 || res.notified > 0) {
        setSubTab('pending')
        await load()
      }
    }
    setGenerating(false)
  }

  async function handleResend(planId: string) {
    setResending(planId)
    const res = await resendPlanNotification(planId)
    if ('error' in res) {
      showToast('err', res.error)
    } else {
      showToast('ok', 'Notificação WhatsApp re-enviada com sucesso.')
    }
    setResending(null)
  }

  async function handleApprove(planId: string) {
    setActionId(planId)
    startTransition(async () => {
      const res = await approveFixPlan(planId)
      if ('error' in res) {
        showToast('err', res.error)
      } else {
        showToast('ok', 'Plano aprovado. A Mozart Routine executará a correção automaticamente.')
        setPendingPlans(ps => ps.filter(p => p.id !== planId))
        setSelectedPlan(null)
        await load()
      }
      setActionId(null)
    })
  }

  async function handleReject(planId: string) {
    setActionId(planId)
    startTransition(async () => {
      const res = await rejectFixPlan(planId)
      if ('error' in res) {
        showToast('err', res.error)
      } else {
        showToast('ok', 'Plano rejeitado.')
        setPendingPlans(ps => ps.filter(p => p.id !== planId))
        setSelectedPlan(null)
        await load()
      }
      setActionId(null)
    })
  }

  const p0Count  = errors.filter(e => e.priority === 'P0').length
  const pending  = pendingPlans.length

  // ─── Sub-tab nav ────────────────────────────────────────────────────────────
  const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType; count?: number; countCls?: string }[] = [
    { id: 'logs',    label: 'Logs de Erro',      icon: Bug,       count: errors.length,  countCls: p0Count > 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600' },
    { id: 'pending', label: 'Planos Pendentes',  icon: Clock,     count: pending,        countCls: pending > 0 ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-600' },
    { id: 'history', label: 'Histórico',         icon: CheckCircle2 },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
            <Activity className="h-4 w-4 text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">Monitoramento de Erros</h2>
            <p className="text-xs text-slate-500 hidden sm:block">Captura, classificação IA e planos de correção autônoma</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p0Count > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 border border-red-200 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              {p0Count} P0 ativo{p0Count > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {generating
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            <span className="hidden sm:inline">Planejar agora</span>
            <span className="sm:hidden">Planejar</span>
          </button>
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-2 sm:px-4 pt-3 border-b border-slate-100 overflow-x-auto">
        {SUB_TABS.map(t => {
          const Icon   = t.icon
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap
                ${active ? 'bg-white border border-b-white border-slate-200 text-slate-900 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.countCls ?? 'bg-slate-200 text-slate-600'}`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="p-3 sm:p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando dados...</span>
          </div>
        ) : (
          <>
            {subTab === 'logs'    && <ErrorLogsTab    errors={errors} />}
            {subTab === 'pending' && (
              <PendingPlansTab
                plans={pendingPlans}
                actionId={actionId}
                resending={resending}
                onView={p => setSelectedPlan(p)}
                onApprove={handleApprove}
                onReject={handleReject}
                onResend={handleResend}
              />
            )}
            {subTab === 'history' && <HistoryTab plans={historyPlans} onView={p => setSelectedPlan(p)} />}
          </>
        )}
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm
          ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok'
            ? toast.msg.includes('WhatsApp')
              ? <MessageSquare className="w-4 h-4 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}

      {/* ── Slide-over ──────────────────────────────────────────────────────── */}
      <FixPlanSlideOver
        plan={selectedPlan}
        actionId={actionId}
        onClose={() => setSelectedPlan(null)}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  )
}

// ─── Sub-tab: Logs de Erro ────────────────────────────────────────────────────

function ErrorLogsTab({ errors }: { errors: ErrorLog[] }) {
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <CheckCircle2 className="w-10 h-10 text-emerald-300" />
        <p className="text-sm font-medium text-slate-500">Nenhum erro ativo</p>
        <p className="text-xs">Sistema operando normalmente.</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Mobile: cards ─────────────────────────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        {errors.map(err => {
          const priority = (err.priority ?? 'P2') as 'P0' | 'P1' | 'P2'
          const Icon     = P_ICON[priority] ?? Info
          return (
            <div key={err.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shrink-0 ${P_BADGE[priority] ?? P_BADGE.P2}`}>
                  <Icon className="w-3 h-3" />
                  {priority}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <SourceBadge source={err.source} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold
                    ${err.occurrence_count >= 10 ? 'bg-red-100 text-red-700' :
                      err.occurrence_count >= 5  ? 'bg-orange-100 text-orange-600' :
                                                    'bg-slate-100 text-slate-600'}`}>
                    {err.occurrence_count}×
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-800 font-medium line-clamp-2 mb-1">{err.error_message}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {err.module && (
                  <span className="text-[10px] font-medium text-slate-600 bg-slate-200 rounded px-1.5 py-0.5">{err.module}</span>
                )}
                {err.clinic_name && (
                  <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{err.clinic_name}</span>
                )}
                <span className="font-mono text-[10px] text-slate-400 truncate max-w-[160px]">{err.path}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: tabela ───────────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <th className="pb-2 pr-4 font-semibold text-left">Prioridade</th>
              <th className="pb-2 pr-4 font-semibold text-left">Clínica</th>
              <th className="pb-2 pr-4 font-semibold text-left">Módulo</th>
              <th className="pb-2 pr-4 font-semibold text-left">Rota</th>
              <th className="pb-2 pr-4 font-semibold text-left">Erro</th>
              <th className="pb-2 pr-4 font-semibold text-left">Origem</th>
              <th className="pb-2 text-right font-semibold">Ocorrências</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {errors.map(err => {
              const priority = (err.priority ?? 'P2') as 'P0' | 'P1' | 'P2'
              const Icon     = P_ICON[priority] ?? Info
              return (
                <tr key={err.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${P_BADGE[priority] ?? P_BADGE.P2}`}>
                      <Icon className="w-3 h-3" />
                      {priority}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 max-w-[140px]">
                    <span className="text-xs text-slate-700 truncate block" title={err.clinic_name ?? undefined}>
                      {err.clinic_name ?? <span className="text-slate-400 italic">global</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
                      {err.module ?? '—'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate-500 max-w-[140px] truncate">
                    {err.path}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-700 max-w-[240px]">
                    <p className="truncate">{err.error_message}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <SourceBadge source={err.source} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold
                      ${err.occurrence_count >= 10 ? 'bg-red-100 text-red-700' :
                        err.occurrence_count >= 5  ? 'bg-orange-100 text-orange-600' :
                                                      'bg-slate-100 text-slate-600'}`}>
                      {err.occurrence_count}×
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Sub-tab: Planos Pendentes ────────────────────────────────────────────────

function PendingPlansTab({
  plans, actionId, resending, onView, onApprove, onReject, onResend,
}: {
  plans: FixPlan[]
  actionId:  string | null
  resending: string | null
  onView:    (p: FixPlan) => void
  onApprove: (id: string) => void
  onReject:  (id: string) => void
  onResend:  (id: string) => void
}) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <FileText className="w-10 h-10 text-slate-200" />
        <p className="text-sm font-medium text-slate-500">Nenhum plano aguardando aprovação</p>
        <p className="text-xs text-slate-400 text-center max-w-xs">
          Use <span className="font-semibold text-indigo-600">Planejar agora</span> para forçar a geração, ou aguarde o ciclo automático (a cada hora).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {plans.map(plan => (
        <PlanCard
          key={plan.id}
          plan={plan}
          actionId={actionId}
          resending={resending}
          onView={onView}
          onApprove={onApprove}
          onReject={onReject}
          onResend={onResend}
          showActions
        />
      ))}
    </div>
  )
}

// ─── Sub-tab: Histórico ───────────────────────────────────────────────────────

function HistoryTab({ plans, onView }: { plans: FixPlan[]; onView: (p: FixPlan) => void }) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <Activity className="w-10 h-10 text-slate-200" />
        <p className="text-sm font-medium text-slate-500">Nenhum histórico ainda</p>
        <p className="text-xs text-slate-400">Planos aprovados, concluídos e rejeitados aparecerão aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {plans.map(plan => (
        <PlanCard key={plan.id} plan={plan} actionId={null} resending={null} onView={onView} showActions={false} />
      ))}
    </div>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan, actionId, resending, onView, onApprove, onReject, onResend, showActions,
}: {
  plan: FixPlan
  actionId:   string | null
  resending?: string | null
  onView:     (p: FixPlan) => void
  onApprove?: (id: string) => void
  onReject?:  (id: string) => void
  onResend?:  (id: string) => void
  showActions: boolean
}) {
  const priority = plan.priority as 'P0' | 'P1' | 'P2'
  const statusCfg = STATUS_CFG[plan.status] ?? { label: plan.status, cls: 'bg-slate-100 text-slate-600' }
  const isBusy   = actionId === plan.id
  const isSending = resending === plan.id

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${P_BADGE[priority] ?? ''}`}>
              {priority}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
            {plan.affected_modules.length > 0 && plan.affected_modules.map(m => (
              <span key={m} className="rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 text-xs">{m}</span>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-slate-900 truncate">{plan.title}</h3>

          {plan.error_summary && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{plan.error_summary}</p>
          )}

          <p className="mt-1.5 text-[11px] text-slate-400">
            Criado em {new Date(plan.created_at).toLocaleDateString('pt-BR')}
            {plan.approved_at && ` · Aprovado em ${new Date(plan.approved_at).toLocaleDateString('pt-BR')}`}
          </p>

          {plan.pr_url && (
            <a href={plan.pr_url} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Ver PR no GitHub →
            </a>
          )}
        </div>

        {/* Ver Plano */}
        <button
          onClick={() => onView(plan)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
        >
          <FileText className="w-3.5 h-3.5" />
          Ver Plano
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Approved CTA */}
      {plan.status === 'approved' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-700">
            <span className="font-semibold">Aprovado</span> — a Mozart Routine executará a correção automaticamente na Sprint G-07-E. Um PR será aberto para revisão antes do merge.
          </p>
        </div>
      )}

      {/* Approve / Reject / Re-enviar — abaixo do conteúdo */}
      {showActions && onApprove && onReject && (
        <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
          {onResend && (
            <button
              onClick={() => onResend(plan.id)}
              disabled={isSending || isBusy}
              title="Re-enviar notificação WhatsApp para aprovação"
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-green-50 hover:text-green-700 hover:border-green-200 disabled:opacity-50 transition-colors"
            >
              {isSending
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <MessageSquare className="w-3.5 h-3.5" />
              }
            </button>
          )}
          <button
            onClick={() => onReject(plan.id)}
            disabled={isBusy || isSending}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Recusar
          </button>
          <button
            onClick={() => onApprove(plan.id)}
            disabled={isBusy || isSending}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isBusy
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <CheckCircle2 className="w-4 h-4" />
            }
            Aprovar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, string> = {
    client:  'bg-blue-50 text-blue-600',
    server:  'bg-slate-100 text-slate-600',
    api:     'bg-purple-50 text-purple-600',
    edge:    'bg-cyan-50 text-cyan-600',
    vercel:  'bg-black/10 text-slate-700',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${cfg[source] ?? 'bg-slate-100 text-slate-500'}`}>
      {source}
    </span>
  )
}
