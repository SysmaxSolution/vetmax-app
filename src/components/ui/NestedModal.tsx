'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Modal aninhado: abre como overlay POR CIMA de um modal pai existente
 * (z-index alto + backdrop blur). ESC fecha SÓ o modal do topo (stopPropagation).
 * Focus trap leve: foca o primeiro elemento focável ao abrir e devolve foco ao
 * elemento que disparou a abertura ao fechar.
 */
interface Props {
  open:      boolean
  onClose:   () => void
  title:     ReactNode
  children:  ReactNode
  /** Largura máxima do diálogo (Tailwind). Default: max-w-md. */
  maxWidth?: string
  /** Override do data-testid raiz (default: nested-modal). */
  testId?:   string
}

export default function NestedModal({ open, onClose, title, children, maxWidth = 'max-w-md', testId = 'nested-modal' }: Props) {
  const dialogRef     = useRef<HTMLDivElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null)
    // Foca o primeiro elemento focável dentro do diálogo.
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Para o pai não receber o ESC e fechar também.
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true) // capture: prioridade sobre o pai
    return () => {
      document.removeEventListener('keydown', onKey, true)
      lastFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog" aria-modal="true" data-testid={testId}
      className="fixed inset-0 z-[10100] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={dialogRef} className={`w-full ${maxWidth} bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <button type="button" onClick={onClose} data-testid={`${testId}-close`} className="rounded-full p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
