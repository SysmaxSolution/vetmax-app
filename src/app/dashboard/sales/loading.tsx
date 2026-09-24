import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do PDV/Vendas — silhueta real (título, tabs, busca + carrinho à
 * esquerda e painel de totais à direita). Design System 2026 v7.
 */
export default function SalesLoading() {
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-72 max-w-[70vw]" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          {/* Busca */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          {/* Carrinho */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <SkeletonRow cols={3} />
            <SkeletonRow cols={3} className="border-b-0" />
          </div>
        </div>
        {/* Painel lateral */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <div className="rounded-xl bg-slate-50 p-4 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
