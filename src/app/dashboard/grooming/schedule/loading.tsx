import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton do Agendamento de Banho e Tosa — silhueta do formulário real
 * (header com ícone + 2 colunas de cards). Design System 2026 v7.
 */
export default function GroomingScheduleLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Header com ícone */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-72 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-96 max-w-[70vw]" />
        </div>
      </div>

      {/* Duas colunas: data/horário + formulário */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <Skeleton className="h-4 w-44" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
          <SkeletonText lines={2} />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
