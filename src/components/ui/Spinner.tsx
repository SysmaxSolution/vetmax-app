/**
 * Spinner — indicador de progresso compartilhado do Design System 2026.
 *
 * Substitui o padrão inline `animate-spin rounded-full border-2 ...` copiado
 * pelas telas. Herda a cor do texto (currentColor): num botão primário fica
 * branco, num link teal fica teal — sem prop de cor.
 *
 * Uso:
 *   <Spinner />                        // 16px, para botões
 *   <Spinner size="lg" />              // 32px, para telas/seções
 *   <button disabled>{saving ? <Spinner /> : null} Salvar</button>
 */

const SIZES = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-4 w-4 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const

export function Spinner({
  size = 'md',
  className = '',
  label = 'Carregando…',
}: {
  size?: keyof typeof SIZES
  className?: string
  label?: string
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${SIZES[size]} ${className}`}
    />
  )
}
