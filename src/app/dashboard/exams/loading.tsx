import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton de Exames — mesma silhueta do ExamsWorkspace (header com botão
 * Solicitar Exame, tab switcher e cards da fila com ações) para evitar
 * layout shift. Design System 2026 v7.
 */
export default function ExamsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      {/* Fila de exames: card container + cards de paciente */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
