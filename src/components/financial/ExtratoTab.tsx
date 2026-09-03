'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  BankAccount, EffectiveExtratoResult, ExtratoMovement, getEffectiveExtrato,
} from '@/lib/actions/financial'
import { TrendingUp, TrendingDown, ChevronsUpDown, RefreshCcw, Calendar, Wallet, CheckCircle2, Link2, Circle } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${day}/${m}/${y}` }
const todayStr = () => new Date().toISOString().slice(0, 10)
const firstDayOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

const CONC: Record<ExtratoMovement['status'], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  reconciled: { label: 'Conciliado', cls: 'bg-sky-100 text-sky-700',       Icon: CheckCircle2 },
  linked:     { label: 'Vinculado',  cls: 'bg-emerald-100 text-emerald-700', Icon: Link2 },
  pending:    { label: 'Pendente',   cls: 'bg-slate-100 text-slate-500',    Icon: Circle },
}

interface Props { bankAccounts: BankAccount[] }

export default function ExtratoTab({ bankAccounts }: Props) {
  const [selectedBank, setSelectedBank] = useState<string>('')   // '' = todas as contas
  const [startDate, setStartDate] = useState(firstDayOfMonth())
  const [endDate, setEndDate]     = useState(todayStr())
  const [result, setResult]       = useState<EffectiveExtratoResult | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function load() {
    setErrorMsg(null)
    startTransition(async () => {
      const res = await getEffectiveExtrato({ start_date: startDate, end_date: endDate, bank_account_id: selectedBank || undefined })
      if ('error' in res) setErrorMsg(res.error); else setResult(res)
    })
  }
  useEffect(() => { load() }, [])   // carga inicial

  const cards = result ? [
    { label: 'Entradas (recebidas)', value: result.total_entradas, Icon: TrendingUp,      color: 'border-emerald-200 bg-emerald-50', iconClr: 'text-emerald-500', valClr: 'text-emerald-700' },
    { label: 'Saídas (pagas)',       value: result.total_saidas,   Icon: TrendingDown,    color: 'border-red-200 bg-red-50',         iconClr: 'text-red-500',     valClr: 'text-red-700' },
    { label: 'Saldo do período',     value: result.saldo,          Icon: ChevronsUpDown,  color: result.saldo >= 0 ? 'border-teal-200 bg-teal-50' : 'border-orange-200 bg-orange-50', iconClr: result.saldo >= 0 ? 'text-teal-500' : 'text-orange-500', valClr: result.saldo >= 0 ? 'text-teal-700' : 'text-orange-700' },
  ] : []

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:min-w-[160px] flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Conta (opcional)</label>
            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
              <option value="">Todas as contas</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}{b.bank_name ? ` — ${b.bank_name}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5"><Calendar className="inline h-3 w-3 mr-1" /> Início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <button onClick={load} disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50">
            <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} /> {isPending ? 'Carregando...' : 'Carregar'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Movimentações efetivas = títulos baixados (recebidos/pagos). O status de conciliação vem da rotina Conciliação.</p>
        {errorMsg && <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{errorMsg}</p>}
      </div>

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map(c => (
            <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
              <div className="flex items-center gap-2 mb-2"><c.Icon className={`h-4 w-4 ${c.iconClr}`} /><span className="text-xs font-semibold text-slate-600">{c.label}</span></div>
              <p className={`text-xl font-bold font-mono tabular-nums ${c.valClr}`}>{fmt(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {result.movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Wallet className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-400">Nenhuma movimentação baixada no período.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Data</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Descrição</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Tutor / Pet</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Tipo</th>
                    <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase">Valor</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Conciliação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.movements.map(m => {
                    const isIn = m.type === 'receivable'
                    const c = CONC[m.status]
                    return (
                      <tr key={m.id} className="border-b border-slate-100 hover:bg-teal-50/40 transition-colors">
                        <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap font-mono tabular-nums">{fmtDate(m.date)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 sm:max-w-[280px]">
                          <p className="truncate">{m.document_number ? `${m.document_number} · ` : ''}{m.description}</p>
                          {m.bank_name && <p className="text-xs text-slate-400">{m.bank_name}</p>}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">{m.tutor_name ?? m.patient_name ?? '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{isIn ? 'A receber' : 'A pagar'}</span>
                        </td>
                        <td className={`py-3 px-4 text-sm font-semibold text-right whitespace-nowrap font-mono tabular-nums ${isIn ? 'text-emerald-700' : 'text-red-700'}`}>{isIn ? '+' : '-'} {fmt(m.amount)}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.cls}`}><c.Icon className="h-3 w-3" /> {c.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 bg-slate-50">
                <p className="text-xs text-slate-400">{result.movements.length} movimentação(ões)</p>
                <p className="text-sm font-bold text-slate-700">Saldo: <span className="font-mono tabular-nums">{fmt(result.saldo)}</span></p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
