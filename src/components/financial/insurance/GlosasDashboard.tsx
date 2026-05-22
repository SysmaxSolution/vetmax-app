import { AlertTriangle, FileWarning, TrendingDown, FileX } from 'lucide-react'
import { getGlosasForRemittance } from '@/lib/actions/petlove-glosas'

interface Props {
  remittanceId: string
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default async function GlosasDashboard({ remittanceId }: Props) {
  const data = await getGlosasForRemittance(remittanceId)

  if ('error' in data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Glosas indisponíveis: {data.error}
      </div>
    )
  }

  if (data.count === 0) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-center gap-2 text-emerald-800">
          <FileWarning className="h-4 w-4 opacity-60" />
          <span className="text-sm font-medium">Nenhuma glosa identificada no período {fmtBR(data.period_start)} – {fmtBR(data.period_end)}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 overflow-hidden">
      <header className="px-5 py-4 border-b border-rose-200/70 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-rose-700" />
          </div>
          <div>
            <h2 className="font-semibold text-rose-900">Painel de Glosas</h2>
            <p className="text-xs text-rose-700 mt-0.5">Período {fmtBR(data.period_start)} – {fmtBR(data.period_end)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-rose-700 font-medium uppercase">Perda potencial</p>
          <p className="text-xl font-bold text-rose-900 tabular-nums">{BRL(data.total_loss)}</p>
        </div>
      </header>

      {/* Top procedimentos */}
      {data.by_procedure.length > 0 && (
        <div className="px-5 py-3 border-b border-rose-200/60 bg-white/40">
          <p className="text-[11px] font-semibold text-rose-900 uppercase tracking-wide mb-2">Top procedimentos glosados</p>
          <div className="space-y-1">
            {data.by_procedure.map(p => (
              <div key={p.procedure} className="flex items-center justify-between text-xs">
                <span className="text-rose-900 truncate flex-1 pr-2">{p.procedure}</span>
                <span className="text-rose-700 flex-shrink-0">
                  <strong>{p.count}×</strong> · {BRL(p.loss)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de glosas */}
      <ul className="divide-y divide-rose-100 max-h-96 overflow-y-auto">
        {data.items.map(g => (
          <li key={g.invoice_item_id} className="px-5 py-3 flex items-start gap-3 hover:bg-white/40">
            <FileX className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{g.description}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {g.patient_name ?? 'pet ?'}
                {g.tutor_name && ` · ${g.tutor_name}`}
                {` · ${g.reason_label}`}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-sm font-bold text-rose-700 tabular-nums">{BRL(g.loss)}</p>
              {g.realized_value > 0 ? (
                <p className="text-[10px] text-slate-500">
                  pagou {BRL(g.realized_value)} de {BRL(g.expected_value)}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">esperado {BRL(g.expected_value)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="px-5 py-2 bg-white/30 border-t border-rose-100 text-[10px] text-rose-700 flex items-center gap-1.5">
        <TrendingDown className="h-3 w-3" />
        {data.count} {data.count === 1 ? 'item' : 'itens'} elegíveis para recurso de glosa junto à Petlove
      </footer>
    </section>
  )
}
