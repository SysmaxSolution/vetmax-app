'use client'

import { useCallback, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Move, RotateCcw } from 'lucide-react'

interface Props {
  imageUrl: string
  /** 0-100 (%) — posição horizontal */
  positionX: number
  /** 0-100 (%) — posição vertical */
  positionY: number
  /** 1.0-3.0 — escala (1 = cover natural) */
  scale: number
  onChange: (next: { positionX: number; positionY: number; scale: number }) => void
}

const MIN_SCALE = 1.0
const MAX_SCALE = 3.0

/**
 * Editor de posicionamento e zoom do fundo de tela.
 *
 * - Preview 16:9 reflete o comportamento real do background-size + position.
 * - Mouse: clica e arrasta para mover; roda do mouse / pinça (Ctrl+wheel) controla zoom.
 * - Touch (mobile): arrasta com 1 dedo para mover; pinça com 2 dedos para zoom.
 * - Slider de zoom como alternativa acessível.
 */
export function BackgroundImageAdjuster({
  imageUrl, positionX, positionY, scale, onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Estado interno do drag/pinch — não dispara re-render por movimento.
  const dragRef = useRef<{
    startX: number
    startY: number
    startPosX: number
    startPosY: number
  } | null>(null)

  // Pinch state (touch 2 dedos)
  const pinchRef = useRef<{
    startDistance: number
    startScale:    number
  } | null>(null)

  const [, setRender] = useState(0)
  const force = useCallback(() => setRender(n => n + 1), [])

  // ── Conversão pixel → percent (% de posição que move 1px do mouse) ──────────
  function pxToPct(deltaPx: number, axis: 'x' | 'y') {
    const el = containerRef.current
    if (!el) return 0
    const dim = axis === 'x' ? el.clientWidth : el.clientHeight
    if (!dim) return 0
    // Sensibilidade: mover 1px do preview move proporcionalmente em %.
    // Multiplicador ajusta com o scale — em zoom alto, 1px equivale a mais % move.
    return (deltaPx / dim) * 100 * scale
  }

  function clamp01(v: number) { return Math.max(0, Math.min(100, v)) }
  function clampScale(v: number) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, v)) }

  // ── Pointer (mouse + touch unificado) ───────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    // Ignora se já estiver pinching
    if (pinchRef.current) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: positionX, startPosY: positionY,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || pinchRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    // Sinal negativo: arrastar para a direita move a imagem para esquerda
    // (= aumentar position-x mostra parte mais à direita da imagem).
    const newX = clamp01(dragRef.current.startPosX - pxToPct(dx, 'x'))
    const newY = clamp01(dragRef.current.startPosY - pxToPct(dy, 'y'))
    onChange({ positionX: newX, positionY: newY, scale })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  // ── Touch pinch (2 dedos) ───────────────────────────────────────────────────
  function distance(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.hypot(dx, dy)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      dragRef.current = null
      pinchRef.current = {
        startDistance: distance(e.touches[0], e.touches[1]),
        startScale:    scale,
      }
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return
    e.preventDefault()
    const d = distance(e.touches[0], e.touches[1])
    const ratio = d / pinchRef.current.startDistance
    const newScale = clampScale(pinchRef.current.startScale * ratio)
    onChange({ positionX, positionY, scale: newScale })
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null
  }

  // ── Mouse wheel + Ctrl para zoom (desktop) ──────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    onChange({ positionX, positionY, scale: clampScale(scale * factor) })
  }

  // ── Slider acessível ────────────────────────────────────────────────────────
  const onScaleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ positionX, positionY, scale: clampScale(parseFloat(e.target.value)) })
  }

  function handleReset() {
    onChange({ positionX: 50, positionY: 50, scale: 1.0 })
    force()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const sizePct = Math.round(scale * 100)
  const previewStyle: React.CSSProperties = {
    backgroundImage:    `url("${imageUrl}")`,
    backgroundSize:     `${sizePct}% auto`,
    backgroundPosition: `${positionX}% ${positionY}%`,
    backgroundRepeat:   'no-repeat',
    backgroundColor:    '#f1f5f9',
  }

  return (
    <div className="space-y-3">
      {/* Preview interativo */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        className="relative w-full aspect-[16/9] rounded-xl border border-slate-200 shadow-inner cursor-grab active:cursor-grabbing touch-none select-none overflow-hidden"
        style={previewStyle}
      >
        <div className="absolute inset-0 pointer-events-none flex items-end justify-center bg-gradient-to-t from-black/30 via-transparent to-transparent">
          <div className="m-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 backdrop-blur rounded-lg shadow text-[11px] font-medium text-slate-700">
            <Move className="h-3 w-3" />
            <span className="hidden sm:inline">Arraste para mover · Ctrl+roda ou pinça para zoom</span>
            <span className="sm:hidden">Arraste · pinça para zoom</span>
          </div>
        </div>
      </div>

      {/* Slider zoom + reset */}
      <div className="flex items-center gap-3 px-1">
        <ZoomOut className="h-4 w-4 text-slate-400" />
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={scale}
          onChange={onScaleSlider}
          className="flex-1 accent-slate-900"
        />
        <ZoomIn className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-mono text-slate-600 min-w-[3ch] text-right">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Centralizar e remover zoom"
        >
          <RotateCcw className="h-3 w-3" />
          Padrão
        </button>
      </div>
    </div>
  )
}
