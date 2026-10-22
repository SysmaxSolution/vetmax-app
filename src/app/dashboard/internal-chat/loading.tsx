import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do Chat Interno — título + painel duplo (lista de salas e área de
 * mensagens), na silhueta real do workspace. Design System 2026 v7.
 */
export default function InternalChatLoading() {
  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 py-6 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-[60vw]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 rounded-2xl border border-slate-200 bg-white overflow-hidden min-h-[420px]">
        {/* Lista de salas */}
        <div className="border-r border-slate-200">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100">
            <Skeleton className="h-8 flex-1 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-slate-50">
              <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        {/* Área de mensagens */}
        <div className="lg:col-span-2 hidden lg:flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <Skeleton variant="circle" className="h-8 w-8" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex-1 p-4 space-y-3">
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
            <Skeleton className="h-10 w-1/2 rounded-2xl ml-auto" />
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
          </div>
          <div className="flex items-end gap-2 border-t border-slate-100 p-3">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
