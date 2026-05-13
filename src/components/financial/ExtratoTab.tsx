'use client'

import { useState, useTransition } from 'react'
import {
  BankAccount, ExtratoResult, BankStatement,
  getExtrato,
} from '@/lib/actions/financial'
import {
  TrendingUp, TrendingDown, Wallet, RefreshCcw,
  ChevronsUpDown, Calendar,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ─── Cards de resumo ─────────────────────────────────────────────────────────

function ResumoCards({ result }: { result: ExtratoResult }) {
  const cards = [
    {
      label:   'Saldo Inicial',
      value:   result.saldo_inicial,
      icon:    Wallet,
      color:   'border-slate-200 bg-slate-50',
      iconClr: 'text-slate-500',
      valClr:  'text-slate-700',
    },
    {
      label:   'Total Entradas',
      value:   result.total_entradas,
      icon:    TrendingUp,
      color:   'border-emerald-200 bg-emerald-50',
      iconClr: 'text-emerald-500',
      valClr:  'text-emerald-700',
    },
    {
      label:   'Total Saídas',
      value:   result.total_saidas,
      icon:    TrendingDown,
      color:   'border-red-200 bg-red-50',
      iconClr: 'text-red-500',
      valClr:  'text-red-700',
    },
    {
      label:   'Saldo Final',
      value:   result.saldo_final,
      icon:    ChevronsUpDown,
      color:   result.saldo_final >= 0 ? 'border-teal-200 bg-teal-50' : 'border-orange-200 bg-orange-50',
      iconClr: result.saldo_final >= 0 ? 'text-teal-500' : 'text-orange-500',
      valClr:  result.saldo_final >= 0 ? 'text-teal-700' : 'text-orange-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`h-4 w-4 ${card.iconClr}`} />
            <span className="text-xs font-semibold text-slate-600">{card.label}</span>
          </div>
          <p className={`text-xl font-bold ${card.valClr}`}>{fmt(card.value)}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Linha de lançamento ─────────────────────────────────────────────────────

function LancamentoRow({
  stmt,
  runningBalance,
}: {
  stmt:           BankStatement
  runningBalance: number
}) {
  const isCredit = stmt.type === 'credit'
  return (
    <tr className="border-b border-slate-100 hover:bg-teal-50/40 transition-colors">
      <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(stmt.date)}</td>
      <td className="py-3 px-4 text-sm text-slate-700 max-w-[300px]">
        <p className="truncate">{stmt.description}</p>
        {stmt.external_id && (
          <p className="text-xs text-slate-400">{stmt.external_id}</p>
        )}
      </td>
      <td className={`py-3 px-4 text-sm font-semibold text-right whitespace-nowrap ${isCredit ? 'text-emerald-700' : 'text-red-700'}`}>
        {isCredit ? '+' : '-'} {fmt(stmt.amount)}
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
          isCredit
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {isCredit ? 'Crédito' : 'Débito'}
        </span>
      </td>
      <td className={`py-3 px-4 text-sm font-bold text-right whitespace-nowrap ${runningBalance >= 0 ? 'text-slate-700' : 'text-orange-700'}`}>
        {fmt(runningBalance)}
      </td>
      <td className="py-3 px-4">
        {stmt.reconciled_entry_id ? (
          <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">Conciliado</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Pendente</span>
        )}
      </td>
    </tr>
  )
}

// ─── ExtratoTab ──────────────────────────────────────────────────────────────

interface Props {
  bankAccounts: BankAccount[]
}

export default function ExtratoTab({ bankAccounts }: Props) {
  const defaultAccount = bankAccounts.find(b => b.is_default) ?? bankAccounts[0]

  const [selectedBank, setSelectedBank] = useState<string>(defaultAccount?.id ?? '')
  const [startDate,    setStartDate]    = useState(firstDayOfMonth())
  const [endDate,      setEndDate]      = useState(todayStr())
  const [result,       setResult]       = useState<ExtratoResult | null>(null)
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  function load() {
    if (!selectedBank) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await getExtrato({ bank_account_id: selectedBank, start_date: startDate, end_date: endDate })
      if ('error' in res) {
        setErrorMsg(res.error)
      } else {
        setResult(res)
      }
    })
  }

  // Calcula saldo parcial acumulado
  function buildRunningBalances(statements: BankStatement[], saldoInicial: number): number[] {
    let acc = saldoInicial
    return statements.map(s => {
      acc += s.type === 'credit' ? s.amount : -s.amount
      return acc
    })
  }

  const runningBalances = result
    ? buildRunningBalances(result.statements, result.saldo_inicial)
    : []

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Conta Bancária</label>
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">Selecione uma conta</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.bank_name ? ` — ${b.bank_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              <Calendar className="inline h-3 w-3 mr-1" />
              Data Início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Data Fim</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <button
            onClick={load}
            disabled={isPending || !selectedBank}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Carregando...' : 'Carregar Extrato'}
          </button>
        </div>

        {errorMsg && (
          <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{errorMsg}</p>
        )}
      </div>

      {/* Cards de resumo */}
      {result && <ResumoCards result={result} />}

      {/* Tabela de lançamentos */}
      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {result.statements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Wallet className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-400">
                Nenhum lançamento encontrado para o período selecionado.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Importe lançamentos via aba Conciliação.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Data</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Descrição</th>
                    <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase">Valor</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Tipo</th>
                    <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Saldo Parcial</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Conciliação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.statements.map((stmt, i) => (
                    <LancamentoRow
                      key={stmt.id}
                      stmt={stmt}
                      runningBalance={runningBalances[i]}
                    />
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 bg-slate-50">
                <p className="text-xs text-slate-400">
                  {result.statements.length} {result.statements.length === 1 ? 'lançamento' : 'lançamentos'}
                </p>
                <p className="text-sm font-bold text-slate-700">
                  Saldo Final: {fmt(result.saldo_final)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
