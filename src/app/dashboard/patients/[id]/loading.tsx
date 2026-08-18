import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton do perfil do Paciente — mesma silhueta da tela real (link de
 * voltar, cabeçalho com foto, grid Tutor + Próxima Dose e histórico de
 * vacinação) para evitar layout shift. Design System 2026 v7.
 */
export default function PatientProfileLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Voltar */}
        <Skeleton className="h-4 w-36" />

        {/* Cabeçalho do paciente: foto + nome + badges */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start gap-5">
          <Skeleton className="h-20 w-20 rounded-2xl shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 max-w-[60vw]" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>

        {/* Grid: Tutor + Próxima Dose */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>

        {/* Histórico de Vacinação */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <SkeletonText lines={2} />
      </main>
    </div>
  )
}
