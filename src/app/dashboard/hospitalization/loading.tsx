import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton da Internação — header com botão Admitir Paciente e kanban de
 * 4 colunas (Observação / Enfermaria / UTI / Alta), na mesma silhueta do
 * HospitalizationKanban. Design System 2026 v7.
 */
export default function HospitalizationLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-96 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>

      {/* Kanban: 4 colunas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <div className="p-3 space-y-3">
              {Array.from({ length: col === 3 ? 1 : 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
