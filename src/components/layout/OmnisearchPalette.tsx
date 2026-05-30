'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, PawPrint, User, FileText } from 'lucide-react'
import { omnisearch, type OmnisearchHit } from '@/lib/actions/omnisearch'

const KIND_ICON = {
  patient:      PawPrint,
  tutor:        User,
  consultation: FileText,
} as const

const KIND_LABEL = {
  patient:      'Pet',
  tutor:        'Tutor',
  consultation: 'Atendimento',
} as const

const KIND_COLOR = {
  patient:      'bg-blue-100 text-blue-700',
  tutor:        'bg-emerald-100 text-emerald-700',
  consultation: 'bg-violet-100 text-violet-700',
} as const

/**
 * Command palette global (Ctrl/Cmd+K). Mantém estado próprio — o trigger
 * no header só abre a paleta. Resultado de busca debounced em 250ms.
 */
export default function OmnisearchPalette({
  open, onClose,
}: {
  open:    boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [query,   setQuery]   = useState('')
  const [hits,    setHits]    = useState<OmnisearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setHits([])
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounce busca
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const res = await omnisearch(trimmed)
      setLoading(false)
      if (Array.isArray(res)) {
        setHits(res)
        setHighlight(0)
      } else {
        setHits([])
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const handlePick = useCallback((hit: OmnisearchHit) => {
    router.push(hit.href)
    onClose()
  }, [router, onClose])

  // Teclas: Esc fecha, Setas navegam, Enter abre
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, hits.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return }
      if (e.key === 'Enter') {
        if (hits[highlight]) { e.preventDefault(); handlePick(hits[highlight]) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, hits, highlight, onClose, handlePick])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
      className="fixed inset-0 z-[10050] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm px-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar pet, tutor ou ID de atendimento…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
            Esc
          </kbd>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              <Search className="h-8 w-8 mx-auto mb-3 text-slate-200" />
              Digite ao menos 2 caracteres para buscar
              <p className="text-xs mt-2 text-slate-400">
                Use as setas para navegar, Enter para abrir, Esc para fechar.
              </p>
            </div>
          ) : hits.length === 0 && !loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              Nada encontrado para “{query}”.
            </div>
          ) : (
            <ul role="listbox">
              {hits.map((hit, i) => {
                const Icon = KIND_ICON[hit.kind]
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => handlePick(hit)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === highlight ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${KIND_COLOR[hit.kind]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">{hit.title}</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_COLOR[hit.kind]}`}>
                            {KIND_LABEL[hit.kind]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{hit.subtitle}</p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
