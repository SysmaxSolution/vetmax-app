/**
 * Skeleton — placeholder de carregamento do Design System 2026.
 *
 * Shimmer definido em globals.css (.ds-skeleton), compositor-only e com
 * fallback estático para prefers-reduced-motion. Use skeletons com a MESMA
 * silhueta do conteúdo real (evita layout shift na troca).
 *
 * Uso:
 *   <Skeleton className="h-4 w-40" />               // linha de texto
 *   <Skeleton variant="circle" className="h-10 w-10" />
 *   <SkeletonText lines={3} />
 *   <SkeletonCard />                                  // card padrão
 */

interface SkeletonProps {
  className?: string
  variant?: 'rect' | 'circle'
}

export function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`ds-skeleton ${variant === 'circle' ? 'rounded-full' : ''} ${className}`}
    />
  )
}

/** Bloco de linhas de texto — a última linha é mais curta, como texto real. */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

/** Card no padrão de superfície do sistema (rounded-xl border bg-white). */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
      <SkeletonText lines={2} className="mt-4" />
    </div>
  )
}

/** Linha de tabela — para listas densas (recepção, caixa, financeiro). */
export function SkeletonRow({
  cols = 4,
  className = '',
}: {
  cols?: number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-4 border-b border-slate-100 px-4 py-3 ${className}`}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === 0 ? 'w-1/4' : 'flex-1'}`} />
      ))}
    </div>
  )
}
