import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Banho e Tosa — silhueta do kanban real (título + 6 colunas
 * com cards) para evitar layout shift. Design System 2026 v7.
 */
export default function GroomingLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Título + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-96 max-w-[80vw]" />
      </div>

      {/* Kanban: 6 colunas */}
      <div className="flex gap-3 min-w-0 md:grid md:grid-cols-3 lg:grid-cols-6 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-44 md:w-auto flex-none md:flex-auto rounded-2xl bg-slate-100/70 overflow-hidden">
            <Skeleton className="h-11 w-full rounded-none" />
            <div className="p-2 space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-2.5 w-full" />
              </div>
              {i < 3 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
