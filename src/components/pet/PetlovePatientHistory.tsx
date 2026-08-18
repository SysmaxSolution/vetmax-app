import { History, UserPlus, ArrowRight, DollarSign, Receipt } from 'lucide-react'
import type { PetlovePatientHistoryEvent } from '@/lib/actions/patient-custom-prices'

const EVENT_STYLES: Record<PetlovePatientHistoryEvent['event_type'], { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  patient_created: { icon: UserPlus,  tone: 'bg-purple-100 text-purple-700', label: 'Cadastro criado' },
  plan_updated:    { icon: ArrowRight, tone: 'bg-sky-100 text-sky-700',       label: 'Plano atualizado' },
  price_updated:   { icon: DollarSign, tone: 'bg-amber-100 text-amber-700',   label: 'Preço atualizado' },
  entry_created:   { icon: Receipt,    tone: 'bg-emerald-100 text-emerald-700', label: 'Título lançado' },
}

export default function PetlovePatientHistory({ events }: { events: PetlovePatientHistoryEvent[] }) {
  if (events.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          Histórico de Conciliação Petlove
        </h2>
        <span className="text-xs text-slate-400 font-mono tabular-nums">{events.length} evento{events.length !== 1 ? 's' : ''}</span>
      </header>
      <div className="divide-y divide-slate-100">
        {events.map(e => {
          const style = EVENT_STYLES[e.event_type] ?? EVENT_STYLES.entry_created
          const Icon = style.icon
          return (
            <div key={e.id} className="px-5 py-3 flex items-start gap-3">
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${style.tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 break-words">{e.description}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {style.label} · {formatDateTime(e.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
