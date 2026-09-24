'use client'

// Relatório de exames NÃO REALIZADOS / REFEITOS, com o motivo de cada um.
// Contrapartida do boleto: o boleto cobra só os realizados; aqui a clínica
// presta contas do que não foi cobrado e por quê.

import { useState, useTransition } from 'react'
import {
  getExamRejectionReport,
  type RejectionReportRow, type RejectionReportSummary,
} from '@/lib/actions/exam-rejection'
import { STATE_LABEL } from '@/lib/exams/rejection-flow'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (iso: string) => iso
  ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })
  : '—'

export default function ExamRejectionsReport() {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo]     = useState(today)
  const [rows, setRows] = useState<RejectionReportRow[] | null>(null)
  const [summary, setSummary] = useState<RejectionReportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getExamRejectionReport({ from, to })
      if ('error' in res) { setError(res.error); setRows(null); return }
      setRows(res.rows); setSummary(res.summary)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={run} disabled={pending}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60">
            {pending ? 'Carregando…' : 'Gerar'}
          </button>
          {rows && rows.length > 0 && (
            <button onClick={() => window.print()}
              className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Imprimir / PDF
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 print:hidden">{error}</div>}

      {rows === null && !pending && !error && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
          Selecione o período e clique em Gerar.
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-8 text-center text-sm text-emerald-800">
          Nenhum exame não realizado no período. 🎉
        </div>
      )}

      {rows && rows.length > 0 && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label="Não realizados" value={String(summary.total_rejected)} />
            <Tile label="Refeitos (recoleta)" value={String(summary.total_redone)} />
            <Tile label="Encerrados sem recoleta" value={String(summary.total_closed)} />
            <Tile label="Valor não cobrado" value={BRL(summary.total_amount_not_charged)} accent />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Breakdown title="Por motivo" rows={summary.by_reason.map(r => ({ label: r.reason, count: r.count, amount: r.amount }))} />
            <Breakdown title="Por cliente" rows={summary.by_client.map(r => ({ label: r.client, count: r.count, amount: r.amount }))} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th>Data</Th><Th>OS</Th><Th>Pet</Th><Th>Cliente</Th><Th>Exame</Th>
                  <Th>Motivo</Th><Th>Situação</Th><Th className="text-right">Não cobrado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.service_line_id} className="hover:bg-slate-50/60">
                    <Td>{fmtDate(r.date)}</Td>
                    <Td>{r.os_number ?? '—'}</Td>
                    <Td className="font-medium text-slate-900">{r.pet_name}</Td>
                    <Td>
                      {r.client_name}
                      <span className="ml-1 text-[11px] text-slate-400">
                        {r.client_kind === 'partner' ? '(parceiro)' : '(tutor)'}
                      </span>
                    </Td>
                    <Td>
                      {r.exam_name}
                      {r.attempt_no > 1 && <span className="ml-1 text-[11px] text-sky-600">{r.attempt_no}ª coleta</span>}
                    </Td>
                    <Td>
                      {r.reason}
                      {r.note && <span className="block text-[11px] text-slate-400">{r.note}</span>}
                    </Td>
                    <Td>
                      {STATE_LABEL[r.state]}
                      {r.redone && <span className="block text-[11px] text-sky-600">refeito</span>}
                      {r.decided_by && <span className="block text-[11px] text-slate-400">{r.decided_by}</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{BRL(r.amount)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <Td colSpan={7} className="text-right">Total não cobrado</Td>
                  <Td className="text-right tabular-nums">{BRL(summary.total_amount_not_charged)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number; amount: number }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 truncate text-slate-700">{r.label}</span>
            <span className="flex-shrink-0 tabular-nums text-slate-500">
              {r.count}× · <span className="text-slate-900">{BRL(r.amount)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-semibold ${className}`}>{children}</th>
}
function Td({ children, className = '', colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-2 align-top text-slate-700 ${className}`}>{children}</td>
}
