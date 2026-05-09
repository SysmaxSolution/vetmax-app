'use client'

import { useState, useTransition } from 'react'
import { TrendingUp, TrendingDown, Wallet, ListChecks } from 'lucide-react'
import { generateCashierReport, type CashierReportSummary } from '@/lib/actions/cashier-reports'
import ReportFilters, { type FiltersState } from './reports/ReportFilters'
import ReportTable from './reports/ReportTable'
import ReportCharts from './reports/ReportCharts'
import ReportExport from './reports/ReportExport'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtBR(date: string) {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  clinicName:   string
  initialFrom:  string
  initialTo:    string
}

export default function CashierTabReports({ clinicName, initialFrom, initialTo }: Props) {
  const [filters, setFilters] = useState<FiltersState>({
    from: initialFrom,
    to: initialTo,
    source_module: '',
    payment_method: '',
    status: '',
    supplier: null,
    q: '',
  })
  const [data, setData]       = useState<CashierReportSummary | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await generateCashierReport({
        from:           filters.from,
        to:             filters.to,
        source_module:  filters.source_module || undefined,
        payment_method: filters.payment_method || undefined,
        status:         filters.status || undefined,
        supplier_id:    filters.supplier?.id,
        q:              filters.q || undefined,
      })
      if ('error' in res) { setError(res.error); setData(null); return }
      setData(res)
    })
  }

  const periodLabel = `${fmtBR(filters.from)} a ${fmtBR(filters.to)}`

  return (
    <div className="space-y-4">
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        onSubmit={handleSubmit}
        loading={loading}
      />

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* KPIs do período */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Entradas (período)"
              value={fmt(data.totals.inflows)}
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              bg="bg-emerald-50"
              valCls="text-emerald-700"
            />
            <KpiCard
              label="Saídas (período)"
              value={fmt(data.totals.outflows)}
              icon={<TrendingDown className="h-4 w-4 text-red-500" />}
              bg="bg-red-50"
              valCls="text-red-600"
            />
            <KpiCard
              label="Saldo do período"
              value={fmt(data.totals.balance)}
              icon={<Wallet className="h-4 w-4 text-blue-600" />}
              bg="bg-blue-50"
              valCls={data.totals.balance >= 0 ? 'text-blue-700' : 'text-red-600'}
            />
            <KpiCard
              label="Lançamentos"
              value={String(data.totals.count)}
              icon={<ListChecks className="h-4 w-4 text-slate-600" />}
              bg="bg-slate-100"
              valCls="text-slate-700"
            />
          </div>

          {/* Header com período e botões de export */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{periodLabel}</span>
              <span className="ml-2 text-slate-400">· {data.totals.count} lançamentos</span>
            </p>
            <ReportExport data={data} periodLabel={periodLabel} clinicName={clinicName} />
          </div>

          {/* Charts */}
          <ReportCharts data={data} />

          {/* Table */}
          <ReportTable rows={data.rows} />
        </>
      )}

      {!data && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          Defina o período e os filtros desejados, depois clique em <span className="font-semibold text-slate-700">Buscar</span>.
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, icon, bg, valCls }: {
  label: string
  value: string
  icon: React.ReactNode
  bg: string
  valCls: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}>
          {icon}
        </div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className={`text-xl font-bold tabular-nums ${valCls}`}>{value}</p>
    </div>
  )
}
