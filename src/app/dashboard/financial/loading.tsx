import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do Financeiro — silhueta real (header branco, tabs, KPIs,
 * filtros e tabela de títulos). Design System 2026 v7.
 */
export default function FinancialLoading() {
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-lg" />
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <Skeleton className="h-3.5 w-1/2" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} cols={6} className={i === 5 ? 'border-b-0' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}
