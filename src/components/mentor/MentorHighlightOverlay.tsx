'use client'

import { useEffect, useRef } from 'react'

// ─── Types (espelhadas na API route) ─────────────────────────────────────────

export interface MentorHighlight {
  selector: string        // valor do data-mentor-step
  message?: string        // tooltip no elemento
  type: 'pulse' | 'border' | 'arrow'
}

// ─── CSS class por tipo ───────────────────────────────────────────────────────

const CLASS_MAP: Record<MentorHighlight['type'], string> = {
  pulse:  'mentor-highlight-pulse',
  border: 'mentor-highlight-border',
  arrow:  'mentor-highlight-arrow',
}

// ─── Tooltip DOM helper ───────────────────────────────────────────────────────

function attachTooltip(el: Element, message: string): () => void {
  const tip = document.createElement('div')
  tip.className = 'mentor-highlight-tooltip'
  tip.textContent = message
  tip.setAttribute('role', 'tooltip')
  document.body.appendChild(tip)

  function position() {
    const r = el.getBoundingClientRect()
    tip.style.left  = `${r.left + window.scrollX + r.width / 2 - tip.offsetWidth / 2}px`
    tip.style.top   = `${r.top  + window.scrollY - tip.offsetHeight - 8}px`
  }

  // Posiciona após o próximo frame (garante que o tooltip já tem tamanho)
  requestAnimationFrame(position)
  window.addEventListener('scroll', position)
  window.addEventListener('resize', position)

  return () => {
    tip.remove()
    window.removeEventListener('scroll', position)
    window.removeEventListener('resize', position)
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MentorHighlightOverlayProps {
  highlights: MentorHighlight[]
  onDismiss: () => void
}

/**
 * G16-3 — MentorHighlightOverlay
 * Aplica classes CSS de highlight em elementos via [data-mentor-step].
 * Auto-remove após 5 segundos ou ao primeiro clique do usuário.
 */
export function MentorHighlightOverlay({ highlights, onDismiss }: MentorHighlightOverlayProps) {
  const cleanupRef = useRef<Array<() => void>>([])

  useEffect(() => {
    if (highlights.length === 0) return

    const cleanup: Array<() => void> = []

    // Aplica highlight em cada elemento
    for (const h of highlights) {
      const el = document.querySelector(`[data-mentor-step="${h.selector}"]`)
      if (!el) continue

      const cls = CLASS_MAP[h.type] ?? CLASS_MAP.pulse
      el.classList.add(cls)

      // Tooltip opcional
      let removeTooltip: (() => void) | null = null
      if (h.message) {
        removeTooltip = attachTooltip(el, h.message)
      }

      cleanup.push(() => {
        el.classList.remove(cls)
        removeTooltip?.()
      })
    }

    cleanupRef.current = cleanup

    // Scroll suave até o primeiro elemento destacado
    const firstSelector = highlights[0]?.selector
    if (firstSelector) {
      const firstEl = document.querySelector(`[data-mentor-step="${firstSelector}"]`)
      if (firstEl) {
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    // Auto-remove após 5 segundos
    const autoTimer = setTimeout(() => {
      cleanup.forEach(fn => fn())
      cleanupRef.current = []
      onDismiss()
    }, 5000)

    // Remove ao primeiro clique em qualquer lugar
    const handleClick = () => {
      clearTimeout(autoTimer)
      cleanup.forEach(fn => fn())
      cleanupRef.current = []
      onDismiss()
    }

    document.addEventListener('click', handleClick, { once: true })

    return () => {
      clearTimeout(autoTimer)
      document.removeEventListener('click', handleClick)
      cleanup.forEach(fn => fn())
      cleanupRef.current = []
    }
  // highlights é passado como nova array em cada resposta — usar JSON.stringify como dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(highlights)])

  // Componente não renderiza nada visível — age apenas via efeitos DOM
  return null
}
