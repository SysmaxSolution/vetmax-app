import { PawPrint, Pin } from 'lucide-react'
import type { PetlovePriceHistoryItem } from '@/lib/actions/petlove-import'

export default function PetlovePriceHistory({ items }: { items: PetlovePriceHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-purple-50/60 rounded-2xl border border-purple-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-purple-200 flex items-center gap-2">
          <PetloveBadge />
          <h2 className="font-semibold text-purple-900">Tabela de Preços Históricos Petlove</h2>
        </header>
        <div className="px-5 py-8 text-center">
          <PawPrint className="h-8 w-8 text-purple-200 mx-auto mb-2" />
          <p className="text-sm text-purple-500">
            Nenhum repasse Petlove registrado para este pet ainda.
          </p>
          <p className="text-xs text-purple-400 mt-1">
            Os valores aparecerão aqui após a importação da próxima remessa mensal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-purple-50/60 rounded-2xl border border-purple-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-purple-200 flex items-center justify-between">
        <h2 className="font-semibold text-purple-900 flex items-center gap-2">
          <PetloveBadge />
          Tabela de Preços Históricos Petlove
        </h2>
        <span className="text-xs text-purple-500">
          {items.length} procedimento{items.length !== 1 ? 's' : ''}
        </span>
      </header>

      <div className="divide-y divide-purple-100">
        {items.map(item => (
          <div key={item.procedure_name} className="px-5 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex items-start gap-2.5">
              <span
                title="Valor de repasse Petlove"
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 border border-purple-200 flex-shrink-0 mt-0.5"
              >
                <PawPrint className="h-3.5 w-3.5 text-purple-600" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-purple-900 truncate flex items-center gap-1.5">
                  {item.procedure_name}
                  {item.price_fixed && (
                    <span
                      title="Preço fixado no perfil — será sugerido automaticamente no próximo atendimento"
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wide"
                    >
                      <Pin className="h-2.5 w-2.5" />
                      Fixado
                    </span>
                  )}
                </p>
                <p className="text-xs text-purple-500 mt-0.5">
                  {item.plan_name ? `${item.plan_name} · ` : ''}
                  Última remessa: {formatDate(item.last_service_date)}
                  {item.observation_count > 1 && ` · ${item.observation_count} ocorrências`}
                </p>
              </div>
            </div>
            <span className={`text-sm font-semibold font-mono tabular-nums flex-shrink-0 ${item.price_fixed ? 'text-emerald-700' : 'text-purple-700'}`}>
              {formatBRL(item.last_repass_value)}
            </span>
          </div>
        ))}
      </div>

      <footer className="px-5 py-2.5 bg-purple-100/60 border-t border-purple-200">
        <p className="text-[11px] text-purple-600">
          Valores extraídos das remessas mensais.
          <span className="ml-1">Itens com <Pin className="inline h-2.5 w-2.5 text-emerald-700" /> <strong className="text-emerald-700">Fixado</strong> serão sugeridos automaticamente no próximo atendimento.</span>
        </p>
      </footer>
    </div>
  )
}

function PetloveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wide">
      <PawPrint className="h-3 w-3" />
      Petlove
    </span>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
