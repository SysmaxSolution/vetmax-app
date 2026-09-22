import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton da Gestão — o layout já renderiza título + tabs; aqui vai a
 * silhueta do card de Modelos (lista padrão da rota). Design System 2026 v7.
 */
export default function ManagementLoading() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56 max-w-[50vw]" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      </div>
      <SkeletonRow cols={4} />
      <SkeletonRow cols={4} />
      <SkeletonRow cols={4} />
      <SkeletonRow cols={4} className="border-b-0" />
    </div>
  )
}
