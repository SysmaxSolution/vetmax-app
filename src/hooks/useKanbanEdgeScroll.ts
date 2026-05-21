'use client'

import { useEffect, MutableRefObject } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// useKanbanEdgeScroll
//
// Auto-scroll horizontal de um container quando o usuário arrasta um card
// próximo às bordas esquerda/direita. Imita o comportamento do Trello / Jira.
//
// - Funciona com HTML5 drag-and-drop (`dragover`) E com Pointer events
//   (touch-friendly — o app usa pointer fallback para mobile).
// - Velocidade do scroll é proporcional à proximidade da borda.
// - Para automaticamente quando o drag termina (dragend / pointerup) ou
//   quando o pointer sai da janela.
// ──────────────────────────────────────────────────────────────────────────────

const EDGE_THRESHOLD = 80      // px do pixel mais externo onde o auto-scroll dispara
const MAX_SPEED      = 18      // px por frame no centro da zona de edge

export function useKanbanEdgeScroll<T>(
  containerRef:    MutableRefObject<HTMLDivElement | null>,
  isDraggingRef:   MutableRefObject<T | null>,
) {
  useEffect(() => {
    let raf = 0
    let speed = 0

    const tick = () => {
      const el = containerRef.current
      if (!el || speed === 0) {
        raf = 0
        return
      }
      el.scrollLeft += speed
      raf = requestAnimationFrame(tick)
    }

    const updateSpeed = (clientX: number) => {
      const el = containerRef.current
      if (!el || !isDraggingRef.current) {
        speed = 0
        return
      }
      const rect = el.getBoundingClientRect()
      const fromLeft  = clientX - rect.left
      const fromRight = rect.right - clientX

      if (fromLeft < EDGE_THRESHOLD && fromLeft > -10) {
        const intensity = 1 - Math.max(0, fromLeft) / EDGE_THRESHOLD
        speed = -Math.ceil(intensity * MAX_SPEED)
      } else if (fromRight < EDGE_THRESHOLD && fromRight > -10) {
        const intensity = 1 - Math.max(0, fromRight) / EDGE_THRESHOLD
        speed = Math.ceil(intensity * MAX_SPEED)
      } else {
        speed = 0
      }

      if (speed !== 0 && raf === 0) raf = requestAnimationFrame(tick)
    }

    const onDragOver = (e: DragEvent) => {
      if (!isDraggingRef.current) return
      updateSpeed(e.clientX)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      updateSpeed(e.clientX)
    }
    const stop = () => {
      speed = 0
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
    }

    document.addEventListener('dragover',  onDragOver,    { passive: true })
    document.addEventListener('pointermove', onPointerMove,{ passive: true })
    document.addEventListener('dragend',   stop)
    document.addEventListener('drop',      stop)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)

    return () => {
      stop()
      document.removeEventListener('dragover',    onDragOver)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('dragend',   stop)
      document.removeEventListener('drop',      stop)
      document.removeEventListener('pointerup', stop)
      document.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [containerRef, isDraggingRef])
}
