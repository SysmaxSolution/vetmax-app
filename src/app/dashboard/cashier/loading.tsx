import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do Caixa — mesma silhueta da tela real (header, abas, KPIs em
 * grid, barra de filtros e tabela de lançamentos) para evitar layout shift
 * na troca. Design System 2026 v7.
 */
export default function CashierLoading() {
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Título + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3.5 w-72 max-w-[70vw]" />
      </div>

      {/* Abas (Visão Geral / Recebimentos / Saídas / Relatórios / Sessão) */}
      <div className="flex gap-1 border-b border-slate-200 pb-px">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-64 max-w-[40vw]" />
        <Skeleton className="ml-auto h-3.5 w-36" />
      </div>

      {/* Tabela de lançamentos */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <Skeleton className="h-4 w-56 max-w-[50vw]" />
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonRow cols={6} />
        <SkeletonRow cols={6} />
        <SkeletonRow cols={6} />
        <SkeletonRow cols={6} className="border-b-0" />
      </div>
    </div>
  )
}
