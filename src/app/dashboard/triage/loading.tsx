import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton da fila de Triagem — mesma silhueta do NurseWorkspace (título,
 * tab switcher e card da fila com header + linhas) para evitar layout shift.
 * Design System 2026 v7.
 */
export default function TriageListLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Título + subtítulo */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
        </div>

        {/* Tab switcher (Fila de Espera / Histórico de Hoje) */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>

        {/* Card da fila: header com ícone + contador + botão, depois linhas */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-36 rounded-lg" />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map(i => (
              <div key={i} className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
