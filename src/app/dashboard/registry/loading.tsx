import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

/**
 * Skeleton de Cadastros Gerais — título, abas e grid de cards de fornecedores,
 * na silhueta real da tela. Design System 2026 v7.
 */
export default function RegistryLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 pb-px">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Barra de ações */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-9 w-64 max-w-[50vw] rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
