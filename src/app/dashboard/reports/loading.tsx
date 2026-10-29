import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton de Relatórios — sidebar de categorias + área do relatório ativo
 * (filtros e tabela), na silhueta real do workspace. Design System 2026 v7.
 */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-120px)]">
      {/* Sidebar de categorias */}
      <aside className="w-full lg:w-56 lg:flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
        <div className="hidden lg:flex lg:flex-col lg:space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 lg:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </aside>

      {/* Área do relatório */}
      <main className="flex-1 p-4 lg:p-6">
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4.5 w-48" />
            <Skeleton className="h-3 w-72 max-w-[60vw]" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3">
            <Skeleton className="h-9 w-36 rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-lg" />
            <Skeleton className="h-9 w-40 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
          {/* Tabela */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
              <Skeleton className="h-3.5 w-2/3" />
            </div>
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} className="border-b-0" />
          </div>
        </div>
      </main>
    </div>
  )
}
