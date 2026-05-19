'use client'

/**
 * EmojiPicker — popover com catálogo curado para Veterinária e Estética Pet.
 *
 * Categorias clicáveis no topo + busca por palavra-chave PT-BR.
 * onPick recebe o caractere unicode escolhido — o parent insere onde
 * faz sentido (textarea content, prefix/suffix de tag, etc.).
 *
 * Sem dependência de libs externas — Unicode puro, renderiza nativamente.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Smile, X } from 'lucide-react'
import {
  EMOJI_CATEGORIES, emojisByCategory, searchEmojis,
  type EmojiCategoryId, type EmojiDef,
} from '@/lib/canva/vet-emojis'

interface Props {
  onPick: (emoji: string) => void
  /** Posição do popover relativa ao trigger. */
  align?: 'left' | 'right'
}

export default function EmojiPicker({ onPick, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<EmojiCategoryId>('animais')
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const list: EmojiDef[] = useMemo(() => {
    if (query.trim()) return searchEmojis(query)
    return emojisByCategory(active)
  }, [query, active])

  function pick(e: string) {
    onPick(e)
    // Não fecha o popover — permite inserir vários em sequência
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
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

      {open && (
        <div
          className={`absolute z-[120] mt-1 w-[300px] rounded-xl border border-slate-200 bg-white shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header com busca */}
          <header className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-2">
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
            <div className="flex items-center gap-0.5 border-b border-slate-100 px-1 py-1 overflow-x-auto">
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
          <div className="max-h-[240px] overflow-y-auto p-2">
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

          <footer className="border-t border-slate-100 px-2 py-1.5 text-[10px] text-slate-500">
            {query.trim()
              ? `${list.length} resultado${list.length === 1 ? '' : 's'}`
              : `${list.length} emojis nesta categoria · clique para inserir`}
          </footer>
        </div>
      )}
    </div>
  )
}
