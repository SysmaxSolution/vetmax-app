'use client'

/**
 * CanvasStage — folha A4/A5 reativa. Renderiza fundo (cor + papel timbrado)
 * + área de conteúdo respeitando margens em cm + cada CanvasElement como
 * Rnd em modo edit (drag/resize) ou DOM puro em modo print.
 *
 * Brush strokes (kind='brush_stroke') saem do fluxo do Rnd e vivem numa
 * camada SVG separada — assim:
 *   - O hit-test é apenas o próprio traço (pointer-events: stroke)
 *   - O resto da página fica livre para seleção dos outros elementos
 *   - Em modo brush (brush.active), o stage captura mouse events para
 *     desenhar novos traços; outros eventos ficam suspensos.
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Rnd } from 'react-rnd'
import type { CanvasElement, BrushStrokeElement } from '@/lib/canva/elements'
import {
  pageDimensionsCm, type CanvasState,
} from '@/lib/canva/canvas-state'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'
import { ElementRenderer } from './ElementRenderers'

export interface BrushSettings {
  color: string
  size: number    // px
  opacity?: number
}

interface Props {
  state: CanvasState
  selectedId?: string | null
  resolveContext?: ResolveContext
  mode?: 'edit' | 'print'
  /** Quando setado, o stage captura mouse events e desenha traços
   *  livres em vez de selecionar/arrastar elementos. */
  brush?: BrushSettings | null
  onSelect?: (id: string | null) => void
  onElementChange?: (id: string, patch: Partial<CanvasElement>) => void
  onBrushStrokeComplete?: (points: Array<{ x: number; y: number }>, settings: BrushSettings) => void
}

export default function CanvasStage({
  state, selectedId, resolveContext, mode = 'edit', brush,
  onSelect, onElementChange, onBrushStrokeComplete,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [stagePx, setStagePx] = useState({ w: 0, h: 0 })

  // Traço sendo desenhado neste momento (vivo durante pointer move)
  const [draftStroke, setDraftStroke] = useState<Array<{ x: number; y: number }> | null>(null)
  const draftRef = useRef<Array<{ x: number; y: number }> | null>(null)

  useEffect(() => {
    if (!stageRef.current || mode === 'print') return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) setStagePx({ w: r.width, h: r.height })
    })
    ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [mode])

  const { w: pageWcm, h: pageHcm } = pageDimensionsCm(state.page)
  const isPrint = mode === 'print'
  const pageBg = state.page.backgroundColor || '#fff'

  const pageStyle: CSSProperties = isPrint
    ? {
        width: `${pageWcm}cm`, height: `${pageHcm}cm`,
        position: 'relative', overflow: 'hidden', background: pageBg,
        breakAfter: 'page', pageBreakAfter: 'always',
      }
    : {
        width: '100%',
        aspectRatio: `${pageWcm} / ${pageHcm}`,
        position: 'relative',
        overflow: 'hidden',
        background: pageBg,
        borderRadius: 6,
        boxShadow: '0 4px 24px rgba(15,23,42,.08)',
        cursor: brush ? 'crosshair' : undefined,
      }

  const bg = state.page.backgroundImageUrl

  // ── Brush handlers ─────────────────────────────────────────────────────────

  function pointInPct(e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!brush || isPrint) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = pointInPct(e)
    if (!p) return
    draftRef.current = [p]
    setDraftStroke([p])
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!brush || isPrint || !draftRef.current) return
    const p = pointInPct(e)
    if (!p) return
    const last = draftRef.current[draftRef.current.length - 1]
    // Throttling por distância mínima — evita pontos demais (e arquivos gigantes)
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.2) return
    const next = [...draftRef.current, p]
    draftRef.current = next
    setDraftStroke(next)
  }

  function handlePointerUp(_e: ReactPointerEvent<HTMLDivElement>) {
    if (!brush || isPrint || !draftRef.current) return
    const points = draftRef.current
    draftRef.current = null
    setDraftStroke(null)
    if (points.length > 1) {
      onBrushStrokeComplete?.(points, brush)
    }
  }

  // Separa brush strokes (vão na camada SVG) dos demais elementos (Rnd)
  const brushStrokes = state.elements.filter((el): el is BrushStrokeElement => el.kind === 'brush_stroke')
  const otherElements = state.elements.filter(el => el.kind !== 'brush_stroke')

  return (
    <div
      ref={stageRef}
      className="canva-a4-page"
      style={pageStyle}
      onMouseDown={e => {
        if (brush) return
        if (e.target === e.currentTarget && onSelect) onSelect(null)
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {bg && (
        <img
          src={bg}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            userSelect: 'none', pointerEvents: 'none',
          }}
        />
      )}

      {/* Guide de margens (apenas em modo edit) */}
      {!isPrint && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top:    `${(state.page.margins.top    / pageHcm) * 100}%`,
            bottom: `${(state.page.margins.bottom / pageHcm) * 100}%`,
            left:   `${(state.page.margins.left   / pageWcm) * 100}%`,
            right:  `${(state.page.margins.right  / pageWcm) * 100}%`,
            outline: '1px dashed rgba(124,58,237,0.35)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Brush strokes — SVG overlay separado, com hit-test apenas no stroke */}
      <BrushLayer
        strokes={brushStrokes}
        draft={draftStroke}
        draftSettings={brush}
        isPrint={isPrint}
        selectedId={selectedId}
        brushActive={!!brush}
        onSelect={onSelect}
      />

      {/* Outros elementos */}
      {[...otherElements]
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map(el => (
          <ElementWrapper
            key={el.id}
            element={el}
            stagePx={stagePx}
            isPrint={isPrint}
            isSelected={selectedId === el.id}
            resolveContext={resolveContext}
            brushActive={!!brush}
            onSelect={onSelect}
            onChange={onElementChange}
          />
        ))}
    </div>
  )
}

// ── BrushLayer ───────────────────────────────────────────────────────────────

interface BrushLayerProps {
  strokes: BrushStrokeElement[]
  draft: Array<{ x: number; y: number }> | null
  draftSettings?: BrushSettings | null
  isPrint: boolean
  selectedId?: string | null
  brushActive: boolean
  onSelect?: (id: string | null) => void
}

function BrushLayer({
  strokes, draft, draftSettings, isPrint, selectedId, brushActive, onSelect,
}: BrushLayerProps) {
  if (strokes.length === 0 && !draft) return null
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: brushActive ? 'none' : 'auto',
        // O SVG inteiro não captura — só os <polyline stroke="..."> capturam
      }}
    >
      {strokes.map(s => {
        const isSelected = selectedId === s.id
        return (
          <polyline
            key={s.id}
            points={s.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={s.strokeColor}
            strokeWidth={s.strokeWidth / 10}  // 1px no canvas ≈ 0.1 unidades do viewBox 100×100
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.opacity ?? 1}
            style={{
              pointerEvents: isPrint || brushActive ? 'none' : 'stroke',
              cursor: brushActive ? 'crosshair' : 'pointer',
              filter: isSelected
                ? 'drop-shadow(0 0 1px rgba(124,58,237,0.9)) drop-shadow(0 0 1px rgba(124,58,237,0.9))'
                : undefined,
            }}
            onMouseDown={e => {
              if (brushActive) return
              e.stopPropagation()
              onSelect?.(s.id)
            }}
          />
        )
      })}

      {/* Traço sendo desenhado (live preview) */}
      {draft && draftSettings && (
        <polyline
          points={draft.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={draftSettings.color}
          strokeWidth={draftSettings.size / 10}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={draftSettings.opacity ?? 1}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  )
}

// ── Element wrapper (Rnd) ────────────────────────────────────────────────────

interface WrapperProps {
  element: CanvasElement
  stagePx: { w: number; h: number }
  isPrint: boolean
  isSelected: boolean
  resolveContext?: ResolveContext
  brushActive: boolean
  onSelect?: (id: string | null) => void
  onChange?: (id: string, patch: Partial<CanvasElement>) => void
}

function ElementWrapper({
  element, stagePx, isPrint, isSelected, resolveContext, brushActive, onSelect, onChange,
}: WrapperProps) {
  const transform = element.rotation ? `rotate(${element.rotation}deg)` : undefined

  // Modo print → DOM puro com posicionamento absoluto em %
  if (isPrint) {
    return (
      <div
        style={{
          position: 'absolute',
          left:   `${element.box.x}%`,
          top:    `${element.box.y}%`,
          width:  `${element.box.w}%`,
          height: `${element.box.h}%`,
          zIndex: element.zIndex ?? 1,
          transform,
          transformOrigin: 'top left',
        }}
      >
        <ElementRenderer element={element} ctx={resolveContext} isPrint />
      </div>
    )
  }

  // Modo edit → Rnd em px (convertendo %↔px via stagePx)
  const xPx = (element.box.x / 100) * stagePx.w
  const yPx = (element.box.y / 100) * stagePx.h
  const wPx = (element.box.w / 100) * stagePx.w
  const hPx = (element.box.h / 100) * stagePx.h

  return (
    <Rnd
      size={{ width: wPx, height: hPx }}
      position={{ x: xPx, y: yPx }}
      disableDragging={element.locked || brushActive}
      enableResizing={element.locked || brushActive ? false : undefined}
      bounds="parent"
      onDragStop={(_, d) => {
        if (!onChange) return
        onChange(element.id, {
          box: {
            ...element.box,
            x: stagePx.w ? (d.x / stagePx.w) * 100 : element.box.x,
            y: stagePx.h ? (d.y / stagePx.h) * 100 : element.box.y,
          },
        } as Partial<CanvasElement>)
      }}
      onResizeStop={(_, __, ref, ___, pos) => {
        if (!onChange) return
        onChange(element.id, {
          box: {
            x: stagePx.w ? (pos.x / stagePx.w) * 100 : element.box.x,
            y: stagePx.h ? (pos.y / stagePx.h) * 100 : element.box.y,
            w: stagePx.w ? (ref.offsetWidth  / stagePx.w) * 100 : element.box.w,
            h: stagePx.h ? (ref.offsetHeight / stagePx.h) * 100 : element.box.h,
          },
        } as Partial<CanvasElement>)
      }}
      style={{
        zIndex: element.zIndex ?? 1,
        transform,
        transformOrigin: 'top left',
        outline: isSelected ? '2px solid #7c3aed' : '1px dashed rgba(15,23,42,0.18)',
        outlineOffset: 0,
        cursor: brushActive ? 'crosshair' : (element.locked ? 'not-allowed' : 'move'),
        pointerEvents: brushActive ? 'none' : undefined,
      }}
      onMouseDown={(e: any) => {
        if (brushActive) return
        e.stopPropagation()
        onSelect?.(element.id)
      }}
    >
      <ElementRenderer element={element} ctx={resolveContext} />
    </Rnd>
  )
}
