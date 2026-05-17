import { getFeatureRequests } from '@/lib/actions/feature-requests'
import { StatusSelect } from './StatusSelect'

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-600',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta', medium: 'Média', low: 'Baixa',
}

export default async function FeatureRequestsPage() {
  const groups = await getFeatureRequests()

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Requisições de Funcionalidades</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ideias capturadas automaticamente pelo Mentor IA quando clínicas perguntam por módulos não existentes.
        </p>
      </div>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de ideias',    value: groups.length,                                       color: 'text-slate-800' },
          { label: 'Pedidos totais',     value: groups.reduce((s, g) => s + g.total, 0),             color: 'text-slate-800' },
          { label: 'Alta prioridade',    value: groups.filter(g => g.high > 0).length,               color: 'text-red-600'   },
          { label: 'Planejados / feitos', value: groups.filter(g => g.status !== 'pending').length,  color: 'text-emerald-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-semibold text-slate-700">Nenhuma requisição ainda</p>
          <p className="text-sm text-slate-500 mt-1">Quando clínicas pedirem módulos inexistentes, aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.feature_name} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Cabeçalho do grupo */}
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 font-bold text-sm">
                    {group.total}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{group.feature_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {group.high > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE.high}`}>
                          {group.high}× Alta
                        </span>
                      )}
                      {group.medium > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE.medium}`}>
                          {group.medium}× Média
                        </span>
                      )}
                      {group.low > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE.low}`}>
                          {group.low}× Baixa
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <StatusSelect featureName={group.feature_name} currentStatus={group.status} />
              </div>

              {/* Detalhes das solicitações */}
              <div className="divide-y divide-slate-50">
                {group.requests.map(req => (
                  <div key={req.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE[req.priority]}`}>
                      {PRIORITY_LABEL[req.priority]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 italic">"{req.user_message}"</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {req.clinic_name} · {new Date(req.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
