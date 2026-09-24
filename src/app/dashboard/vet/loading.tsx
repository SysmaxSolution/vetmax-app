import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/**
 * Skeleton do Consultório — mesma silhueta do VetWorkspace (header com botão
 * primário, tab switcher e card da fila com linhas de pacientes) para evitar
 * layout shift na troca. Design System 2026 v7.
 */
export default function VetLoading() {
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header: título + botão Incluir Paciente */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      {/* Fila de espera */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <SkeletonRow cols={4} />
        <SkeletonRow cols={4} />
        <SkeletonRow cols={4} />
        <SkeletonRow cols={4} className="border-b-0" />
      </div>
    </div>
  )
}
