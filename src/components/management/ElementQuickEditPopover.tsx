'use client'

/**
 * Popover flutuante de edicao rapida de um overlay/LayoutElement.
 * Aparece imediatamente ao clicar num elemento no editor, oferecendo
 * os controles principais sem precisar olhar pro painel lateral.
 *
 * Posicionamento: dentro do canvas (position absolute), preferindo acima
 * do elemento. Se nao couber no topo, posiciona abaixo.
 *
 * Drag de movimentacao continua sendo direto no Rnd (clica e arrasta).
 */

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import {
  Trash2, Bold, AlignLeft, AlignCenter, AlignRight, CopyPlus, X as XIcon,
} from 'lucide-react'
import type { LayoutElement } from './TemplateLayoutEditor'

interface ElementQuickEditPopoverProps {
  element: LayoutElement
  // Posicao do elemento em px dentro do canvas (calculada pelo pai)
  elementPx: { x: number; y: number; width: number; height: number }
  canvasSize: { width: number; height: number }
  onChange: (updates: Partial<LayoutElement>) => void
  onDelete: () => void
  onClose: () => void
  // Opcional: repetir em todas as paginas (so mostra se houver >1 pg)
  pageCount?: number
  onRepeatOnAllPages?: () => void
}

const POPOVER_W = 290
const POPOVER_H_ESTIMATE = 165
const GAP = 8   // espaco entre elemento e popover

export default function ElementQuickEditPopover({
  element,
  elementPx,
  canvasSize,
  onChange,
  onDelete,
  onClose,
  pageCount,
  onRepeatOnAllPages,
}: ElementQuickEditPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  // Posicionamento inteligente: tenta acima do elemento; se nao couber, abaixo;
  // x: alinha com x do elemento mas clampa ao canvas
  useLayoutEffect(() => {
    const elTop = elementPx.y
    const elBottom = elementPx.y + elementPx.height
    const fitsAbove = elTop - GAP - POPOVER_H_ESTIMATE >= 0
    const top = Math.round(fitsAbove
      ? elTop - GAP - POPOVER_H_ESTIMATE
      : elBottom + GAP)

    const desiredLeft = elementPx.x
    const maxLeft = Math.max(0, canvasSize.width - POPOVER_W - 4)
    const left = Math.round(Math.max(4, Math.min(desiredLeft, maxLeft)))

    // Threshold: nao atualiza se o delta e sub-pixel (evita cascata de
    // re-renders quando o canvas tem dimensoes fracionarias)
    setPosition(prev => {
      if (prev && Math.abs(prev.left - left) < 1 && Math.abs(prev.top - top) < 1) {
        return prev
      }
      return { left, top }
    })
  }, [elementPx.x, elementPx.y, elementPx.width, elementPx.height, canvasSize.width])

  // Fecha com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click fora fecha — captura no document mas ignora cliques dentro do popover
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!popoverRef.current) return
      const target = e.target as Node
      if (popoverRef.current.contains(target)) return
      // Ignora cliques em outros elementos Rnd (eles tem data-rnd ou role similar)
      // O fechamento natural via "selectedId muda" e feito pelo pai.
      // Aqui so fechamos se clicou em area neutra (canvas vazio)
      const targetEl = target as HTMLElement
      if (targetEl.closest?.('[data-popover-keep-open]')) return
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [onClose])

  if (!position) return null

  const isField = element.type === 'field'
  const round2 = (n: number) => Math.round(n * 100) / 100

  const showRepeatBtn =
    !!onRepeatOnAllPages && pageCount !== undefined && pageCount > 1

  return (
    <div
      ref={popoverRef}
      data-popover-keep-open
      className="absolute bg-white shadow-2xl rounded-xl border border-slate-200 p-3 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: position.left,
        top: position.top,
        width: POPOVER_W,
        zIndex: 60,
      }}
      onMouseDown={(e) => e.stopPropagation()}  // nao deseleciona ao clicar dentro
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header — nome + botao fechar/delete */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={
            'inline-block w-2 h-2 rounded-full ' +
            (element.type === 'field' ? 'bg-blue-500'
              : element.type === 'text' ? 'bg-slate-400'
              : element.type === 'logo' ? 'bg-amber-500'
              : 'bg-green-500')
          } />
          <span className="text-xs font-semibold text-slate-800 truncate">
            {element.label || (isField ? element.field_name : 'Elemento')}
          </span>
          {isField && element.field_name && (
            <span className="text-[10px] font-mono text-slate-400 truncate">
              {`{{${element.field_name}}}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onDelete}
            title="Deletar elemento"
            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Linha 1: tamanho fonte + bold + alinhamento */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded">
          <span className="text-[10px] text-slate-500 font-medium">Aa</span>
          <input
            type="number"
            min={6}
            max={48}
            step={0.5}
            value={element.fontSize}
            onChange={e => onChange({ fontSize: Number(e.target.value) })}
            className="w-10 text-xs bg-transparent border-0 focus:outline-none text-center text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
          title="Negrito"
          className={
            'p-1.5 rounded border transition-colors ' +
            (element.fontWeight === 'bold'
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50')
          }
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-0 ml-auto border border-slate-200 rounded overflow-hidden">
          {(['left', 'center', 'right'] as const).map(a => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
            return (
              <button
                key={a}
                type="button"
                onClick={() => onChange({ textAlign: a })}
                title={a}
                className={
                  'p-1.5 ' +
                  (element.textAlign === a
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-50')
                }
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Linha 2: X / Y / W / H em % (ou px no modo legado) */}
      <div className="grid grid-cols-4 gap-1.5">
        <div>
          <label className="text-[9px] font-medium text-slate-500 uppercase">X</label>
          <input
            type="number"
            value={round2(element.x)}
            min={0}
            step={element.unit === 'pct' ? 0.5 : 1}
            onChange={e => onChange({ x: Number(e.target.value) })}
            className="mt-0.5 w-full px-1.5 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-[9px] font-medium text-slate-500 uppercase">Y</label>
          <input
            type="number"
            value={round2(element.y)}
            min={0}
            step={element.unit === 'pct' ? 0.5 : 1}
            onChange={e => onChange({ y: Number(e.target.value) })}
            className="mt-0.5 w-full px-1.5 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-[9px] font-medium text-slate-500 uppercase">W</label>
          <input
            type="number"
            value={round2(element.width)}
            min={1}
            step={element.unit === 'pct' ? 0.5 : 1}
            onChange={e => onChange({ width: Number(e.target.value) })}
            className="mt-0.5 w-full px-1.5 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-[9px] font-medium text-slate-500 uppercase">H</label>
          <input
            type="number"
            value={round2(element.height)}
            min={1}
            step={element.unit === 'pct' ? 0.5 : 1}
            onChange={e => onChange({ height: Number(e.target.value) })}
            className="mt-0.5 w-full px-1.5 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Label & content (so para text/field) */}
      {(element.type === 'field' || element.type === 'text') && (
        <div className="mt-2">
          <label className="text-[9px] font-medium text-slate-500 uppercase">
            {element.type === 'text' ? 'Conteudo' : 'Label'}
          </label>
          {element.type === 'text' ? (
            <textarea
              value={element.content || ''}
              onChange={e => onChange({ content: e.target.value })}
              rows={2}
              className="mt-0.5 w-full px-2 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          ) : (
            <input
              type="text"
              value={element.label}
              onChange={e => onChange({ label: e.target.value })}
              className="mt-0.5 w-full px-2 py-1 text-xs text-slate-800 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
        </div>
      )}

      {/* Repetir em todas as paginas (opcional) */}
      {showRepeatBtn && (
        <button
          type="button"
          onClick={onRepeatOnAllPages}
          title="Cria copias deste elemento nas demais paginas, mantendo as coordenadas"
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          <CopyPlus className="w-3.5 h-3.5" />
          Repetir em todas as paginas
        </button>
      )}

      {/* Hint */}
      <p className="text-[10px] text-slate-400 mt-2 leading-snug">
        <strong>Mover:</strong> clique e arraste o campo. <strong>Esc</strong> fecha.
      </p>
    </div>
  )
}
