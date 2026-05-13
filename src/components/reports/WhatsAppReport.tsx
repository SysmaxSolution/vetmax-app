'use client'

import { useState, useTransition } from 'react'
import { getWhatsAppReport, type WhatsAppReportSummary } from '@/lib/actions/reports-g13'

const TRIGGER_LABELS: Record<string, string> = {
  no_visit:        'Sem visita recente',
  vaccine_due:     'Vacina vencida',
  pending_return:  'Retorno pendente',
  grooming_due:    'Banho e tosa',
  outros:          'Outros',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">
      <p className="text-xs font-medium text-violet-600 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-violet-900">{value}</p>
      {sub && <p className="text-xs text-violet-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function WhatsAppReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [result,  setResult]  = useState<WhatsAppReportSummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getWhatsAppReport({ from, to })
      if ('error' in res) { setError(res.error); return }
      setResult(res)
    })
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <button onClick={run} disabled={pending}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {pending ? 'Carregando…' : 'Gerar'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-10 text-center">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-sm font-medium text-slate-600">Relatório de WhatsApp</p>
          <p className="text-xs text-slate-400 mt-1">
            Configure o módulo WhatsApp e as campanhas para ver métricas aqui.
            Selecione o período e clique em Gerar.
          </p>
        </div>
      )}

      {result !== null && (
        <>
          {result.sent === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-8 text-center">
              <p className="text-sm font-medium text-amber-700">Nenhuma mensagem enviada neste período.</p>
              <p className="text-xs text-amber-500 mt-1">Configure campanhas no módulo WhatsApp para começar a enviar mensagens automatizadas.</p>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Mensagens Enviadas" value={result.sent} />
                <StatCard label="Taxa de Resposta"   value={`${result.read_rate}%`} sub="Respostas / Enviadas" />
                <StatCard label="Respostas Recebidas" value={result.replies} />
                <StatCard label="Conversões"          value={result.conversions} sub="Consultas agendadas" />
              </div>

              {/* By trigger */}
              {Object.keys(result.by_trigger).length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Mensagens por Campanha</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {Object.entries(result.by_trigger).map(([trigger, count]) => {
                      const pct = result.sent > 0 ? (count / result.sent) * 100 : 0
                      return (
                        <div key={trigger} className="px-4 py-3 flex items-center gap-3">
                          <span className="text-sm text-slate-700 w-full sm:w-40 flex-shrink-0">
                            {TRIGGER_LABELS[trigger] ?? trigger}
                          </span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700 w-12 text-right">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
