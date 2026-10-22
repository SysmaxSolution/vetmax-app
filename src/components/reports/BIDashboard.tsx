'use client'

// Painel BI — KPIs + gráficos SVG inline sobre as mesmas fontes reconciliadas
// dos relatórios (faturamento, aging, clientes, fluxo). Self-contained.

import { useState, useTransition } from 'react'
import {
  getRevenueBreakdown, getAgingReport, getClientsReport, getCashflowProjection,
} from '@/lib/actions/reports-g13'
import BarChart from './charts/BarChart'
import LineChart from './charts/LineChart'
import DonutChart from './charts/DonutChart'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtMonth = (p: string) => { const [y, m] = p.split('-'); return `${m}/${y.slice(2)}` }

interface DashData {
  faturamento: number
  ticket: number
  novos: number
  aReceber: number
  recebido: number
  byMonth: { label: string; value: number }[]
  byCategory: { label: string; value: number }[]
  agingBuckets: { label: string; value: number }[]
  topClients: { label: string; value: number }[]
}

export default function BIDashboard() {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today.slice(0, 4) + '-01-01')
  const [to, setTo]     = useState(today)
  const [data, setData] = useState<DashData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const [rev, byMonth, aging, clients, cash] = await Promise.all([
        getRevenueBreakdown({ from, to, dimension: 'category' }),
        getRevenueBreakdown({ from, to, dimension: 'month' }),
        getAgingReport({ type: 'receivable', as_of: to }),
        getClientsReport({ from, to }),
        getCashflowProjection({ from, to }),
      ])
      const firstErr = [rev, byMonth, aging, clients, cash].find(r => r && 'error' in r) as { error: string } | undefined
      if (firstErr) { setError(firstErr.error); return }
      const r = rev as Exclude<typeof rev, { error: string }>
      const bm = byMonth as Exclude<typeof byMonth, { error: string }>
      const ag = aging as Exclude<typeof aging, { error: string }>
      const cl = clients as Exclude<typeof clients, { error: string }>
      const ca = cash as Exclude<typeof cash, { error: string }>
      setData({
        faturamento: r.total,
        ticket: cl.summary.ticket_medio,
        novos: cl.summary.new_clients,
        aReceber: ag.buckets.filter(b => b.key !== 'a_vencer').reduce((s, b) => s + b.total, 0) + (ag.buckets.find(b => b.key === 'a_vencer')?.total ?? 0),
        recebido: ca.totals.realizado_in,
        byMonth: bm.rows.slice().sort((a, b) => a.key.localeCompare(b.key)).map(x => ({ label: fmtMonth(x.key), value: x.total })),
        byCategory: r.rows.slice(0, 6).map(x => ({ label: x.label, value: x.total })),
        agingBuckets: ag.buckets.map(b => ({ label: b.label, value: b.total })),
        topClients: cl.rows.slice(0, 8).map(c => ({ label: c.name.split(' ')[0], value: c.faturamento })),
      })
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
        <button onClick={run} disabled={pending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{pending ? 'Carregando…' : 'Atualizar painel'}</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {data === null && !pending && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Selecione o período e clique em Atualizar painel.</div>}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Faturamento" value={BRL(data.faturamento)} tone="text-violet-700" />
            <Kpi label="Recebido (caixa)" value={BRL(data.recebido)} tone="text-emerald-700" />
            <Kpi label="A receber" value={BRL(data.aReceber)} tone="text-amber-600" />
            <Kpi label="Ticket médio" value={BRL(data.ticket)} tone="text-slate-800" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Faturamento por mês"><LineChart data={data.byMonth} /></Panel>
            <Panel title="Faturamento por categoria"><DonutChart data={data.byCategory} /></Panel>
            <Panel title="A receber por faixa de atraso"><BarChart data={data.agingBuckets} color="#f59e0b" /></Panel>
            <Panel title="Top clientes (faturamento)"><BarChart data={data.topClients} color="#0d9488" /></Panel>
          </div>
          <p className="text-[11px] text-slate-400">Novos clientes no período: <strong className="text-slate-600">{data.novos}</strong>. Mesmas fontes reconciliadas dos relatórios (adiantamento/inter-CNPJ/crédito tratados).</p>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-800 mb-3">{title}</p>
      {children}
    </div>
  )
}
