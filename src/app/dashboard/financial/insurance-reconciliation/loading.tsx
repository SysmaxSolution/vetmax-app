import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton da Conciliação de Convênios — silhueta real (breadcrumb,
 * header com ícone, dropzone e lista de remessas). Design System 2026 v7.
 */
export default function InsuranceReconciliationLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Skeleton className="h-4 w-24" />

        {/* Header */}
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-72 max-w-[60vw]" />
            <Skeleton className="h-3.5 w-full max-w-xl" />
          </div>
        </div>

        {/* Dropzone */}
        <Skeleton className="h-44 w-full rounded-2xl" />

        {/* Lista de remessas */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <Skeleton className="h-3.5 w-48" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
