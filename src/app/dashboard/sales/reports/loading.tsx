import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Relatório de Vendas — silhueta real (título, filtro de
 * período e KPIs). Design System 2026 v7.
 */
export default function SalesReportsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
      </div>

      {/* Filtro de período */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 flex flex-col items-center space-y-2">
            <Skeleton variant="circle" className="h-9 w-9" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
