import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Relatório de Comissões — título, cards de resumo e lista por
 * profissional, na silhueta real da página. Design System 2026 v7.
 */
export default function CommissionsReportLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-64 max-w-[70vw]" />
        <Skeleton className="h-3.5 w-96 max-w-[80vw]" />
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>

      {/* Lista por profissional */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-4 px-5 py-3">
                <Skeleton className="h-3.5 flex-1 max-w-md" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
