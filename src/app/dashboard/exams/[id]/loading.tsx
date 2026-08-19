import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton do laudo (ExamDetail) — header com voltar + badge do módulo,
 * painel de contexto do pet, card do Ditado do Laudo e seção de documentos,
 * na mesma silhueta da tela real. Design System 2026 v7.
 */
export default function ExamDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
      {/* Voltar + badge */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>

      {/* Painel de contexto */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <Skeleton variant="circle" className="h-10 w-10" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
          <SkeletonText lines={4} />
          <SkeletonText lines={4} />
        </div>
      </div>

      {/* Ditado do Laudo */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64 max-w-[60vw]" />
          </div>
        </div>
        <div className="p-6">
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>

      {/* Documentos */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-48 rounded-lg" />
        </div>
        <div className="p-6">
          <SkeletonText lines={2} />
        </div>
      </div>
    </div>
  )
}
