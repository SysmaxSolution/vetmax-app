import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton da tela de Triagem — mesma silhueta do TriageForm (header com
 * voltar + badge, banner CTA, card do paciente, Motor de Voz e grid de
 * sinais vitais) para evitar layout shift. Design System 2026 v7.
 */
export default function TriageLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header: voltar à fila + badge de status */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>

        {/* Banner CTA */}
        <Skeleton className="h-16 w-full rounded-xl" />

        {/* Card do paciente */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-start gap-4">
            <Skeleton variant="circle" className="h-16 w-16 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32" />
              <SkeletonText lines={2} className="max-w-xs" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>

        {/* Motor de Voz */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72 max-w-[60vw]" />
            </div>
          </div>
          <Skeleton className="h-10 w-28 rounded-lg mb-4" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>

        {/* Sinais Vitais: grid 2 colunas */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <Skeleton className="h-5 w-32 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Queixa Principal */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
