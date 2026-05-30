'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, Loader2, ChevronRight, ArrowLeft,
  PawPrint, Stethoscope, BedDouble, TestTubes, MessageSquare, MessageCircle,
} from 'lucide-react'
import { omnisearch, type OmnisearchResult, type OmnisearchGroup, type OmnisearchGroupKey } from '@/lib/actions/omnisearch'

const GROUP_ICON: Record<OmnisearchGroupKey, React.ComponentType<{ className?: string }>> = {
  cadastro:   PawPrint,
  consulta:   Stethoscope,
  internacao: BedDouble,
  exames:     TestTubes,
  conversas:  MessageSquare,
  whatsapp:   MessageCircle,
}

const GROUP_COLOR: Record<OmnisearchGroupKey, string> = {
  cadastro:   'bg-blue-100 text-blue-700',
  consulta:   'bg-indigo-100 text-indigo-700',
  internacao: 'bg-cyan-100 text-cyan-700',
  exames:     'bg-purple-100 text-purple-700',
  conversas:  'bg-violet-100 text-violet-700',
  whatsapp:   'bg-emerald-100 text-emerald-700',
}

export default function OmnisearchPalette({
  open, onClose,
}: {
  open:    boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<OmnisearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [drillKey, setDrillKey] = useState<OmnisearchGroupKey | null>(null)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setResult(null)
      setDrillKey(null)
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
      setResult(null)
      setLoading(false)
      setDrillKey(null)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const res = await omnisearch(trimmed)
      setLoading(false)
      if ('error' in res) {
        setResult(null)
      } else {
        setResult(res)
        setDrillKey(null)
        setHighlight(0)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const drillGroup: OmnisearchGroup | null =
    drillKey ? (result?.groups.find(g => g.key === drillKey) ?? null) : null

  const navTarget = (() => {
    if (drillGroup) return drillGroup.hits
    return result?.groups ?? []
  })()

  const handleNavigate = useCallback((href: string) => {
    router.push(href)
    onClose()
  }, [router, onClose])

  // Teclas globais
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (drillGroup) { setDrillKey(null); setHighlight(0); return }
        onClose()
        return
      }
      const n = navTarget.length
      if (n === 0) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, n - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (drillGroup) {
          const hit = drillGroup.hits[highlight]
          if (hit) handleNavigate(hit.href)
        } else {
          const g = (result?.groups ?? [])[highlight]
          if (g) { setDrillKey(g.key); setHighlight(0) }
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, navTarget, highlight, drillGroup, onClose, handleNavigate, result])

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
          {drillGroup ? (
            <button
              type="button"
              aria-label="Voltar aos grupos"
              onClick={() => { setDrillKey(null); setHighlight(0) }}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Search className="h-4 w-4 text-slate-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar pet, tutor, atendimento, conversa…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {result && result.total > 0 && !drillGroup && (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              {result.total} resultado{result.total === 1 ? '' : 's'}
            </span>
          )}
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

        {drillGroup && (
          <div className="border-b border-slate-100 px-4 py-2 flex items-center gap-2 bg-slate-50/50">
            {(() => {
              const Icon = GROUP_ICON[drillGroup.key]
              return (
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${GROUP_COLOR[drillGroup.key]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              )
            })()}
            <p className="text-xs font-semibold text-slate-700">{drillGroup.label}</p>
            <span className="text-[10px] text-slate-400">· {drillGroup.count} resultado{drillGroup.count === 1 ? '' : 's'}</span>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              <Search className="h-8 w-8 mx-auto mb-3 text-slate-200" />
              Digite ao menos 2 caracteres
              <p className="text-xs mt-2 text-slate-400">
                Resultados agrupados por categoria (Cadastro, Consultas, Internação, Exames, Chat, WhatsApp).
              </p>
            </div>
          ) : !result || result.total === 0 ? (
            !loading && (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                Nada encontrado para “{query}”.
              </div>
            )
          ) : !drillGroup ? (
            // ── Estado 1: lista de grupos ─────────────────────────────────
            <ul role="listbox">
              {result.groups.map((g, i) => {
                const Icon = GROUP_ICON[g.key]
                const active = i === highlight
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => { setDrillKey(g.key); setHighlight(0) }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${GROUP_COLOR[g.key]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{g.label}</p>
                        <p className="text-xs text-slate-500">
                          {g.count} resultado{g.count === 1 ? '' : 's'}
                          {g.hits[0] ? ` · primeiro: ${g.hits[0].title.slice(0, 40)}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            // ── Estado 2: registros do grupo selecionado ─────────────────
            <ul role="listbox">
              {drillGroup.hits.map((h, i) => {
                const active = i === highlight
                return (
                  <li key={`${h.kind}-${h.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => handleNavigate(h.href)}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{h.title}</p>
                        <p className="text-xs text-slate-500 truncate">{h.subtitle}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 mt-1 flex-shrink-0" />
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
