'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DollarSign, CheckCircle2, Archive, RefreshCw, Filter,
  TrendingUp, AlertCircle, Clock, BadgeCheck, RotateCcw, Minus, Plus,
  Receipt, Calendar, CreditCard, Smartphone, Banknote, Building2, Wallet,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import {
  listCashierEntries, verifyCashierEntry, archiveCashierEntry, receiveCashierEntry, getCashierSummary,
  type CentralCashierEntry, type CashierSummary,
} from '@/lib/actions/core-management'
import type { CashierSession } from '@/lib/actions/cashier-sessions'
import { DateInput } from '@/components/ui/DatePicker'
import CashierReversalModal from './CashierReversalModal'
import CashierOutflowModal from './CashierOutflowModal'
import CashierInflowModal from './CashierInflowModal'
import CashierEditDateModal from './CashierEditDateModal'

const MODULE_LABELS: Record<string, string> = {
  grooming:        'Banho e Tosa',
  pharmacy:        'Farmácia',
  consultation:    'Consulta',
  exam:            'Exame',
  manual:          'Manual',
  adjustment:      'Ajuste',
  sales:           'PDV',
  hospitalization: 'Internação',
  surgery:         'Cirurgia',
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendente',    cls: 'bg-sky-100 text-sky-700',         icon: <Clock        className="h-3 w-3" /> },
  recorded: { label: 'Registrado',  cls: 'bg-amber-100 text-amber-700',     icon: <Clock        className="h-3 w-3" /> },
  verified: { label: 'Verificado',  cls: 'bg-emerald-100 text-emerald-700', icon: <BadgeCheck   className="h-3 w-3" /> },
  archived: { label: 'Arquivado',   cls: 'bg-slate-100 text-slate-500',     icon: <Archive      className="h-3 w-3" /> },
  reversed: { label: 'Estornado',   cls: 'bg-red-100 text-red-600',         icon: <RotateCcw    className="h-3 w-3" /> },
}

const PAYMENT_METHOD_LABEL: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  pix:       { label: 'PIX',         icon: Smartphone  },
  credit:    { label: 'Crédito',     icon: CreditCard  },
  debit:     { label: 'Débito',      icon: CreditCard  },
  cash:      { label: 'Dinheiro',    icon: Banknote    },
  voucher:   { label: 'Vale',        icon: Wallet      },
  convenio:  { label: 'Convênio',    icon: Wallet      },
  transfer:  { label: 'Transf.',     icon: Building2   },
  courtesy:  { label: 'Cortesia',    icon: Receipt     },
  other:     { label: 'Outro',       icon: Receipt     },
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

function fmtEffectiveDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

interface Props {
  initialEntries: CentralCashierEntry[]
  summary:        CashierSummary | null
  userRole:       string
  sessionId?:     string
  /** Sessão aberta atual — usada para saldo inicial e período padrão dos filtros. */
  session?:       CashierSession | null
  today:          string
  /** Callback opcional para abrir a aba de Recebimentos (botão "Receber Pendentes"). */
  onOpenReceivables?: () => void
}

export default function CentralCashierWorkspace({
  initialEntries, summary: initialSummary, userRole, sessionId, session, today, onOpenReceivables,
}: Props) {
  // Período padrão: do dia da abertura do caixa até hoje
  const defaultFrom = session?.opened_at ? session.opened_at.slice(0, 10) : today

  const [entries,        setEntries]        = useState<CentralCashierEntry[]>(initialEntries)
  const [summary,        setSummary]        = useState<CashierSummary | null>(initialSummary)
  const [loading,        setLoading]        = useState(false)
  const [actionId,       setActionId]       = useState<string | null>(null)
  const [filterMod,      setFilterMod]      = useState<string>('all')
  const [filterStat,     setFilterStat]     = useState<string>('all')
  const [filterPay,      setFilterPay]      = useState<string>('all')
  const [filterFrom,     setFilterFrom]     = useState<string>(defaultFrom)
  const [filterTo,       setFilterTo]       = useState<string>(today)
  const [toast,          setToast]          = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [reversalEntry,  setReversalEntry]  = useState<CentralCashierEntry | null>(null)
  const [showOutflow,    setShowOutflow]    = useState(false)
  const [showInflow,     setShowInflow]     = useState(false)
  const [editingDate,    setEditingDate]    = useState<CentralCashierEntry | null>(null)
  const [receivingEntry, setReceivingEntry] = useState<CentralCashierEntry | null>(null)

  // Sincroniza com atualizações vindas do pai (ex.: baixa feita em Recebimentos)
  useEffect(() => { setEntries(initialEntries) }, [initialEntries])
  useEffect(() => { setSummary(initialSummary) }, [initialSummary])

  const isAccountant = ['admin', 'owner', 'accountant'].includes(userRole)
  const isAdmin      = ['admin', 'owner'].includes(userRole)
  const isManager    = ['admin', 'owner', 'manager', 'accountant'].includes(userRole)
  const canEditDate  = ['admin', 'owner', 'manager', 'accountant'].includes(userRole)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const refresh = useCallback(async (from = filterFrom, to = filterTo) => {
    setLoading(true)
    const [res, sum] = await Promise.all([
      listCashierEntries({ from_date: from, to_date: to }),
      getCashierSummary({ from_date: from, to_date: to }),
    ])
    setLoading(false)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(res)
    if (!('error' in sum)) setSummary(sum)
  }, [filterFrom, filterTo])

  // Mudança de período recarrega do servidor
  const handlePeriodChange = (from: string, to: string) => {
    setFilterFrom(from)
    setFilterTo(to)
    void refresh(from, to)
  }

  const handleVerify = async (id: string) => {
    setActionId(id)
    const res = await verifyCashierEntry(id)
    setActionId(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'verified' } : e))
    showToast('Entrada verificada.', 'success')
  }

  const handleReceive = async (id: string, paymentMethod: string) => {
    setActionId(id)
    const res = await receiveCashierEntry(id, paymentMethod)
    setActionId(null)
    setReceivingEntry(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'recorded', payment_method: paymentMethod } : e))
    showToast('Pagamento registrado.', 'success')
    void refresh()
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
    if (filterMod  !== 'all' && e.source_module        !== filterMod)  return false
    if (filterStat !== 'all' && e.status                !== filterStat) return false
    if (filterPay  !== 'all' && (e.payment_method ?? '') !== filterPay) return false
    return true
  })

  const totalDisplayed = displayed.reduce((s, e) => s + Number(e.amount), 0)
  const uniqueModules  = [...new Set(entries.map(e => e.source_module))]
  const pendingCount   = entries.filter(e => e.status === 'pending').length

  // Saldo do caixa no período: abertura + entradas efetivadas − saídas
  const openingBalance = Number(session?.opening_balance ?? 0)
  const finalBalance   = summary ? openingBalance + summary.inflows_received - summary.outflows_total : null
  const cashBalance    = summary ? openingBalance + summary.inflows_cash     - summary.outflows_total : null

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium animate-enter-fast ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
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
      {showInflow && (
        <CashierInflowModal
          onClose={() => setShowInflow(false)}
          onSuccess={refresh}
          onToast={showToast}
        />
      )}
      {editingDate && (
        <CashierEditDateModal
          entry={editingDate}
          onClose={() => setEditingDate(null)}
          onSuccess={refresh}
          onToast={showToast}
        />
      )}

      {/* Modal inline: receber pagamento de entrada pendente */}
      {receivingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4 animate-scale-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Registrar recebimento</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {receivingEntry.patient_name ?? receivingEntry.reason ?? 'Lançamento pendente'} —{' '}
                  <span className="font-semibold text-slate-700 font-mono tabular-nums">{fmt(Number(receivingEntry.amount))}</span>
                </p>
              </div>
              <button onClick={() => setReceivingEntry(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <Receipt className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Forma de pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {(['pix', 'cash', 'credit', 'debit', 'convenio', 'other'] as const).map(pm => {
                const cfg = PAYMENT_METHOD_LABEL[pm]
                const Icon = cfg?.icon ?? Receipt
                return (
                  <button
                    key={pm}
                    type="button"
                    disabled={actionId === receivingEntry.id}
                    onClick={() => handleReceive(receivingEntry.id, pm)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-sm font-medium text-slate-700 hover:text-emerald-800 transition-colors disabled:opacity-50"
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {cfg?.label ?? pm}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setReceivingEntry(null)}
              className="w-full py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Caixa Central</h1>
          <p className="text-sm text-slate-500 mt-0.5">Consolidado de todas as receitas da clínica</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && onOpenReceivables && (
            <button
              onClick={onOpenReceivables}
              data-mentor-step="cashier-receber-pendentes"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm"
            >
              <Receipt className="h-4 w-4" />
              Receber Pendentes
              <span className="rounded-full bg-white/30 text-white text-[10px] font-bold font-mono tabular-nums px-1.5 py-0.5 leading-none">
                {pendingCount}
              </span>
            </button>
          )}
          {isManager && (
            <>
              <button
                onClick={() => setShowInflow(true)}
                data-mentor-step="cashier-lancar-entrada"
                title="Entrada manual de dinheiro no caixa: reforço de troco (suprimento), aporte, acerto."
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Lançar Entrada
              </button>
              <button
                onClick={() => setShowOutflow(true)}
                data-mentor-step="cashier-registrar-saida"
                title="Saída de dinheiro do caixa: retirada (sangria), despesa, pagamento a fornecedor."
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Minus className="h-4 w-4" />
                Registrar Saída
              </button>
            </>
          )}
          <button
            id="btn-refresh-cashier"
            data-testid="btn-refresh-cashier"
            onClick={() => refresh()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
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
          data-mentor-step="cashier-kpis"
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <div className="bg-white rounded-xl border border-sky-200 p-5 shadow-sm" title="O que os tutores ainda vão pagar no balcão. Repasses futuros de convênio (Petlove) NÃO entram aqui — eles ficam em Contas a Receber no Financeiro.">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                <Clock className="h-4 w-4 text-sky-600" />
              </div>
              <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">A Receber</p>
            </div>
            <p data-testid="kpi-total-pending" className="text-2xl font-bold text-sky-700 font-mono tabular-nums">{fmt(summary.total_pending ?? 0)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">do tutor · sem repasse de convênio</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm" title="Tudo que movimentou o caixa no período: entradas recebidas (inclui as já verificadas) menos saídas e sangrias.">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Registrado</p>
            </div>
            <p data-testid="kpi-total-recorded" className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{fmt(summary.total_recorded)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
              <span className="text-emerald-600">+{fmt(summary.inflows_received)}</span>
              {' '}<span className="text-red-500">−{fmt(summary.outflows_total)}</span>
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm" title="Movimentações (entradas e saídas) que o administrador/contador já conferiu uma a uma.">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Verificado</p>
            </div>
            <p data-testid="kpi-total-verified" className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">{fmt(summary.total_verified)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">entradas e saídas conferidas pelo admin</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm" title="Quantidade total de movimentações no caixa no período: recebimentos, lançamentos manuais, saídas e sangrias.">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <DollarSign className="h-4 w-4 text-slate-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lançamentos</p>
            </div>
            <p data-testid="kpi-entry-count" className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{summary.entry_count}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">movimentações no período</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div
        data-mentor-step="cashier-filters"
        className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap"
      >
        <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />

        <select
          id="filter-module"
          data-testid="filter-module"
          value={filterMod}
          onChange={e => setFilterMod(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
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
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="all">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="recorded">Registrado</option>
          <option value="verified">Verificado</option>
          <option value="archived">Arquivado</option>
          <option value="reversed">Estornado</option>
        </select>

        <select
          id="filter-payment"
          data-testid="filter-payment"
          value={filterPay}
          onChange={e => setFilterPay(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="all">Todas as modalidades</option>
          <option value="cash">Dinheiro</option>
          <option value="pix">PIX</option>
          <option value="credit">Crédito</option>
          <option value="debit">Débito</option>
          <option value="convenio">Convênio</option>
          <option value="transfer">Transferência</option>
          <option value="courtesy">Cortesia</option>
          <option value="other">Outro</option>
        </select>

        <div className="flex items-center gap-1.5">
          <DateInput
            value={filterFrom}
            onChange={v => handlePeriodChange(v, filterTo)}
            className="w-32"
          />
          <span className="text-xs text-slate-400">até</span>
          <DateInput
            value={filterTo}
            onChange={v => handlePeriodChange(filterFrom, v)}
            className="w-32"
          />
        </div>

        <span className="text-xs text-slate-500 ml-auto font-mono tabular-nums">
          {displayed.length} lançamento(s) · {fmt(totalDisplayed)}
        </span>
      </div>

      {/* Table */}
      <div
        id="cashier-entries-table"
        data-testid="cashier-entries-table"
        data-filtermod={filterMod}
        data-mentor-step="cashier-table"
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        {/* Saldo inicial do dia da abertura do caixa */}
        <div
          data-testid="cashier-opening-balance"
          data-mentor-step="cashier-saldo-inicial"
          className={`flex items-center justify-between px-4 py-2.5 border-b text-sm ${
            session ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50 border-slate-100'
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-slate-700">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Saldo inicial (fundo de troco)
            {session ? (
              <span className="text-xs text-slate-400 font-normal font-mono tabular-nums">
                · caixa aberto em {fmtDate(session.opened_at)}
              </span>
            ) : (
              <span className="text-xs text-amber-600 font-normal">· caixa fechado — abra o caixa na aba Sessão</span>
            )}
          </span>
          <span className="font-bold text-slate-900 font-mono tabular-nums">{fmt(openingBalance)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Módulo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pet / Tutor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Forma Pgto</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-sm text-slate-400">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : (
                displayed.map(entry => {
                  const sc      = STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.recorded
                  const pm      = PAYMENT_METHOD_LABEL[entry.payment_method ?? '']
                  const PmIcon  = pm?.icon ?? Receipt
                  const effDate = entry.effective_date
                  return (
                    <tr
                      key={entry.id}
                      data-testid={`cashier-row-${entry.id}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap font-mono tabular-nums">
                        {effDate && effDate !== entry.created_at.slice(0,10) ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-amber-700 flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {fmtEffectiveDate(effDate)}
                            </span>
                            <span className="text-[10px] text-slate-400">lanç. {fmtDate(entry.created_at)}</span>
                          </div>
                        ) : (
                          fmtDate(entry.created_at)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-xs font-medium">
                          {MODULE_LABELS[entry.source_module] ?? entry.source_module}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {entry.patient_name || entry.tutor_name ? (
                          <div className="flex flex-col">
                            {entry.patient_name && <span className="font-semibold">{entry.patient_name}</span>}
                            {entry.tutor_name && <span className="text-slate-500">{entry.tutor_name}</span>}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate text-xs">
                        {entry.reason ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {pm ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                            <PmIcon className="h-3 w-3" />
                            {pm.label}
                            {entry.card_installments && entry.card_installments > 1 && (
                              <span className="text-[10px] text-slate-500 font-mono tabular-nums">{entry.card_installments}x</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 font-mono tabular-nums text-sm">
                        {fmt(Number(entry.amount))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>
                          {sc.icon}{sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {entry.status === 'pending' && (
                            <button
                              data-testid={`btn-receive-${entry.id}`}
                              onClick={() => setReceivingEntry(entry)}
                              disabled={actionId === entry.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              title="Registrar recebimento"
                            >
                              {actionId === entry.id
                                ? <Spinner size="sm" />
                                : <DollarSign className="h-3 w-3" />}
                            </button>
                          )}
                          {canEditDate && entry.status !== 'archived' && entry.status !== 'reversed' && (
                            <button
                              data-testid={`btn-edit-date-${entry.id}`}
                              onClick={() => setEditingDate(entry)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
                              title="Editar data retroativa"
                            >
                              <Calendar className="h-3 w-3" />
                            </button>
                          )}
                          {isAccountant && entry.status === 'recorded' && (
                            <button
                              data-testid={`btn-verify-${entry.id}`}
                              onClick={() => handleVerify(entry.id)}
                              disabled={actionId === entry.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              title="Verificar"
                            >
                              {actionId === entry.id
                                ? <Spinner size="sm" />
                                : <BadgeCheck className="h-3 w-3" />}
                            </button>
                          )}
                          {isAccountant && entry.status !== 'archived' && isAdmin && (
                            <button
                              data-testid={`btn-archive-${entry.id}`}
                              onClick={() => handleArchive(entry.id)}
                              disabled={actionId === entry.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                              title="Arquivar"
                            >
                              <Archive className="h-3 w-3" />
                            </button>
                          )}
                          {isManager && entry.status !== 'archived' && entry.status !== 'reversed' && (
                            <button
                              data-testid={`btn-reverse-${entry.id}`}
                              onClick={() => setReversalEntry(entry)}
                              disabled={actionId === entry.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                              title="Estornar"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Saldo final do período — fecha a conta do caixa físico */}
        {summary && (
          <div
            data-testid="cashier-final-balance"
            data-mentor-step="cashier-saldo-final"
            className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 space-y-1.5 text-sm"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span>Saldo inicial (abertura)</span>
              <span className="font-mono tabular-nums">{fmt(openingBalance)}</span>
            </div>
            <div className="flex items-center justify-between text-emerald-700">
              <span>+ Entradas recebidas no período</span>
              <span className="font-mono tabular-nums">+{fmt(summary.inflows_received)}</span>
            </div>
            <div className="flex items-center justify-between text-red-600">
              <span>− Saídas e sangrias no período</span>
              <span className="font-mono tabular-nums">−{fmt(summary.outflows_total)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
              <span>= Saldo final do caixa</span>
              <span className="font-mono tabular-nums text-base">{finalBalance != null ? fmt(finalBalance) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                Em espécie (deve bater com o dinheiro físico na gaveta)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-700">{cashBalance != null ? fmt(cashBalance) : '—'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
