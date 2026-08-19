import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Skeleton do prontuário (ConsultationDetail) — header com voltar + badges,
 * painel de contexto do pet e card do Prontuário Veterinário com textarea
 * grande, na mesma silhueta da tela real. Design System 2026 v7.
 */
export default function VetConsultationLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
      {/* Voltar + badges de status */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      {/* Painel de contexto: pet + tutor + vitais */}
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

      {/* Prontuário Veterinário: header + textarea grande + barra de ações */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-64 max-w-[60vw]" />
          </div>
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-56 w-full rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-44 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Serviços lançados */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  )
}
