import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do Estoque/Farmácia — silhueta da tela real (header + toggle de
 * views, tabs de categoria, busca e tabela). Design System 2026 v7.
 */
export default function PharmacyLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Toggle Produtos / Serviços / Pacotes */}
      <Skeleton className="h-10 w-full sm:w-96 rounded-lg" />

      {/* Tabs de categoria */}
      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg shrink-0" />
        ))}
      </div>

      {/* Busca */}
      <Skeleton className="h-10 w-full rounded-lg" />

      {/* Tabela */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonRow key={i} cols={6} className={i === 6 ? 'border-b-0' : ''} />
        ))}
      </div>
    </div>
  )
}
