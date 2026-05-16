'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Percent, Search, User, Clock, CheckCircle2,
} from 'lucide-react'
import { getCommissionsReport, type CommissionReport } from '@/lib/actions/commissions'

type StatusFilter = 'all' | 'pending' | 'paid'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all:     'Todas',
  pending: 'Pendentes',
  paid:    'Pagas',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  paid:    'text-emerald-700 bg-emerald-50 border-emerald-200',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CommissionsReport() {
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all')
  const [loading,        setLoading]        = useState(true)
  const [data,           setData]           = useState<CommissionReport[]>([])
  const [error,          setError]          = useState<string | null>(null)
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())

  const fetchData = useCallback(async (from?: string, to?: string) => {
    setLoading(true)
    setError(null)
    const res = await getCommissionsReport({
      from: from || undefined,
      to:   to   || undefined,
    })
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    setData(res)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleExpanded(pid: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  // ── Client-side status filter ────────────────────────────────────────────────

  const filteredData = data.map(prof => {
    const entries = statusFilter === 'all'
      ? prof.entries
      : prof.entries.filter(e =>
          statusFilter === 'paid' ? e.status !== 'pending' : e.status === 'pending'
        )
    const total   = entries.reduce((s, e) => s + e.amount, 0)
    const pending = entries.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0)
    return { ...prof, entries, total_amount: total, pending_amount: pending, entry_count: entries.length }
  }).filter(prof => prof.entries.length > 0)

  const grandTotal   = filteredData.reduce((s, p) => s + p.total_amount,   0)
  const grandPending = filteredData.reduce((s, p) => s + p.pending_amount,  0)
  const grandPaid    = grandTotal - grandPending

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Filtros ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">

        {/* Status */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {(['all', 'pending', 'paid'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Data Início */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 bg-white outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>

        {/* Data Fim */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 bg-white outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>

        <button
          onClick={() => fetchData(dateFrom, dateTo)}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Filtrar
        </button>
      </div>

      {/* ── Totalizadores ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total</p>
            <p className="text-lg font-bold text-slate-800">{fmt(grandTotal)}</p>
            <p className="text-[10px] text-slate-400">{filteredData.length} profissional(is)</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock className="h-3 w-3 text-amber-500" />
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">A Pagar</p>
            </div>
            <p className="text-lg font-bold text-amber-700">{fmt(grandPending)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Pago</p>
            </div>
            <p className="text-lg font-bold text-emerald-700">{fmt(grandPaid)}</p>
          </div>
        </div>
      )}

      {/* ── Estado de carregamento / erro / vazio ─────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && filteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Percent className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">Nenhum lançamento de comissão encontrado</p>
          <p className="text-xs text-slate-400 mt-1">Ajuste os filtros ou registre vendas com profissionais que possuem regras de comissão.</p>
        </div>
      )}

      {/* ── Lista por profissional ─────────────────────────────────────────────── */}
      {!loading && !error && filteredData.length > 0 && (
        <div className="space-y-3">
          {filteredData.map(prof => {
            const isOpen = expanded.has(prof.professional_id)
            return (
              <div key={prof.professional_id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">

                {/* ── Cabeçalho do profissional ─────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(prof.professional_id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100">
                      <User className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{prof.professional_name}</p>
                      <p className="text-xs text-slate-400">{prof.entry_count} lançamento(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{fmt(prof.total_amount)}</p>
                      {prof.pending_amount > 0 && (
                        <p className="text-xs text-amber-600 font-medium">{fmt(prof.pending_amount)} pendente</p>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronUp className="h-4 w-4 text-slate-400" />
                      : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>

                {/* ── Entradas expandidas ───────────────────────────────────── */}
                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {prof.entries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between px-5 py-3 gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-700 leading-snug line-clamp-2">{entry.description}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(entry.due_date)}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                            STATUS_COLORS[entry.status] ?? 'text-slate-600 bg-slate-50 border-slate-200'
                          }`}>
                            {entry.status === 'pending' ? 'Pendente' : 'Pago'}
                          </span>
                          <span className="text-sm font-semibold text-slate-800">{fmt(entry.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
