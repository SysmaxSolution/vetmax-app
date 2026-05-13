'use client'

import { useState, useTransition } from 'react'
import { User, Stethoscope, FlaskConical, FileText, TrendingUp } from 'lucide-react'
import {
  getProfessionalProductivityReport,
  type ProfessionalProductivitySummary,
  type ProfessionalProductivityRow,
} from '@/lib/actions/reports-g13'

const ROLE_LABEL: Record<string, string> = {
  vet:         'Médico Vet.',
  admin:       'Administrador',
  technician:  'Auxiliar Vet.',
  groomer:     'Tosador',
  receptionist:'Recepcionista',
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  )
}

function ProfRow({ r, rank }: { r: ProfessionalProductivityRow; rank: number }) {
  const specs = r.specialties?.join(', ') || '—'
  const total = r.consult_total + r.exam_total + r.prescription_total
  return (
    <tr className="hover:bg-violet-50/40 transition-colors">
      <td className="px-4 py-3 text-xs text-slate-400 font-mono w-8">{rank}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{r.user_name}</p>
            {r.crmv && <p className="text-xs text-slate-400">CRMV {r.crmv}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-block rounded-full bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5">
          {ROLE_LABEL[r.role] ?? r.role}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={specs}>{specs}</td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-bold text-violet-700">{r.consult_total}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold text-blue-600">{r.exam_total}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold text-emerald-600">{r.prescription_total}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-bold text-slate-700">{total}</span>
      </td>
    </tr>
  )
}

export default function ProfessionalProductivityReport() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [result,  setResult]  = useState<ProfessionalProductivitySummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getProfessionalProductivityReport({ from, to })
      if ('error' in res) { setError(res.error); return }
      setResult(res)
    })
  }

  const sorted = result
    ? [...result.rows].sort((a, b) => (b.consult_total + b.exam_total + b.prescription_total) - (a.consult_total + a.exam_total + a.prescription_total))
    : []

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
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
        <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-10 text-center text-sm text-violet-500">
          Selecione o período e clique em Gerar.
        </div>
      )}

      {result !== null && (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={<Stethoscope className="h-5 w-5 text-violet-600" />}
              label="Consultas realizadas"
              value={result.totals.consult_total}
              color="bg-violet-50 border-violet-100 text-violet-900"
            />
            <StatCard
              icon={<FlaskConical className="h-5 w-5 text-blue-600" />}
              label="Exames solicitados"
              value={result.totals.exam_total}
              color="bg-blue-50 border-blue-100 text-blue-900"
            />
            <StatCard
              icon={<FileText className="h-5 w-5 text-emerald-600" />}
              label="Receituários emitidos"
              value={result.totals.prescription_total}
              color="bg-emerald-50 border-emerald-100 text-emerald-900"
            />
          </div>

          {/* Tabela por profissional */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-violet-50 border-b border-violet-100">
                <tr>
                  {['#', 'Profissional', 'Função', 'Especialidade', 'Consultas', 'Exames', 'Receitas', 'Total'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-violet-800 text-xs uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      Nenhum profissional encontrado.
                    </td>
                  </tr>
                ) : sorted.map((r, i) => (
                  <ProfRow key={r.user_id} r={r} rank={i + 1} />
                ))}
              </tbody>
              {sorted.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Total geral
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-violet-700">{result.totals.consult_total}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">{result.totals.exam_total}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">{result.totals.prescription_total}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-slate-800">
                      {result.totals.consult_total + result.totals.exam_total + result.totals.prescription_total}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
