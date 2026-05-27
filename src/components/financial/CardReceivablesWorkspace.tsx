'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  CreditCard, Filter, RefreshCw, CheckCircle2, AlertCircle, Loader2, X, Check,
  Calendar, TrendingUp, Clock, Receipt, FileText, Ban,
} from 'lucide-react'
import {
  listCardInstallments,
  settleCardInstallment,
  settleCardInstallmentsBatch,
  cancelCardInstallment,
  type CardInstallment,
  type CardInstallmentsSummary,
} from '@/lib/actions/card-receivables'
import type { PaymentCard } from '@/lib/actions/payment-cards'

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Pendente',    cls: 'bg-amber-100 text-amber-700'  },
  settled:    { label: 'Liquidado',   cls: 'bg-emerald-100 text-emerald-700' },
  reconciled: { label: 'Conciliado',  cls: 'bg-blue-100 text-blue-700'   },
  cancelled:  { label: 'Cancelado',   cls: 'bg-red-100 text-red-600'     },
}

const METHOD_LABEL: Record<string, string> = {
  credit:  'Crédito',
  debit:   'Débito',
  voucher: 'Vale',
}

function fmt(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

interface Props {
  initialInstallments: CardInstallment[]
  initialSummary:      CardInstallmentsSummary | null
  cards:               PaymentCard[]
  userRole:            string
}

export default function CardReceivablesWorkspace({
  initialInstallments, initialSummary, cards, userRole,
}: Props) {
  const [installments, setInstallments] = useState<CardInstallment[]>(initialInstallments)
  const [summary,      setSummary]      = useState<CardInstallmentsSummary | null>(initialSummary)
  const [statusFilter, setStatusFilter] = useState<'pending'|'settled'|'reconciled'|'cancelled'|'all'>('pending')
  const [cardFilter,   setCardFilter]   = useState<string>('all')
  const [methodFilter, setMethodFilter] = useState<'all'|'credit'|'debit'|'voucher'>('all')
  const [fromDate,     setFromDate]     = useState<string>('')
  const [toDate,       setToDate]       = useState<string>('')
  const [loading,      setLoading]      = useState(false)
  const [actionId,     setActionId]     = useState<string | null>(null)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [toast,        setToast]        = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [settleModal,  setSettleModal]  = useState<CardInstallment | null>(null)
  const [batchModal,   setBatchModal]   = useState(false)

  const canSettle = ['admin', 'owner', 'manager', 'accountant'].includes(userRole)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await listCardInstallments({
      status:    statusFilter === 'all' ? undefined : statusFilter,
      card_id:   cardFilter === 'all' ? undefined : cardFilter,
      method:    methodFilter === 'all' ? undefined : methodFilter,
      from_date: fromDate || undefined,
      to_date:   toDate || undefined,
    })
    setLoading(false)
    if (Array.isArray(res)) {
      setInstallments(res)
      setSelected(new Set())
    } else {
      showToast(res.error, 'error')
    }
  }, [statusFilter, cardFilter, methodFilter, fromDate, toDate])

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllPending() {
    const pendingIds = installments.filter(i => i.status === 'pending').map(i => i.id)
    const allSelected = pendingIds.every(id => selected.has(id))
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pendingIds))
    }
  }

  async function handleSettleOne(input: {
    installment_id: string
    settled_amount?: number
    bank_statement_ref?: string
    actual_fee?: number
    settled_date?: string
  }) {
    setActionId(input.installment_id)
    const res = await settleCardInstallment(input)
    setActionId(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    showToast('Parcela liquidada com sucesso.', 'success')
    setSettleModal(null)
    await refresh()
  }

  async function handleSettleBatch(opts: { settled_date?: string; bank_statement_ref?: string }) {
    const ids = [...selected]
    if (ids.length === 0) { showToast('Selecione ao menos uma parcela.', 'error'); return }
    setLoading(true)
    const res = await settleCardInstallmentsBatch(ids, opts)
    setLoading(false)
    setBatchModal(false)
    if (res.failed > 0) {
      showToast(`${res.settled} liquidadas · ${res.failed} falharam`, 'error')
    } else {
      showToast(`${res.settled} parcelas liquidadas em lote.`, 'success')
    }
    await refresh()
  }

  async function handleCancel(inst: CardInstallment) {
    const reason = prompt(`Cancelar parcela ${inst.installment_number}/${inst.total_installments} de ${fmt(inst.gross_amount)}? Motivo:`)
    if (!reason) return
    setActionId(inst.id)
    const res = await cancelCardInstallment(inst.id, reason)
    setActionId(null)
    if ('error' in res) { showToast(res.error, 'error'); return }
    showToast('Parcela cancelada.', 'success')
    await refresh()
  }

  const filtered = useMemo(() => {
    return installments.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (cardFilter   !== 'all' && i.payment_card_id !== cardFilter) return false
      if (methodFilter !== 'all' && i.payment_method !== methodFilter) return false
      if (fromDate && i.expected_settlement_date < fromDate) return false
      if (toDate && i.expected_settlement_date > toDate) return false
      return true
    })
  }, [installments, statusFilter, cardFilter, methodFilter, fromDate, toDate])

  const filteredTotalGross = filtered.reduce((s, i) => s + Number(i.gross_amount), 0)
  const filteredTotalNet   = filtered.reduce((s, i) => s + Number(i.net_amount), 0)
  const filteredTotalFee   = filtered.reduce((s, i) => s + Number(i.fee_amount), 0)

  const selectedRows = filtered.filter(i => selected.has(i.id))
  const selectedTotal = selectedRows.reduce((s, i) => s + Number(i.gross_amount), 0)

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">

      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-indigo-600" />
            Cartões
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manutenção, liquidação e conciliação das parcelas de cartão
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canSettle && selected.size > 0 && (
            <button
              onClick={() => setBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm"
            >
              <Check className="h-4 w-4" />
              Liquidar {selected.size} em lote · {fmt(selectedTotal)}
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-amber-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">A Receber</p>
            </div>
            <p className="text-2xl font-bold text-amber-700 tabular-nums">{fmt(summary.total_pending_gross)}</p>
            <p className="text-xs text-slate-500 mt-1">{summary.count_pending} parcela(s) · líquido {fmt(summary.total_pending_net)}</p>
          </div>

          <div className="bg-white rounded-xl border border-emerald-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Liquidado</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmt(summary.total_settled_gross)}</p>
            <p className="text-xs text-slate-500 mt-1">{summary.count_settled} parcela(s) · líquido {fmt(summary.total_settled_net)}</p>
          </div>

          <div className="bg-white rounded-xl border border-rose-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
                <Receipt className="h-4 w-4 text-rose-600" />
              </div>
              <p className="text-xs font-medium text-rose-600 uppercase tracking-wide">Taxas Totais</p>
            </div>
            <p className="text-2xl font-bold text-rose-700 tabular-nums">{fmt(summary.total_fees)}</p>
            <p className="text-xs text-slate-500 mt-1">desconto da operadora acumulado</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Calendar className="h-4 w-4 text-slate-600" />
              </div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Por Operadora</p>
            </div>
            <div className="space-y-1">
              {summary.by_acquirer.slice(0, 3).map(a => (
                <div key={a.acquirer} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 truncate">{a.acquirer}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{fmt(a.gross)}</span>
                </div>
              ))}
              {summary.by_acquirer.length === 0 && (
                <p className="text-xs text-slate-400">—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="pending">Pendentes</option>
          <option value="settled">Liquidadas</option>
          <option value="reconciled">Conciliadas</option>
          <option value="cancelled">Canceladas</option>
          <option value="all">Todos</option>
        </select>

        <select
          value={cardFilter}
          onChange={e => setCardFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="all">Todos os cartões</option>
          {cards.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <select
          value={methodFilter}
          onChange={e => setMethodFilter(e.target.value as typeof methodFilter)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="all">Todos os tipos</option>
          <option value="credit">Crédito</option>
          <option value="debit">Débito</option>
          <option value="voucher">Vale</option>
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          placeholder="De"
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          placeholder="Até"
        />

        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Aplicar
        </button>

        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} parcela(s) · Bruto {fmt(filteredTotalGross)} · Líquido {fmt(filteredTotalNet)} · Taxa {fmt(filteredTotalFee)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-3 text-left">
                  {statusFilter === 'pending' && filtered.length > 0 && canSettle && (
                    <input
                      type="checkbox"
                      checked={filtered.filter(i => i.status === 'pending').every(i => selected.has(i.id)) && filtered.some(i => i.status === 'pending')}
                      onChange={toggleSelectAllPending}
                      className="rounded"
                    />
                  )}
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Previsão</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cartão</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pet / Tutor</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Parcela</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">NSU</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bruto</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxa</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Líquido</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-14 text-sm text-slate-400">
                    Nenhuma parcela de cartão encontrada com esses filtros
                  </td>
                </tr>
              ) : (
                filtered.map(i => {
                  const sc = STATUS_CONFIG[i.status] ?? STATUS_CONFIG.pending
                  const isPending = i.status === 'pending'
                  return (
                    <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3">
                        {isPending && canSettle && (
                          <input
                            type="checkbox"
                            checked={selected.has(i.id)}
                            onChange={() => toggleSelected(i.id)}
                            className="rounded"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{fmtDate(i.expected_settlement_date)}</span>
                          {i.settled_at && (
                            <span className="text-[10px] text-emerald-600">liq. {new Date(i.settled_at).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">{i.card_label ?? i.card_acquirer ?? '—'}</span>
                          {i.card_brand && <span className="text-[10px] text-slate-500">{i.card_brand}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
                          {METHOD_LABEL[i.payment_method] ?? i.payment_method}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        {(i.patient_name || i.tutor_name) ? (
                          <div className="flex flex-col">
                            {i.patient_name && <span className="font-semibold">{i.patient_name}</span>}
                            {i.tutor_name && <span className="text-slate-500">{i.tutor_name}</span>}
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        {i.installment_number}/{i.total_installments}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono text-slate-600">
                        {i.card_nsu ?? '—'}
                        {i.card_authorization && <div className="text-[10px] text-slate-400">Lib {i.card_authorization}</div>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900 tabular-nums text-xs">{fmt(i.gross_amount)}</td>
                      <td className="px-3 py-3 text-right text-rose-600 tabular-nums text-xs">
                        -{fmt(i.fee_amount)}
                        <div className="text-[9px] text-slate-400">{i.fee_percent}%</div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700 tabular-nums text-xs">{fmt(i.net_amount)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canSettle && isPending && (
                            <>
                              <button
                                onClick={() => setSettleModal(i)}
                                disabled={actionId === i.id}
                                className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1"
                                title="Liquidar"
                              >
                                {actionId === i.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Liquidar
                              </button>
                              <button
                                onClick={() => handleCancel(i)}
                                disabled={actionId === i.id}
                                className="rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                title="Cancelar"
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            </>
                          )}
                          {!isPending && i.bank_statement_ref && (
                            <span className="text-[10px] text-slate-400 font-mono" title={`Extrato: ${i.bank_statement_ref}`}>
                              <FileText className="h-3 w-3 inline" /> {i.bank_statement_ref.slice(0, 8)}
                            </span>
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
      </div>

      {settleModal && (
        <SettleSingleModal
          installment={settleModal}
          onCancel={() => setSettleModal(null)}
          onConfirm={handleSettleOne}
        />
      )}

      {batchModal && (
        <SettleBatchModal
          count={selected.size}
          total={selectedTotal}
          onCancel={() => setBatchModal(false)}
          onConfirm={handleSettleBatch}
        />
      )}
    </div>
  )
}

// ─── SettleSingleModal ──────────────────────────────────────────────────────

function SettleSingleModal({ installment, onCancel, onConfirm }: {
  installment: CardInstallment
  onCancel: () => void
  onConfirm: (input: {
    installment_id: string
    settled_amount?: number
    bank_statement_ref?: string
    actual_fee?: number
    settled_date?: string
  }) => Promise<void>
}) {
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [settledAmount, setSettledAmount] = useState(installment.net_amount.toFixed(2).replace('.', ','))
  const [actualFee,    setActualFee]    = useState(installment.fee_amount.toFixed(2).replace('.', ','))
  const [bankRef,      setBankRef]      = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onConfirm({
      installment_id:      installment.id,
      settled_amount:      parseFloat(settledAmount.replace(',', '.')) || installment.net_amount,
      actual_fee:          parseFloat(actualFee.replace(',', '.')) || installment.fee_amount,
      bank_statement_ref:  bankRef.trim() || undefined,
      settled_date:        date,
    })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Liquidar parcela</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {METHOD_LABEL[installment.payment_method]} · Parcela {installment.installment_number}/{installment.total_installments}
              {installment.card_acquirer && ` · ${installment.card_acquirer}`}
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-slate-500">Bruto</p>
            <p className="font-bold text-slate-900 tabular-nums">{fmt(installment.gross_amount)}</p>
          </div>
          <div>
            <p className="text-slate-500">Taxa</p>
            <p className="font-bold text-rose-700 tabular-nums">-{fmt(installment.fee_amount)}</p>
          </div>
          <div>
            <p className="text-slate-500">Líquido</p>
            <p className="font-bold text-emerald-700 tabular-nums">{fmt(installment.net_amount)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data efetiva</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Extrato (opcional)</label>
              <input
                value={bankRef}
                onChange={e => setBankRef(e.target.value)}
                placeholder="Nº lote/extrato"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Valor recebido (R$)</label>
              <input
                value={settledAmount}
                onChange={e => setSettledAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Taxa efetiva (R$)</label>
              <input
                value={actualFee}
                onChange={e => setActualFee(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Liquidar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── SettleBatchModal ───────────────────────────────────────────────────────

function SettleBatchModal({ count, total, onCancel, onConfirm }: {
  count: number
  total: number
  onCancel: () => void
  onConfirm: (opts: { settled_date?: string; bank_statement_ref?: string }) => Promise<void>
}) {
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10))
  const [bankRef, setBankRef] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onConfirm({ settled_date: date, bank_statement_ref: bankRef.trim() || undefined })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Liquidar em lote</h2>
            <p className="text-xs text-slate-500 mt-0.5">{count} parcelas · {fmt(total)}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Data efetiva</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Referência do extrato (opcional)</label>
            <input
              value={bankRef}
              onChange={e => setBankRef(e.target.value)}
              placeholder="Ex: Lote Cielo 2026-05-27"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <p className="text-[11px] text-slate-500">
            Cada parcela será liquidada usando seu valor líquido calculado. Use a tela
            individual de liquidação para ajustar valores divergentes do extrato.
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Liquidar {count}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
