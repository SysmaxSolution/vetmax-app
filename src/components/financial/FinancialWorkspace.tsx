'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import {
  listEntries, getFinancialSummary, baixarTitulosBulk,
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
import CreditsTab         from './CreditsTab'
import PagforTab          from './PagforTab'
import BoletosTab         from './BoletosTab'
import CrossCompanyTab     from './CrossCompanyTab'
import Link from 'next/link'
import {
  Plus, RefreshCcw, Search, Filter,
  TrendingUp, AlertTriangle, CheckCircle2,
  ChevronDown, DollarSign, BookOpen, Receipt, GitMerge,
  ArrowDownCircle, RotateCcw, PawPrint, CreditCard as CreditCardIcon,
  X, Loader2,
} from 'lucide-react'
import { useModule } from '@/components/providers/ModulesProvider'
import { useUsaConvenios, useUsaBoleto, useAnimaisFoundation } from '@/components/providers/ClinicConfigProvider'
import { sumByStatus } from '@/lib/finance/entry-totals'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'pending' | 'paid' | 'cancelled'
type MainTab = EntryType | 'extrato' | 'conciliacao' | 'creditos' | 'pagfor' | 'boletos' | 'cnpjs' | 'cadastros'
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
  // Pending vinculado a convênio Petlove em aberto — aviso visual específico
  if (entry.status === 'pending' && entry.source === 'petlove_open') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700"
        title="Aguardando repasse da PetLove. Será baixado automaticamente quando a remessa fechada do período chegar."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        Aguardando Petlove
      </span>
    )
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
        <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`h-4 w-4 ${card.iconColor}`} />
            <span className="text-xs font-semibold text-slate-600">{card.label}</span>
          </div>
          <p className={`text-xl font-bold font-mono tabular-nums ${card.valueColor}`}>{fmt(card.value)}</p>
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
  selected,
  onToggleSelect,
  onClick,
  onBaixar,
  onEstornar,
}: {
  entry:          FinancialEntry
  isReceivable:   boolean
  selected:       boolean
  onToggleSelect: () => void
  onClick:        () => void
  onBaixar:       () => void
  onEstornar:     () => void
}) {
  const netAmount = entry.amount - (entry.discount ?? 0)

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-slate-100 transition-colors group ${selected ? 'bg-teal-50/70' : 'hover:bg-teal-50/50'}`}
    >
      {/* Seleção */}
      <td className="py-3 pl-4 pr-1 w-8" onClick={e => e.stopPropagation()}>
        {entry.status === 'pending' && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
          />
        )}
      </td>

      {/* Nº */}
      <td className="py-3 px-3 text-xs font-mono text-slate-400 whitespace-nowrap hidden sm:table-cell">
        {entry.document_number ?? (entry.os_number ? `OS ${entry.os_number}` : '—')}
      </td>

      {/* Descrição + Pet/Tutor + Categoria */}
      <td className="py-3 px-4 text-sm text-slate-700 max-w-[200px]">
        <p className="font-medium truncate">{entry.description}</p>
        {entry.os_number && (
          <p className="text-xs font-mono text-slate-500">OS Nº {entry.os_number}</p>
        )}
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
      <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell font-mono tabular-nums">
        {fmtDate(entry.created_at.split('T')[0])}
      </td>

      {/* Vencimento */}
      <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap hidden sm:table-cell font-mono tabular-nums">
        <span className={isOverdue(entry) ? 'text-red-600 font-semibold' : ''}>
          {fmtDate(entry.due_date)}
        </span>
      </td>

      {/* Valor + Desconto */}
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <p className="text-sm font-semibold text-slate-800 font-mono tabular-nums">{fmt(netAmount)}</p>
        {entry.discount > 0 && (
          <p className="text-xs text-slate-400 font-mono tabular-nums">-{fmt(entry.discount)}</p>
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

// ─── Modal de baixa em massa ────────────────────────────────────────────────

const BULK_METHODS: { value: string; label: string }[] = [
  { value: 'pix',      label: 'PIX' },
  { value: 'transfer', label: 'Transferência (TED/DOC)' },
  { value: 'boleto',   label: 'Boleto' },
  { value: 'cash',     label: 'Dinheiro' },
  { value: 'debit',    label: 'Cartão de débito' },
  { value: 'credit',   label: 'Cartão de crédito' },
  { value: 'other',    label: 'Outro' },
]

function BulkBaixaModal({
  isReceivable, count, total, ids, bankAccounts, onClose, onDone,
}: {
  isReceivable: boolean
  count:        number
  total:        number
  ids:          string[]
  bankAccounts: BankAccount[]
  onClose:      () => void
  onDone:       () => void
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [date, setDate]     = useState(today)
  const [method, setMethod] = useState('pix')
  const [bankId, setBankId] = useState(bankAccounts.find(b => b.is_default)?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [result, setResult] = useState<{ paid: number; failed: number } | null>(null)

  const submit = async () => {
    setSaving(true); setErr(null)
    const res = await baixarTitulosBulk(ids, {
      payment_date: date, payment_method: method,
      settlement_bank_id: bankId || undefined,
    })
    setSaving(false)
    if ('error' in res) { setErr(res.error); return }
    if (res.failed > 0) { setResult({ paid: res.paid, failed: res.failed }); return }
    onDone()
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">
            {isReceivable ? 'Baixar' : 'Pagar'} {count} título{count > 1 ? 's' : ''}
          </h3>
          <button onClick={onClose} disabled={saving} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{isReceivable ? 'Total a receber' : 'Total a pagar'}</p>
            <p className={`text-2xl font-bold font-mono tabular-nums ${isReceivable ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(total)}</p>
          </div>
          {result ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {result.paid} baixado(s) com sucesso, {result.failed} falharam (podem já ter sido baixados). Feche e atualize a lista.
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Data {isReceivable ? 'do recebimento' : 'do pagamento'}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Forma de {isReceivable ? 'recebimento' : 'pagamento'}</label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20">
                  {BULK_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Conta {isReceivable ? 'de entrada' : 'de saída'} <span className="font-normal text-slate-400">(opcional — lança no extrato)</span></label>
                <select value={bankId} onChange={e => setBankId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20">
                  <option value="">Não lançar no extrato</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
            </>
          )}
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          {result ? (
            <button onClick={onDone} className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">Concluir</button>
          ) : (
            <>
              <button onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              <button onClick={submit} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Processando…</> : 'Confirmar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
  // Filtros avançados (busca/seleção de títulos para baixa em massa)
  const [docFilter,    setDocFilter]    = useState('')
  const [nameFilter,   setNameFilter]   = useState('')
  const [launchFrom,   setLaunchFrom]   = useState('')
  const [launchTo,     setLaunchTo]     = useState('')
  const [valorMin,     setValorMin]     = useState('')
  const [valorMax,     setValorMax]     = useState('')
  const [parcelaFilter, setParcelaFilter] = useState('')
  // Seleção múltipla + baixa em massa
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [bulkOpen,  setBulkOpen]  = useState(false)

  const [modal, setModal] = useState<{ mode: 'create' | 'edit' | 'baixar'; entry?: FinancialEntry } | null>(null)

  const [isPending, startTransition] = useTransition()

  const isTitulos      = activeTab === 'receivable' || activeTab === 'payable'
  const isExtrato      = activeTab === 'extrato'
  const isConciliacao  = activeTab === 'conciliacao'
  const isCreditos     = activeTab === 'creditos'
  const isPagfor       = activeTab === 'pagfor'
  const isBoletos      = activeTab === 'boletos'
  const isCnpjs        = activeTab === 'cnpjs'
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
        (e.patient_name ?? '').toLowerCase().includes(q) ||
        (e.beneficiary  ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending') {
        // "Pendentes" = todos os títulos não baixados e não cancelados.
        // Engloba pendentes em dia e atrasados — a tag visual "Atrasado"
        // continua diferenciando-os no badge.
        list = list.filter(e => e.status === 'pending')
      } else if (filterStatus === 'cancelled') {
        list = list.filter(e => e.status === 'cancelled')
      } else if (filterStatus === 'paid') {
        list = list.filter(e => e.status === 'paid')
      }
    }
    if (dueFrom) list = list.filter(e => e.due_date >= dueFrom)
    if (dueTo)   list = list.filter(e => e.due_date <= dueTo)
    // Filtros avançados
    if (docFilter.trim()) {
      const q = docFilter.trim().toLowerCase()
      list = list.filter(e =>
        (e.document_number ?? '').toLowerCase().includes(q) ||
        (e.os_number ?? '').toLowerCase().includes(q)
      )
    }
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase()
      list = list.filter(e =>
        (e.tutor_name  ?? '').toLowerCase().includes(q) ||
        (e.beneficiary ?? '').toLowerCase().includes(q) ||
        (e.patient_name ?? '').toLowerCase().includes(q)
      )
    }
    if (launchFrom) list = list.filter(e => e.created_at.split('T')[0] >= launchFrom)
    if (launchTo)   list = list.filter(e => e.created_at.split('T')[0] <= launchTo)
    const vMin = parseFloat(valorMin.replace(',', '.'))
    const vMax = parseFloat(valorMax.replace(',', '.'))
    if (Number.isFinite(vMin)) list = list.filter(e => (e.amount - (e.discount ?? 0)) >= vMin)
    if (Number.isFinite(vMax)) list = list.filter(e => (e.amount - (e.discount ?? 0)) <= vMax)
    if (parcelaFilter.trim()) {
      const q = parcelaFilter.trim().toLowerCase()
      list = list.filter(e =>
        (e.document_number ?? '').toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [entries, search, filterStatus, dueFrom, dueTo, docFilter, nameFilter, launchFrom, launchTo, valorMin, valorMax, parcelaFilter, isTitulos])

  // Seleção só de pendentes; limpa ao trocar de aba
  useEffect(() => { setSelected(new Set()) }, [activeTab])

  const selectablePending = useMemo(() => filtered.filter(e => e.status === 'pending'), [filtered])
  const selectedEntries   = useMemo(() => filtered.filter(e => selected.has(e.id) && e.status === 'pending'), [filtered, selected])
  const selectedTotal     = useMemo(() => selectedEntries.reduce((s, e) => s + (e.amount - (e.discount ?? 0)), 0), [selectedEntries])
  const allPendingSelected = selectablePending.length > 0 && selectablePending.every(e => selected.has(e.id))

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(prev => {
      const ids = selectablePending.map(e => e.id)
      const allOn = ids.every(id => prev.has(id))
      const n = new Set(prev)
      ids.forEach(id => allOn ? n.delete(id) : n.add(id))
      return n
    })
  }

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

  useAutoRefresh(refresh)   // auto-refresh a cada 15s

  const overdueCount = isTitulos ? (activeTab === 'receivable' ? receivable : payable).filter(isOverdue).length : 0

  // Tarefa 0 — Boletos e CNPJs deixam de ser abas fixas: cada um tem gate próprio.
  // Boletos: flow_config.usa_boleto (padrão desligado). CNPJs: animais_foundation.
  const usaBoleto = useUsaBoleto()
  const animaisFoundation = useAnimaisFoundation()
  const mainTabs = [
    { id: 'receivable'  as MainTab, label: 'Contas a Receber' },
    { id: 'payable'     as MainTab, label: 'Contas a Pagar'   },
    { id: 'extrato'     as MainTab, label: 'Extrato'           },
    { id: 'conciliacao' as MainTab, label: 'Conciliação'       },
    { id: 'creditos'    as MainTab, label: 'Créditos'          },
    { id: 'pagfor'      as MainTab, label: 'PAGFOR'            },
    ...(usaBoleto        ? [{ id: 'boletos' as MainTab, label: 'Boletos' }] : []),
    ...(animaisFoundation ? [{ id: 'cnpjs'  as MainTab, label: 'CNPJs'   }] : []),
    { id: 'cadastros'   as MainTab, label: 'Cadastros'         },
  ]

  const petloveModule = useModule('petlove_reconciliation')
  const usaConvenios = useUsaConvenios()
  const petloveEnabled = petloveModule && usaConvenios
  const externalTabs: { href: string; label: string; icon: typeof PawPrint; tone: string }[] = [
    {
      href:  '/dashboard/financial/cards',
      label: 'Cartões',
      icon:  CreditCardIcon,
      tone:  'text-indigo-700 hover:bg-indigo-50 border-indigo-200',
    },
    ...(petloveEnabled
      ? [{
          href:  '/dashboard/financial/insurance-reconciliation',
          label: 'Conciliação de Convênios',
          icon:  PawPrint,
          tone:  'text-purple-700 hover:bg-purple-50 border-purple-200',
        }]
      : []),
  ]

  const cadastrosSubTabs: { id: CadastrosSubTab; label: string }[] = [
    { id: 'bancos',       label: 'Bancos' },
    { id: 'plano_contas', label: 'Plano de Contas' },
    { id: 'cartoes',      label: 'Cartões' },
    { id: 'funcionarios', label: 'Funcionários' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 pb-10 animate-enter">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Financeiro</h1>
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
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setModal({ mode: 'create' })}
                  className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 sm:px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 transition-colors"
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
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t.id === 'cadastros'   && <BookOpen   className="h-3.5 w-3.5" />}
                {t.id === 'extrato'     && <Receipt     className="h-3.5 w-3.5" />}
                {t.id === 'conciliacao' && <GitMerge    className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            ))}
            {externalTabs.map(t => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap flex-1 sm:flex-none justify-center border bg-white ${t.tone}`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Títulos: Totalizadores ──────────────────────────────────────── */}
        {isTitulos && summary && <SummaryCards summary={summary} type={activeTab as EntryType} />}

        {/* ── Títulos: Filtros ───────────────────────────────────────────── */}
        {isTitulos && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
            {/* Linha 1: busca + botão filtros avançados */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={activeTab === 'payable' ? 'Buscar por descrição, fornecedor ou pet...' : 'Buscar por descrição, cliente ou pet...'}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <button
                onClick={() => setShowFilters(v => !v)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
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
                      ? 'bg-teal-600 text-white'
                      : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {showFilters && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nº do documento</label>
                    <input value={docFilter} onChange={e => setDocFilter(e.target.value)} placeholder="NF, OS, boleto…"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">{activeTab === 'payable' ? 'Fornecedor' : 'Cliente'}</label>
                    <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="Nome…"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Parcela</label>
                    <input value={parcelaFilter} onChange={e => setParcelaFilter(e.target.value)} placeholder="Ex: 2/3"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lançamento — De</label>
                    <input type="date" value={launchFrom} onChange={e => setLaunchFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lançamento — Até</label>
                    <input type="date" value={launchTo} onChange={e => setLaunchTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Vencimento — De</label>
                    <input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Vencimento — Até</label>
                    <input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Valor — Mín</label>
                    <input inputMode="decimal" value={valorMin} onChange={e => setValorMin(e.target.value)} placeholder="0,00"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Valor — Máx</label>
                    <input inputMode="decimal" value={valorMax} onChange={e => setValorMax(e.target.value)} placeholder="0,00"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <button
                      onClick={() => { setDocFilter(''); setNameFilter(''); setLaunchFrom(''); setLaunchTo(''); setDueFrom(''); setDueTo(''); setValorMin(''); setValorMax(''); setParcelaFilter('') }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
                    >
                      Limpar filtros
                    </button>
                  </div>
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
                  {search || filterStatus !== 'all' || dueFrom || dueTo || docFilter || nameFilter || launchFrom || launchTo || valorMin || valorMax || parcelaFilter
                    ? 'Nenhum título encontrado com os filtros aplicados.'
                    : activeTab === 'receivable'
                      ? 'Nenhum título a receber. Clique em "Novo Título" para lançar.'
                      : 'Nenhum título a pagar. Clique em "Novo Título" para lançar.'
                  }
                </p>
                {!search && filterStatus === 'all' && (
                  <button
                    onClick={() => setModal({ mode: 'create' })}
                    className="mt-4 flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
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
                      <th className="py-3 pl-4 pr-1 w-8">
                        {selectablePending.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allPendingSelected}
                            onChange={toggleSelectAll}
                            title="Selecionar todos os pendentes filtrados"
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
                          />
                        )}
                      </th>
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
                        selected={selected.has(entry.id)}
                        onToggleSelect={() => toggleSelect(entry.id)}
                        onClick={() => setModal({ mode: 'edit', entry })}
                        onBaixar={() => setModal({ mode: 'baixar', entry })}
                        onEstornar={() => setModal({ mode: 'edit', entry })}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 px-4 py-3 bg-slate-50">
                  <p className="text-xs text-slate-400">
                    {filtered.length} {filtered.length === 1 ? 'título' : 'títulos'}
                    {filtered.length !== entries.length ? ` (filtrado de ${entries.length})` : ''}
                  </p>
                  {/* Totais do conjunto filtrado, separados por situação (cancelados
                      não entram). "Em aberto" reconcilia com os cards A Receber+Vencidos. */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500">
                      Em aberto:{' '}
                      <strong className="font-mono tabular-nums text-amber-600">
                        {fmt(sumByStatus(filtered, 'pending'))}
                      </strong>
                    </span>
                    <span className="text-slate-500">
                      {activeTab === 'receivable' ? 'Recebido' : 'Pago'}:{' '}
                      <strong className="font-mono tabular-nums text-emerald-600">
                        {fmt(sumByStatus(filtered, 'paid'))}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Barra flutuante: baixa em massa ────────────────────────────── */}
        {isTitulos && selectedEntries.length > 0 && (
          <div className="fixed bottom-0 inset-x-0 z-[70] border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{selectedEntries.length}</span> título{selectedEntries.length > 1 ? 's' : ''} selecionado{selectedEntries.length > 1 ? 's' : ''}
                <span className="mx-2 text-slate-300">·</span>
                <span className={`font-mono tabular-nums font-bold ${activeTab === 'receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(selectedTotal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">Limpar</button>
                <button onClick={() => setBulkOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 shadow-sm">
                  <ArrowDownCircle className="h-4 w-4" />
                  {activeTab === 'receivable' ? 'Baixar recebimentos' : 'Baixar pagamentos'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkOpen && (
          <BulkBaixaModal
            isReceivable={activeTab === 'receivable'}
            count={selectedEntries.length}
            total={selectedTotal}
            ids={selectedEntries.map(e => e.id)}
            bankAccounts={initialBankAccounts}
            onClose={() => setBulkOpen(false)}
            onDone={() => { setBulkOpen(false); setSelected(new Set()); refresh() }}
          />
        )}

        {/* ── Extrato Bancário ───────────────────────────────────────────── */}
        {isExtrato && (
          <ExtratoTab bankAccounts={initialBankAccounts} />
        )}

        {/* ── Conciliação ────────────────────────────────────────────────── */}
        {isConciliacao && (
          <ConciliacaoTab bankAccounts={initialBankAccounts} />
        )}

        {/* ── Créditos de clientes ───────────────────────────────────────── */}
        {isCreditos && <CreditsTab />}

        {/* ── PAGFOR — Pagamento a Fornecedores ──────────────────────────── */}
        {isPagfor && <PagforTab />}

        {/* ── Boletos (Cobrança Bancária Sicoob) ─────────────────────────── */}
        {isBoletos && <BoletosTab />}

        {/* ── Visão cruzada por CNPJ (1.4) ───────────────────────────────── */}
        {isCnpjs && <CrossCompanyTab />}

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
