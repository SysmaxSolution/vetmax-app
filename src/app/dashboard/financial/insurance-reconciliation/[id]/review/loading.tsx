import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton da Revisão de Remessa — silhueta real (breadcrumb, header da
 * remessa, cards de status e lista de linhas). Design System 2026 v7.
 */
export default function RemittanceReviewLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Skeleton className="h-4 w-44" />

        {/* Header da remessa */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="h-3 w-20 ml-auto" />
            <Skeleton className="h-6 w-32 ml-auto" />
          </div>
        </div>

        {/* Cards de status */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Lista de linhas */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <Skeleton className="h-3.5 w-56" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} cols={5} className={i === 5 ? 'border-b-0' : ''} />
          ))}
        </div>
      </main>
    </div>
  )
}
