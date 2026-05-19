'use client'

/**
 * EmojiPicker — popover com catálogo curado para Veterinária e Estética Pet.
 *
 * Renderizado via Portal direto no document.body com position: fixed —
 * evita ser clipado por containers com overflow: auto (PropertiesPanel,
 * modals, etc.). Calcula a posição a partir do bounding rect do trigger
 * e faz "flip" automático para a esquerda quando perto da borda direita.
 *
 * onPick recebe o caractere unicode escolhido — o parent insere onde
 * faz sentido (textarea content, prefix/suffix de tag, etc.).
 *
 * Sem dependência de libs externas — Unicode puro, renderiza nativamente.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Smile, X } from 'lucide-react'
import {
  EMOJI_CATEGORIES, emojisByCategory, searchEmojis,
  type EmojiCategoryId, type EmojiDef,
} from '@/lib/canva/vet-emojis'

interface Props {
  onPick: (emoji: string) => void
  /** Posição preferencial do popover relativa ao trigger.
   *  Auto-ajusta se não couber na viewport. */
  align?: 'left' | 'right'
}

const POPOVER_WIDTH = 300
const POPOVER_MAX_HEIGHT = 420
const GAP = 4

export default function EmojiPicker({ onPick, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<EmojiCategoryId>('animais')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  /** Calcula posição do popover relativa à viewport. Auto-flip
   *  horizontal/vertical se não couber. */
  function calculatePosition() {
    const trigger = triggerRef.current
    if (!trigger) return null
    const rect = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Horizontal: prefer align indicado, mas flipa se ultrapassar borda
    let left: number
    if (align === 'right') {
      // alinha a borda direita do popover com a borda direita do trigger
      left = rect.right - POPOVER_WIDTH
      // se passar da borda esquerda do viewport, alinha à borda esquerda do trigger
      if (left < 8) left = rect.left
    } else {
      left = rect.left
      if (left + POPOVER_WIDTH > vw - 8) left = rect.right - POPOVER_WIDTH
    }
    // Clamp final
    left = Math.max(8, Math.min(left, vw - POPOVER_WIDTH - 8))

    // Vertical: abre abaixo se couber, senão acima
    let top = rect.bottom + GAP
    if (top + POPOVER_MAX_HEIGHT > vh - 8) {
      const aboveTop = rect.top - POPOVER_MAX_HEIGHT - GAP
      if (aboveTop > 8) top = aboveTop
      else top = Math.max(8, vh - POPOVER_MAX_HEIGHT - 8)
    }
    return { top, left }
  }

  // Atualiza posição quando abre
  useLayoutEffect(() => {
    if (open) setPos(calculatePosition())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Reposiciona em scroll/resize
  useEffect(() => {
    if (!open) return
    function update() {
      const next = calculatePosition()
      if (next) setPos(next)
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Fecha ao clicar fora (popover OU trigger)
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(t) &&
        triggerRef.current && !triggerRef.current.contains(t)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Fecha com ESC
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const list: EmojiDef[] = useMemo(() => {
    if (query.trim()) return searchEmojis(query)
    return emojisByCategory(active)
  }, [query, active])

  function pick(e: string) {
    onPick(e)
    // Não fecha o popover — permite inserir vários em sequência
  }

  const popover = open && pos ? (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 9999,
      }}
      className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
    >
      {/* Header com busca */}
      <header className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar (ex: cao, vacina, banho)"
            className="w-full rounded border border-slate-200 pl-7 pr-2 py-1 text-[11px] focus:border-violet-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 text-slate-400 hover:text-slate-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Tabs por categoria (escondidos quando há busca) */}
      {!query.trim() && (
        <div className="flex items-center gap-0.5 border-b border-slate-100 px-1 py-1 overflow-x-auto flex-shrink-0">
          {EMOJI_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              title={c.label}
              className={`flex-shrink-0 rounded px-1.5 py-1 text-base ${
                active === c.id
                  ? 'bg-violet-100 ring-1 ring-violet-300'
                  : 'hover:bg-slate-100'
              }`}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {list.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-500">
            Nenhum emoji para &quot;{query}&quot;
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {list.map(e => (
              <button
                key={`${e.emoji}-${e.cat}`}
                onClick={() => pick(e.emoji)}
                title={e.kw[0] ?? e.emoji}
                className="flex h-8 items-center justify-center rounded text-lg hover:bg-violet-100"
              >
                {e.emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-100 px-2 py-1.5 text-[10px] text-slate-500 flex-shrink-0">
        {query.trim()
          ? `${list.length} resultado${list.length === 1 ? '' : 's'}`
          : `${list.length} emojis · clique para inserir · ESC fecha`}
      </footer>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Inserir emoji ou símbolo (veterinária e estética)"
        className={`flex items-center justify-center rounded border px-1.5 py-0.5 text-[11px] ${
          open
            ? 'border-violet-500 bg-violet-50 text-violet-700'
            : 'border-slate-300 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-700'
        }`}
      >
        <Smile className="w-3.5 h-3.5" />
      </button>
      {typeof document !== 'undefined' && popover && createPortal(popover, document.body)}
    </>
  )
}
