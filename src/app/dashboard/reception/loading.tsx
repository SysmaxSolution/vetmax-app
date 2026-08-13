import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton da Recepção — mesma silhueta da tela real (sub-nav, busca com
 * ações, fila de espera em cards e histórico em linhas) para evitar layout
 * shift na troca. Design System 2026 v7.
 */
export default function ReceptionLoading() {
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Sub-nav (Atendimento / Agenda / Programações) */}
      <div className="flex gap-1">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Toggle Lista/Kanban */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-7 w-16" />
      </div>

      {/* Busca Inteligente: título + botões + input */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-64 max-w-[50vw]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="hidden sm:block h-10 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
      </section>

      {/* Fila de Espera: título + contador + cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <Skeleton variant="circle" className="h-7 w-7" />
        </div>
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>

      {/* Atendidos Hoje: título + linhas densas */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-60" />
          </div>
          <Skeleton variant="circle" className="h-7 w-7" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <SkeletonRow cols={4} />
          <SkeletonRow cols={4} />
          <SkeletonRow cols={4} className="border-b-0" />
        </div>
      </section>
    </div>
  )
}
