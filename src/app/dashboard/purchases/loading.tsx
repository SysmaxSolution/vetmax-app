import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do módulo Compras — silhueta real (header com ações, tabs e
 * lista de cards de entrada). Design System 2026 v7.
 */
export default function PurchasesLoading() {
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-56 max-w-[50vw]" />
            <Skeleton className="h-3.5 w-72 max-w-[60vw]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg hidden sm:block" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Cards de entrada */}
      <div className="mx-auto max-w-5xl px-4 pt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
