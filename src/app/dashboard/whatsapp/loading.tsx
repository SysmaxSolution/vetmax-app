import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton do WhatsApp — título + painel duplo (lista de conversas e área da
 * conversa), na silhueta real da tela. Design System 2026 v7.
 */
export default function WhatsappLoading() {
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 space-y-4">
      {/* Título */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64 max-w-[60vw]" />
          <Skeleton className="h-3.5 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Painel duplo */}
      <div className="grid grid-cols-1 lg:grid-cols-5 rounded-2xl border border-slate-200 bg-white overflow-hidden min-h-[400px]">
        {/* Lista de conversas */}
        <div className="lg:col-span-2 border-r border-slate-200">
          <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-slate-100">
            <Skeleton className="h-6 w-16 rounded-lg" />
            <Skeleton className="h-6 w-16 rounded-lg" />
            <Skeleton className="h-6 w-12 rounded-lg" />
            <Skeleton className="ml-auto h-6 w-20 rounded-lg" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-slate-50">
              <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
        {/* Área da conversa */}
        <div className="lg:col-span-3 hidden lg:flex flex-col items-center justify-center gap-3 p-8">
          <Skeleton variant="circle" className="h-12 w-12" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
    </div>
  )
}
