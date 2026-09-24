import { ShieldCheck, Clock, CalendarDays, IdCard } from 'lucide-react'
import type { InsuranceCardData } from '@/lib/actions/insurance-coverage'

const CATEGORY_LABELS: Record<string, string> = {
  consulta:             'Consulta',
  vacina:               'Vacina',
  procedimento_clinico: 'Procedimento clínico',
  exame_simples:        'Exame simples',
  exame_imagem:         'Exame de imagem',
  especialista:         'Especialista',
  cirurgia:             'Cirurgia',
  castracao:            'Castração',
  anestesia:            'Anestesia',
  internacao:           'Internação',
}

function formatBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function InsuranceCard({ data }: { data: InsuranceCardData }) {
  if (!data.has_insurance) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="h-4 w-4 text-slate-300" />
          Pet sem convênio ativo — atendimentos cobrados particular
        </div>
      </div>
    )
  }

  const waiting = data.waiting_progress ?? {} as Record<string, number>
  const allCleared = Object.values(waiting).every(v => v === 0)

  return (
    <section className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-2xl shadow-sm border border-sky-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-sky-200/70 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-sky-700" />
          </div>
          <div>
            <h2 className="font-semibold text-sky-900">
              {data.provider_name} <span className="text-sky-700">· {data.plan_type}</span>
            </h2>
            <p className="text-xs text-sky-700 mt-0.5">Convênio ativo · {data.days_enrolled ?? 0} dias de adesão</p>
          </div>
        </div>
        {allCleared ? (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            Carências cumpridas
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            Em carência
          </span>
        )}
      </header>

      <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="flex items-center gap-2 text-sky-800">
          <CalendarDays className="h-3.5 w-3.5 text-sky-500" />
          <span>Adesão: <strong className="font-mono tabular-nums">{formatBR(data.enrollment_date)}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-sky-800">
          <IdCard className="h-3.5 w-3.5 text-sky-500" />
          <span>Carteirinha: <strong className="font-mono tabular-nums">{data.member_id || '—'}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-sky-800">
          <Clock className="h-3.5 w-3.5 text-sky-500" />
          <span>Validade: <strong className="font-mono tabular-nums">{formatBR(data.valid_until) || 'indefinida'}</strong></span>
        </div>
      </div>

      {/* Progresso de carência por categoria */}
      {!allCleared && (
        <div className="px-5 pb-4 border-t border-sky-200/60 pt-3">
          <p className="text-[11px] font-semibold text-sky-900 mb-2 uppercase tracking-wide">
            Faltam dias para liberar
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
            {Object.entries(waiting).map(([cat, days]) => (
              <div
                key={cat}
                className={`flex items-center justify-between px-2 py-1 rounded-md ${
                  days === 0 ? 'text-emerald-700' : days > 60 ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'
                }`}
              >
                <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                <span className="font-semibold font-mono tabular-nums">{days === 0 ? '✓' : `${days}d`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
