import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton do Meu Perfil — título, card de foto e cards de formulário, na
 * silhueta real da página. Design System 2026 v7.
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3.5 w-64 max-w-[60vw]" />
      </div>

      <div className="space-y-5">
        {/* Foto + nome */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 flex items-center gap-5">
          <Skeleton variant="circle" className="h-20 w-20 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48 max-w-[50vw]" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>

        {/* Dados pessoais */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Dados profissionais */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <Skeleton className="h-4 w-40" />
          <SkeletonText lines={2} />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
