import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do Faturamento — silhueta real (header com ícone + botão,
 * KPIs, filtros e tabela de documentos). Design System 2026 v7.
 */
export default function BillingLoading() {
  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3 w-64 max-w-[60vw]" />
          </div>
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-5 space-y-3">
        <Skeleton className="h-3.5 w-20" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} cols={6} className={i === 5 ? 'border-b-0' : ''} />
        ))}
      </div>
    </div>
  )
}
