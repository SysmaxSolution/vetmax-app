import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do dashboard de Direitos LGPD do tutor — mesma silhueta da tela
 * real (cabeçalho com ícone, abas e cards de conteúdo) para evitar layout
 * shift. Design System 2026 v7.
 */
export default function TutorRightsLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cabeçalho */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="mb-3 h-3.5 w-16" />
          <div className="flex items-start gap-4">
            <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-48 max-w-[60vw]" />
              <Skeleton className="h-3.5 w-64 max-w-[70vw]" />
              <div className="flex gap-2 pt-0.5">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-36 hidden sm:block" />
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="max-w-4xl mx-auto flex gap-1 py-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      {/* Conteúdo: Dados Pessoais + Direitos */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <Skeleton className="mb-4 h-4 w-64 max-w-[70vw]" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
