import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton da Agenda — título, legenda de cores, toolbar do calendário e a
 * grade mensal, na mesma silhueta da tela real. Design System 2026 v7.
 */
export default function AppointmentsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Título + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
      </div>

      {/* Legenda de cores */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton variant="circle" className="h-2.5 w-2.5" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Calendário */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-14 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-32 ml-1" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-44 rounded-lg" />
          </div>
        </div>
        {/* Grade mensal */}
        <div className="grid grid-cols-7 gap-px bg-slate-100 p-px">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="bg-white h-[88px] p-1.5 space-y-1.5">
              <Skeleton className="h-3 w-5" />
              {i % 4 === 0 && <Skeleton className="h-3.5 w-full rounded" />}
              {i % 7 === 2 && <Skeleton className="h-3.5 w-4/5 rounded" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
