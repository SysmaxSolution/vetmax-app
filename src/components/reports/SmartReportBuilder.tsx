'use client'

// Relatório Inteligente (1.c) — o usuário descreve o relatório; a IA traduz num
// pedido validado e o sistema calcula (determinístico). A IA nunca gera número.

import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { askSmartReport, type SmartReportResult } from '@/lib/actions/smart-report'
import BarChart from './charts/BarChart'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const EXAMPLES = [
  'Faturamento por forma de pagamento neste mês',
  'Faturamento por mês no ano',
  'Quanto cada empresa faturou',
  'Nº de títulos por categoria',
  'Faturamento por cliente',
]

export default function SmartReportBuilder() {
  const today = new Date().toISOString().split('T')[0]
  const [question, setQuestion] = useState('')
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo]     = useState(today)
  const [res, setRes]   = useState<SmartReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run(q = question) {
    if (!q.trim()) return
    startT(async () => {
      setError(null)
      const r = await askSmartReport({ question: q, from, to })
      if ('error' in r) { setError(r.error); setRes(null); return }
      setRes(r)
    })
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 text-violet-700"><Sparkles className="h-4 w-4" /><span className="text-sm font-semibold">Descreva o relatório que você precisa</span></div>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
          placeholder="Ex.: faturamento por forma de pagamento no mês passado"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Período — De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" /></div>
          <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" /></div>
          <button onClick={() => run()} disabled={pending || !question.trim()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{pending ? 'Interpretando…' : 'Gerar relatório'}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => { setQuestion(ex); run(ex) }} className="text-[11px] rounded-full border border-violet-200 bg-white px-2.5 py-1 text-violet-700 hover:bg-violet-100">{ex}</button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {res && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Métrica: <strong className="text-slate-700">{res.metric_label}</strong></span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Por: <strong className="text-slate-700">{res.dimension_label}</strong></span>
            {res.spec.filters?.category && <span className="rounded-full bg-slate-100 px-2 py-0.5">Categoria: {res.spec.filters.category}</span>}
            {res.spec.filters?.payment_method && <span className="rounded-full bg-slate-100 px-2 py-0.5">Forma: {res.spec.filters.payment_method}</span>}
            <span className="ml-auto font-semibold text-slate-700">Total: {res.money ? BRL(res.total) : res.total.toLocaleString('pt-BR')}</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <BarChart data={res.rows.slice(0, 12).map(r => ({ label: r.label.length > 12 ? r.label.slice(0, 12) + '…' : r.label, value: r.total }))} money={res.money} />
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left px-4 py-2.5">{res.dimension_label}</th><th className="text-right px-2 py-2.5">Qtd</th><th className="text-right px-4 py-2.5">{res.metric_label}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {res.rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Sem dados para este pedido.</td></tr>}
                {res.rows.map(r => (
                  <tr key={r.key} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800 truncate max-w-[280px]">{r.label}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.count}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{res.money ? BRL(r.total) : r.total.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">A IA apenas interpreta o pedido e escolhe métrica/dimensão do catálogo. Todos os valores são calculados pelo banco sobre a receita reconhecida (nunca pela IA).</p>
        </div>
      )}
    </div>
  )
}
