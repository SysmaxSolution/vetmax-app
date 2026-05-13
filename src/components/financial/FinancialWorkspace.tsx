'use client'

import { useState, useTransition, useMemo } from 'react'
import { MODULE_THEME } from '@/lib/module-theme'
import {
  listEntries, getFinancialSummary,
  type FinancialEntry, type EntryType, type FinancialSummary,
  type BankAccount, type ChartOfAccount, type CreditCard, type Employee,
} from '@/lib/actions/financial'
import TituloModal, { type TituloModalProps } from './TituloModal'
import BankAccountsTab    from './cadastros/BankAccountsTab'
import ChartOfAccountsTab from './cadastros/ChartOfAccountsTab'
import CreditCardsTab     from './cadastros/CreditCardsTab'
import EmployeesTab       from './cadastros/EmployeesTab'
import ExtratoTab         from './ExtratoTab'
import ConciliacaoTab     from './ConciliacaoTab'
import {
  Plus, RefreshCcw, Search, Filter,
  TrendingUp, AlertTriangle, CheckCircle2,
  ChevronDown, DollarSign, BookOpen, Receipt, GitMerge,
  ArrowDownCircle, RotateCcw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'pending' | 'paid' | 'cancelled'
type MainTab = EntryType | 'extrato' | 'conciliacao' | 'cadastros'
type CadastrosSubTab = 'bancos' | 'plano_contas' | 'cartoes' | 'funcionarios'

interface Props {
  initialReceivable:        FinancialEntry[]
  initialPayable:           FinancialEntry[]
  initialReceivableSummary: FinancialSummary | null
  initialPayableSummary:    FinancialSummary | null
  // G-10 cadastros
  initialBankAccounts:   BankAccount[]
  initialChartAccounts:  ChartOfAccount[]
  initialCreditCards:    CreditCard[]
  initialEmployees:      Employee[]
  isAdmin:               boolean
  // Novos campos 0131
  clinicProfiles:        { id: string; full_name: string; role: string }[]
  currentUserId:         string
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function isOverdue(entry: FinancialEntry): boolean {
  if (entry.status !== 'pending') return false
  return entry.due_date < new Date().toISOString().split('T')[0]
}

function StatusBadge({ entry }: { entry: FinancialEntry }) {
  if (entry.status === 'paid') {
    return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Pago</span>
  }
  if (entry.status === 'cancelled') {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Cancelado</span>
  }
  if (isOverdue(entry)) {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Atrasado</span>
  }
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Pendente</span>
}

// ─── Totalizadores ────────────────────────────────────────────────────────────

function SummaryCards({ summary, type }: { summary: FinancialSummary; type: EntryType }) {
  const isRec = type === 'receivable'
  const cards = [
    {
      label:  isRec ? 'A Receber (Mês)' : 'A Pagar (Mês)',
      value:  summary.toReceiveMonth,
      count:  summary.toReceiveMonthCount,
      icon:   TrendingUp,
      color:  'border-amber-200 bg-amber-50',
      iconColor: 'text-amber-500',
      valueColor: 'text-amber-700',
    },
    {
      label:  'Vencidos',
      value:  summary.overdue,
      count:  summary.overdueCount,
      icon:   AlertTriangle,
      color:  'border-red-200 bg-red-50',
      iconColor: 'text-red-500',
      valueColor: 'text-red-700',
    },
    {
      label:  isRec ? 'Recebidos (Mês)' : 'Pagos (Mês)',
      value:  summary.paidMonth,
      count:  summary.paidMonthCount,
      icon:   CheckCircle2,
      color:  'border-emerald-200 bg-emerald-50',
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-700',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`h-4 w-4 ${card.iconColor}`} />
            <span className="text-xs font-semibold text-slate-600">{card.label}</span>
          </div>
          <p className={`text-xl font-bold ${card.valueColor}`}>{fmt(card.value)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{card.count} {card.count === 1 ? 'título' : 'títulos'}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────

function EntryRow({
  entry,
  isReceivable,
  onClick,
  onBaixar,
  onEstornar,
}: {
  entry:        FinancialEntry
  isReceivable: boolean
  onClick:      () => void
  onBaixar:     () => void
  onEstornar:   () => void
}) {
  const netAmount = entry.amount - (entry.discount ?? 0)

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-slate-100 hover:bg-teal-50/50 transition-colors group"
    >
      {/* Nº */}
      <td className="py-3 px-3 text-xs font-mono text-slate-400 whitespace-nowrap hidden sm:table-cell">
        {entry.document_number ?? '—'}
      </td>

      {/* Descrição + Pet/Tutor + Categoria */}
      <td className="py-3 px-4 text-sm text-slate-700 max-w-[200px]">
        <p className="font-medium truncate">{entry.description}</p>
        {(entry.tutor_name || entry.patient_name) && (
          <p className="text-xs text-slate-400 truncate">
            {[entry.patient_name, entry.tutor_name].filter(Boolean).join(' · ')}
          </p>
        )}
        {entry.category && <p className="text-xs text-teal-600">{entry.category}</p>}
        {entry.chart_account_label && (
          <p className="text-xs text-slate-400 truncate">{entry.chart_account_label}</p>
        )}
      </td>

      {/* Cadastro */}
      <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
        {fmtDate(entry.created_at.split('T')[0])}
      </td>

      {/* Vencimento */}
      <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap hidden sm:table-cell">
        <span className={isOverdue(entry) ? 'text-red-600 font-semibold' : ''}>
          {fmtDate(entry.due_date)}
        </span>
      </td>

      {/* Valor + Desconto */}
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <p className="text-sm font-semibold text-slate-800">{fmt(netAmount)}</p>
        {entry.discount > 0 && (
          <p className="text-xs text-slate-400">-{fmt(entry.discount)}</p>
        )}
      </td>

      {/* Status */}
      <td className="py-3 px-3">
        <StatusBadge entry={entry} />
      </td>

      {/* Ação: Baixar / Estornar */}
      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
        {entry.status === 'pending' && (
          <button
            onClick={onBaixar}
            className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            Baixar
          </button>
        )}
        {entry.status === 'paid' && (
          <button
            onClick={onEstornar}
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Estornar
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Workspace principal ──────────────────────────────────────────────────────

export default function FinancialWorkspace({
  initialReceivable,
  initialPayable,
  initialReceivableSummary,
  initialPayableSummary,
  initialBankAccounts,
  initialChartAccounts,
  initialCreditCards,
  initialEmployees,
  isAdmin,
  clinicProfiles,
  currentUserId,
}: Props) {
  const theme = MODULE_THEME.financial

  const [activeTab,    setActiveTab]    = useState<MainTab>('receivable')
  const [cadastrosTab, setCadastrosTab] = useState<CadastrosSubTab>('bancos')

  const [receivable, setReceivable] = useState<FinancialEntry[]>(initialReceivable)
  const [payable,    setPayable]    = useState<FinancialEntry[]>(initialPayable)
  const [recSummary, setRecSummary] = useState<FinancialSummary | null>(initialReceivableSummary)
  const [paySummary, setPaySummary] = useState<FinancialSummary | null>(initialPayableSummary)

  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [showFilters,  setShowFilters]  = useState(false)
  const [dueFrom,  setDueFrom]  = useState('')
  const [dueTo,    setDueTo]    = useState('')

  const [modal, setModal] = useState<{ mode: 'create' | 'edit' | 'baixar'; entry?: FinancialEntry } | null>(null)

  const [isPending, startTransition] = useTransition()

  const isTitulos      = activeTab === 'receivable' || activeTab === 'payable'
  const isExtrato      = activeTab === 'extrato'
  const isConciliacao  = activeTab === 'conciliacao'
  const entries        = activeTab === 'receivable' ? receivable : payable
  const summary        = activeTab === 'receivable' ? recSummary : paySummary

  const filtered = useMemo(() => {
    if (!isTitulos) return []
    let list = entries
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.tutor_name   ?? '').toLowerCase().includes(q) ||
        (e.patient_name ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending') {
        list = list.filter(e => e.status === 'pending' && !isOverdue(e))
      } else if (filterStatus === 'cancelled') {
        list = list.filter(e => e.status === 'cancelled')
      } else if (filterStatus === 'paid') {
        list = list.filter(e => e.status === 'paid')
      }
    }
    if (dueFrom) list = list.filter(e => e.due_date >= dueFrom)
    if (dueTo)   list = list.filter(e => e.due_date <= dueTo)
    return list
  }, [entries, search, filterStatus, dueFrom, dueTo, isTitulos])

  function refresh() {
    startTransition(async () => {
      const [recRes, payRes, recSum, paySum] = await Promise.all([
        listEntries({ type: 'receivable', status: 'all' }),
        listEntries({ type: 'payable',   status: 'all' }),
        getFinancialSummary('receivable'),
        getFinancialSummary('payable'),
      ])
      if (Array.isArray(recRes)) setReceivable(recRes)
      if (Array.isArray(payRes)) setPayable(payRes)
      if (!('error' in recSum))  setRecSummary(recSum)
      if (!('error' in paySum))  setPaySummary(paySum)
    })
  }

  function onModalSuccess() {
    setModal(null)
    refresh()
  }

  const overdueCount = isTitulos ? (activeTab === 'receivable' ? receivable : payable).filter(isOverdue).length : 0

  const mainTabs = [
    { id: 'receivable'  as MainTab, label: 'Contas a Receber' },
    { id: 'payable'     as MainTab, label: 'Contas a Pagar'   },
    { id: 'extrato'     as MainTab, label: 'Extrato'           },
    { id: 'conciliacao' as MainTab, label: 'Conciliação'       },
    { id: 'cadastros'   as MainTab, label: 'Cadastros'         },
  ]

  const cadastrosSubTabs: { id: CadastrosSubTab; label: string }[] = [
    { id: 'bancos',       label: 'Bancos' },
    { id: 'plano_contas', label: 'Plano de Contas' },
    { id: 'cartoes',      label: 'Cartões' },
    { id: 'funcionarios', label: 'Funcionários' },
  ]

  return (
    <div className={`min-h-screen ${theme.bg} pb-10`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`${theme.bgIntense} border-b border-teal-200 px-4 py-4`}>
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-teal-900">Financeiro</h1>
              {overdueCount > 0 && (
                <p className="text-xs text-red-600 font-medium">
                  {overdueCount} título{overdueCount > 1 ? 's' : ''} vencido{overdueCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTitulos && (
              <>
                <button
                  onClick={refresh}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setModal({ mode: 'create' })}
                  className="flex items-center gap-2 rounded-xl bg-teal-600 px-3 sm:px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Novo Título</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 space-y-4">

        {/* ── Main Tabs ──────────────────────────────────────────────────── */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 gap-1 w-max min-w-full sm:w-fit sm:min-w-0">
            {mainTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap flex-1 sm:flex-none justify-center ${
                  activeTab === t.id
                    ? `${theme.active} text-white shadow-sm`
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t.id === 'cadastros'   && <BookOpen   className="h-3.5 w-3.5" />}
                {t.id === 'extrato'     && <Receipt     className="h-3.5 w-3.5" />}
                {t.id === 'conciliacao' && <GitMerge    className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Títulos: Totalizadores ──────────────────────────────────────── */}
        {isTitulos && summary && <SummaryCards summary={summary} type={activeTab as EntryType} />}

        {/* ── Títulos: Filtros ───────────────────────────────────────────── */}
        {isTitulos && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            {/* Linha 1: busca + botão filtros avançados */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por descrição, tutor ou pet..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <button
                onClick={() => setShowFilters(v => !v)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filtros</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Linha 2: chips de status */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { v: 'all'       as FilterStatus, label: 'Todos' },
                { v: 'pending'   as FilterStatus, label: 'Pendentes' },
                { v: 'paid'      as FilterStatus, label: 'Pagos' },
                { v: 'cancelled' as FilterStatus, label: 'Cancelados' },
              ].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setFilterStatus(opt.v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    filterStatus === opt.v
                      ? `${theme.active} text-white`
                      : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Vencimento — De</label>
                  <input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Vencimento — Até</label>
                  <input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Títulos: Tabela ────────────────────────────────────────────── */}
        {isTitulos && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DollarSign className="h-12 w-12 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-400">
                  {search || filterStatus !== 'all' || dueFrom || dueTo
                    ? 'Nenhum título encontrado com os filtros aplicados.'
                    : activeTab === 'receivable'
                      ? 'Nenhum título a receber. Clique em "Novo Título" para lançar.'
                      : 'Nenhum título a pagar. Clique em "Novo Título" para lançar.'
                  }
                </p>
                {!search && filterStatus === 'all' && (
                  <button
                    onClick={() => setModal({ mode: 'create' })}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Novo Título
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="py-3 px-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap hidden sm:table-cell">Nº</th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Descrição</th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap hidden lg:table-cell">Cadastro</th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap hidden sm:table-cell">Vencimento</th>
                      <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase">Valor</th>
                      <th className="py-3 px-3 text-left text-xs font-bold text-slate-500 uppercase">Status</th>
                      <th className="py-3 px-3 text-left text-xs font-bold text-slate-500 uppercase">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(entry => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        isReceivable={activeTab === 'receivable'}
                        onClick={() => setModal({ mode: 'edit', entry })}
                        onBaixar={() => setModal({ mode: 'baixar', entry })}
                        onEstornar={() => setModal({ mode: 'edit', entry })}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 bg-slate-50">
                  <p className="text-xs text-slate-400">
                    {filtered.length} {filtered.length === 1 ? 'título' : 'títulos'}
                    {filtered.length !== entries.length ? ` (filtrado de ${entries.length})` : ''}
                  </p>
                  <p className="text-sm font-bold text-slate-700">
                    Total: {fmt(filtered.reduce((s, e) => s + e.amount - (e.discount ?? 0), 0))}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Extrato Bancário ───────────────────────────────────────────── */}
        {isExtrato && (
          <ExtratoTab bankAccounts={initialBankAccounts} />
        )}

        {/* ── Conciliação ────────────────────────────────────────────────── */}
        {isConciliacao && (
          <ConciliacaoTab bankAccounts={initialBankAccounts} />
        )}

        {/* ── Cadastros ──────────────────────────────────────────────────── */}
        {activeTab === 'cadastros' && (
          <div className="space-y-4">
            {/* Sub-abas Cadastros */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-max min-w-full sm:w-fit sm:min-w-0">
                {cadastrosSubTabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setCadastrosTab(t.id)}
                    className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex-1 sm:flex-none ${
                      cadastrosTab === t.id
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conteúdo da sub-aba */}
            {cadastrosTab === 'bancos' && (
              <BankAccountsTab initialAccounts={initialBankAccounts} />
            )}
            {cadastrosTab === 'plano_contas' && (
              <ChartOfAccountsTab initialAccounts={initialChartAccounts} />
            )}
            {cadastrosTab === 'cartoes' && (
              <CreditCardsTab initialCards={initialCreditCards} />
            )}
            {cadastrosTab === 'funcionarios' && (
              <EmployeesTab
                employees={initialEmployees.map(e => ({
                  id:         e.id,
                  name:       e.name,
                  role:       e.role,
                  department: null,
                  salary:     e.salary ?? null,
                  phone:      e.phone ?? null,
                  email:      e.email ?? null,
                  is_active:  e.is_active,
                }))}
                canEditFinancial={isAdmin}
                onToast={(_type, _msg) => {}}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal && (
        <TituloModal
          mode={modal.mode}
          entryType={activeTab as EntryType}
          entry={modal.entry}
          onClose={() => setModal(null)}
          onSuccess={onModalSuccess}
          bankAccounts={initialBankAccounts.map(b => ({ id: b.id, name: b.name }))}
          chartAccounts={initialChartAccounts.map(c => ({ id: c.id, code: c.code, name: c.name }))}
          clinicProfiles={clinicProfiles}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}
