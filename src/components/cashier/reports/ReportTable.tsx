'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { CashierReportRow } from '@/lib/actions/cashier-reports'

const MODULE_LABELS: Record<string, string> = {
  grooming:                'Banho e Tosa',
  pharmacy:                'Farmácia',
  consultation:            'Consulta',
  exam:                    'Exame',
  manual:                  'Manual',
  adjustment:              'Ajuste',
  sales:                   'PDV',
  'outflow:sangria':             'Sangria',
  'outflow:despesa_operacional': 'Despesa Operacional',
  'outflow:fornecedor':          'Pagto Fornecedor',
  'outflow:estorno':             'Estorno',
  'outflow:troco':               'Troco',
  'outflow:other':               'Saída — Outro',
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  cash: 'Dinheiro', convenio: 'Convênio', transfer: 'Transferência', courtesy: 'Cortesia', other: 'Outro',
  nao_informado: '—',
}

const STATUS_LABELS: Record<string, string> = {
  recorded: 'Registrado', pending: 'Pendente', verified: 'Verificado',
  reversed: 'Estornado', archived: 'Arquivado',
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

type SortKey = 'occurred_at' | 'source_module' | 'pet_tutor' | 'payment_method' | 'amount'
type SortDir = 'asc' | 'desc'

function sortValue(r: CashierReportRow, key: SortKey): string | number {
  switch (key) {
    case 'occurred_at':    return r.occurred_at
    case 'source_module':  return MODULE_LABELS[r.source_module] ?? r.source_module
    case 'pet_tutor':      return (r.patient_name ?? r.tutor_name ?? r.supplier_name ?? r.description ?? '').toLowerCase()
    case 'payment_method': return PAYMENT_LABELS[r.payment_method ?? 'nao_informado'] ?? ''
    case 'amount':         return Number(r.amount) * (r.entry_type === 'outflow' ? -1 : 1)
  }
}

interface Props {
  rows: CashierReportRow[]
}

export default function ReportTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('occurred_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [rows, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'occurred_at' ? 'desc' : 'asc') }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
        Nenhum lançamento encontrado para os filtros aplicados.
      </div>
    )
  }

  const SortTh = ({ label, k, align = 'left' }: { label: string; k?: SortKey; align?: 'left' | 'right' }) => (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 transition-colors ${
            sortKey === k ? 'text-teal-700' : ''
          }`}
          title={`Ordenar por ${label.toLowerCase()}`}
        >
          {label}
          {sortKey === k
            ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
            : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      ) : label}
    </th>
  )

  return (
    <div data-mentor-step="cashier-reports-table" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <SortTh label="Tipo" />
              <SortTh label="Data e Hora" k="occurred_at" />
              <SortTh label="Módulo" k="source_module" />
              <SortTh label="Pet/Tutor" k="pet_tutor" />
              <SortTh label="Descrição" />
              <SortTh label="Forma Pgto" k="payment_method" />
              <SortTh label="Status" />
              <SortTh label="Valor" k="amount" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(r => {
              const isInflow = r.entry_type === 'inflow'
              return (
                <tr key={r.entry_id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5">
                    {isInflow
                      ? <span className="inline-flex items-center gap-1 text-emerald-700"><TrendingUp className="h-3.5 w-3.5" />Entrada</span>
                      : <span className="inline-flex items-center gap-1 text-red-600"><TrendingDown className="h-3.5 w-3.5" />Saída</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                    {fmtDate(r.occurred_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {MODULE_LABELS[r.source_module] ?? r.source_module}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {isInflow ? (
                      <div>
                        {r.patient_name && <span className="font-medium">{r.patient_name}</span>}
                        {r.tutor_name && (
                          <span className="ml-1 text-xs text-slate-500">· {r.tutor_name}</span>
                        )}
                        {!r.patient_name && !r.tutor_name && <span className="text-slate-400">—</span>}
                      </div>
                    ) : (
                      <div>
                        {r.supplier_name
                          ? <span className="font-medium">{r.supplier_name}</span>
                          : <span className="text-slate-400">—</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[220px] truncate" title={r.description ?? undefined}>
                    {r.description ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {isInflow ? (PAYMENT_LABELS[r.payment_method ?? 'nao_informado'] ?? '—') : 'Dinheiro'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'reversed' ? 'bg-red-100 text-red-700' :
                      r.status === 'verified' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'archived' ? 'bg-slate-100 text-slate-500' :
                                                'bg-amber-100 text-amber-700'
                    }`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                    isInflow ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {isInflow ? '+' : '−'} {fmt(Math.abs(Number(r.amount)))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length >= 5000 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700">
          ⚠ Mostrando os primeiros 5000 resultados — refine os filtros para resultados mais específicos.
        </div>
      )}
    </div>
  )
}
