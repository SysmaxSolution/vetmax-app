import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Painel do Diretor — saudação, KPIs em grid, gráfico semanal e
 * radar operacional, na silhueta real. Design System 2026 v7.
 */
export default function DirectorPanelLoading() {
  return (
    <div className="space-y-8">
      {/* Saudação */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-64 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico + Radar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-end gap-3 h-40">
            {['h-16', 'h-24', 'h-32', 'h-20', 'h-36', 'h-28', 'h-12'].map((h, i) => (
              <Skeleton key={i} className={`flex-1 ${h}`} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
