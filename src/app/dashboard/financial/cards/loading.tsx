import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton dos Recebíveis de Cartão — silhueta real (título + ações,
 * KPIs, barra de filtros e tabela de parcelas). Design System 2026 v7.
 */
export default function FinancialCardsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Título + ações */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonRow key={i} cols={7} className={i === 6 ? 'border-b-0' : ''} />
        ))}
      </div>
    </div>
  )
}
