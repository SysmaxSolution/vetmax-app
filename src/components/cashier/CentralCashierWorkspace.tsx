'use client'

import { useState, useCallback } from 'react'
import {
  DollarSign, CheckCircle2, Archive, RefreshCw, Loader2, Filter,
  TrendingUp, AlertCircle, Clock, BadgeCheck, RotateCcw, Minus,
} from 'lucide-react'
import {
  listCashierEntries, verifyCashierEntry, archiveCashierEntry,
  type CentralCashierEntry, type CashierSummary,
} from '@/lib/actions/core-management'
import CashierReversalModal from './CashierReversalModal'
import CashierOutflowModal from './CashierOutflowModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  grooming:     'Banho e Tosa',
  pharmacy:     'Farmácia',
  consultation: 'Consulta',
  exam:         'Exame',
  manual:       'Manual',
  adjustment:   'Ajuste',
}

const STATUS_CONFIG = {
  recorded: { label: 'Registrado',  cls: 'bg-amber-100 text-amber-700',     icon: <Clock        className="h-3 w-3" /> },
  verified: { label: 'Verificado',  cls: 'bg-emerald-100 text-emerald-700', icon: <BadgeCheck   className="h-3 w-3" /> },
  archived: { label: 'Arquivado',   cls: 'bg-slate-100 text-slate-500',     icon: <Archive      className="h-3 w-3" /> },
  reversed: { label: 'Estornado',   cls: 'bg-red-100 text-red-600',         icon: <RotateCcw    className="h-3 w-3" /> },
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialEntries: CentralCashierEntry[]
  summary:        CashierSummary | null
  userRole:       string
  sessionId?:     string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CentralCashierWorkspace({ initialEntries, summary, userRole, sessionId }: Props) {
  const [entries,        setEntries]        = useState<CentralCashierEntry[]>(initialEntries)
  const [loading,        setLoading]        = useState(false)
  const [actionId,       setActionId]       = useState<string | null>(null)
  const [filterMod,      setFilterMod]      = useState<string>('all')
  const [filterStat,     setFilterStat]     = useState<string>('all')
  const [toast,          setToast]          = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [reversalEntry,  setReversalEntry]  = useState<CentralCashierEntry | null>(null)
  const [showOutflow,    setShowOutflow]    = useState(false)

  const isAccountant = ['admin', 'owner', 'accountant'].includes(userRole)
  const isAdmin      = ['admin', 'owner'].includes(userRole)
  const isManager    = ['admin', 'owner', 'manager'].includes(userRole)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await listCashierEntries()
    setLoading(false)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(res)
  }, [])

  const handleVerify = async (id: string) => {
    setActionId(id)
    const res = await verifyCashierEntry(id)
    setActionId(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'verified' } : e))
    showToast('Entrada verificada.', 'success')
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Arquivar esta entrada? Ela não aparecerá mais no caixa ativo.')) return
    setActionId(id)
    const res = await archiveCashierEntry(id)
    setActionId(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'archived' } : e))
    showToast('Entrada arquivada.', 'success')
  }

  const displayed = entries.filter(e => {
    if (filterMod  !== 'all' && e.source_module !== filterMod)  return false
    if (filterStat !== 'all' && e.status         !== filterStat) return false
    return true
  })

  const totalDisplayed = displayed.reduce((s, e) => s + Number(e.amount), 0)

  const uniqueModules = [...new Set(entries.map(e => e.source_module))]

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {reversalEntry && (
        <CashierReversalModal
          entry={reversalEntry}
          onClose={() => setReversalEntry(null)}
          onSuccess={refresh}
          onToast={showToast}
        />
      )}
      {showOutflow && (
        <CashierOutflowModal
          sessionId={sessionId}
          onClose={() => setShowOutflow(false)}
          onSuccess={refresh}
          onToast={showToast}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Caixa Central</h1>
          <p className="text-sm text-slate-500 mt-0.5">Consolidado de todas as receitas da clínica</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={() => setShowOutflow(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
            >
              <Minus className="h-4 w-4" />
              Registrar Saída
            </button>
          )}
          <button
            id="btn-refresh-cashier"
            data-testid="btn-refresh-cashier"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div
          id="cashier-summary-cards"
          data-testid="cashier-summary-cards"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Registrado</p>
            </div>
            <p data-testid="kpi-total-recorded" className="text-2xl font-bold text-slate-900">{fmt(summary.total_recorded)}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Verificado</p>
            </div>
            <p data-testid="kpi-total-verified" className="text-2xl font-bold text-emerald-700">{fmt(summary.total_verified)}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <DollarSign className="h-4 w-4 text-slate-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lançamentos</p>
            </div>
            <p data-testid="kpi-entry-count" className="text-2xl font-bold text-slate-900">{summary.entry_count}</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />

        <select
          id="filter-module"
          data-testid="filter-module"
          value={filterMod}
          onChange={e => setFilterMod(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">Todos os módulos</option>
          {uniqueModules.map(m => (
            <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
          ))}
        </select>

        <select
          id="filter-status"
          data-testid="filter-status"
          value={filterStat}
          onChange={e => setFilterStat(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">Todos os status</option>
          <option value="recorded">Registrado</option>
          <option value="verified">Verificado</option>
          <option value="archived">Arquivado</option>
          <option value="reversed">Estornado</option>
        </select>

        <span className="text-xs text-slate-500 ml-auto">
          {displayed.length} lançamento(s) · {fmt(totalDisplayed)}
        </span>
      </div>

      {/* Table */}
      <div
        id="cashier-entries-table"
        data-testid="cashier-entries-table"
        data-filtermod={filterMod}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Módulo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                {isAccountant && (
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-sm text-slate-400">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : (
                displayed.map(entry => {
                  const sc = STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.recorded
                  return (
                    <tr
                      key={entry.id}
                      data-testid={`cashier-row-${entry.id}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-slate-600 text-xs whitespace-nowrap">
                        {fmtDate(entry.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                          {MODULE_LABELS[entry.source_module] ?? entry.source_module}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 max-w-[200px] truncate">
                        {entry.reason ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900 tabular-nums">
                        {fmt(Number(entry.amount))}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>
                          {sc.icon}{sc.label}
                        </span>
                      </td>
                      {isAccountant && (
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {entry.status === 'recorded' && (
                              <button
                                data-testid={`btn-verify-${entry.id}`}
                                onClick={() => handleVerify(entry.id)}
                                disabled={actionId === entry.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                title="Verificar"
                              >
                                {actionId === entry.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <BadgeCheck className="h-3 w-3" />}
                                Verificar
                              </button>
                            )}
                            {entry.status !== 'archived' && isAdmin && (
                              <button
                                data-testid={`btn-archive-${entry.id}`}
                                onClick={() => handleArchive(entry.id)}
                                disabled={actionId === entry.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                                title="Arquivar"
                              >
                                <Archive className="h-3 w-3" />
                              </button>
                            )}
                            {entry.status !== 'archived' && isManager && (
                              <button
                                data-testid={`btn-reverse-${entry.id}`}
                                onClick={() => setReversalEntry(entry)}
                                disabled={actionId === entry.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                                title="Estornar"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
