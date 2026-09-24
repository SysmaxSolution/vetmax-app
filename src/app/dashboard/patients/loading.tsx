import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton da lista de Pacientes — mesma silhueta da tela real (cabeçalho com
 * ação, abas Ativos/Arquivados, busca e cards de paciente) para evitar layout
 * shift na troca. Design System 2026 v7.
 */
export default function PatientsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Cabeçalho: título + botão Novo Paciente */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-64 max-w-[60vw]" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Abas Ativos / Arquivados */}
      <div className="mb-5 flex items-center gap-2 border-b border-slate-200 pb-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>

      {/* Busca */}
      <Skeleton className="mb-6 h-11 w-full" />

      {/* Cards de paciente */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          >
            <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-52 max-w-[50vw]" />
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
