import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Centro Cirúrgico — header com botão Nova Cirurgia e kanban de
 * 3 colunas (Preparo / Sala Cirúrgica / RPA), na mesma silhueta do
 * SurgeryKanban. Design System 2026 v7.
 */
export default function SurgeryLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-44 max-w-[50vw]" />
            <Skeleton className="h-3.5 w-72 max-w-[65vw]" />
          </div>
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Kanban: 3 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <div className="p-3 space-y-3">
              {Array.from({ length: col === 0 ? 2 : 1 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
