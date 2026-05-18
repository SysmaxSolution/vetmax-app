'use client'

/**
 * CanvasStage — folha A4/A5 reativa. Renderiza fundo (papel timbrado) +
 * área de conteúdo respeitando margens em cm + cada CanvasElement como
 * Rnd em modo edit (drag/resize) ou DOM puro em modo print.
 *
 * Coordenadas dos elementos em % do canvas. Convertidas para px on-the-fly
 * via ResizeObserver no wrapper (mantém precisão em qualquer DPI).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Rnd } from 'react-rnd'
import type { CanvasElement } from '@/lib/canva/elements'
import {
  pageAspect, pageDimensionsCm, type CanvasState,
} from '@/lib/canva/canvas-state'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'
import { ElementRenderer } from './ElementRenderers'

interface Props {
  state: CanvasState
  selectedId?: string | null
  resolveContext?: ResolveContext
  mode?: 'edit' | 'print'
  onSelect?: (id: string | null) => void
  onElementChange?: (id: string, patch: Partial<CanvasElement>) => void
}

export default function CanvasStage({
  state, selectedId, resolveContext, mode = 'edit', onSelect, onElementChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [stagePx, setStagePx] = useState({ w: 0, h: 0 })

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
  const aspect = pageAspect(state.page)

  const isPrint = mode === 'print'

  const pageStyle: CSSProperties = isPrint
    ? {
        width: `${pageWcm}cm`, height: `${pageHcm}cm`,
        position: 'relative', overflow: 'hidden', background: '#fff',
        breakAfter: 'page', pageBreakAfter: 'always',
      }
    : {
        width: '100%',
        aspectRatio: `${pageWcm} / ${pageHcm}`,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        borderRadius: 6,
        boxShadow: '0 4px 24px rgba(15,23,42,.08)',
      }

  const bg = state.page.backgroundImageUrl

  return (
    <div
      ref={stageRef}
      className="canva-a4-page"
      style={pageStyle}
      onMouseDown={e => {
        // click no fundo deseleciona
        if (e.target === e.currentTarget && onSelect) onSelect(null)
      }}
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

      {/* Elementos */}
      {[...state.elements]
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map(el => (
          <ElementWrapper
            key={el.id}
            element={el}
            stagePx={stagePx}
            isPrint={isPrint}
            isSelected={selectedId === el.id}
            resolveContext={resolveContext}
            onSelect={onSelect}
            onChange={onElementChange}
          />
        ))}
    </div>
  )
}

// ── Wrapper por elemento ─────────────────────────────────────────────────────

interface WrapperProps {
  element: CanvasElement
  stagePx: { w: number; h: number }
  isPrint: boolean
  isSelected: boolean
  resolveContext?: ResolveContext
  onSelect?: (id: string | null) => void
  onChange?: (id: string, patch: Partial<CanvasElement>) => void
}

function ElementWrapper({
  element, stagePx, isPrint, isSelected, resolveContext, onSelect, onChange,
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
      disableDragging={element.locked}
      enableResizing={element.locked ? false : undefined}
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
        cursor: element.locked ? 'not-allowed' : 'move',
      }}
      onMouseDown={(e: any) => {
        e.stopPropagation()
        onSelect?.(element.id)
      }}
    >
      <ElementRenderer element={element} ctx={resolveContext} />
    </Rnd>
  )
}
