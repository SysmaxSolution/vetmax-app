'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Plus, Globe2 } from 'lucide-react'
import { searchBreeds, createBreedIfMissing, type BreedSuggestion } from '@/lib/actions/breeds'
import type { PatientSpecies } from '@/types'

type Props = {
  label?: string
  value: string
  onChange: (value: string) => void
  species: PatientSpecies
  placeholder?: string
  /** repassado ao input para data attributes (Mentor) */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
}

const DEBOUNCE_MS = 200

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function BreedCombobox({
  label = 'Raça',
  value,
  onChange,
  species,
  placeholder = 'Ex: Labrador',
  inputProps,
}: Props) {
  const [open, setOpen]               = useState(false)
  const [suggestions, setSuggestions] = useState<BreedSuggestion[]>([])
  const [activeIdx, setActiveIdx]     = useState(-1)
  const [creating, setCreating]       = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const reqIdRef   = useRef(0)
  const listboxId  = useId()

  // Re-filtra a cada mudança de value/species com debounce
  useEffect(() => {
    const myReq = ++reqIdRef.current
    const handle = window.setTimeout(async () => {
      const result = await searchBreeds(species, value)
      // Ignora respostas obsoletas
      if (myReq !== reqIdRef.current) return
      setSuggestions(result)
      setActiveIdx(-1)
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(handle)
  }, [value, species])

  // Fecha ao clicar fora
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const trimmed = value.trim()
  const normValue = normalize(trimmed)
  const hasExactMatch = suggestions.some(s => normalize(s.name) === normValue)
  const showCreate = !!trimmed && !hasExactMatch && !creating

  // Opções renderizadas: sugestões + (opcional) ação "criar"
  const items: Array<
    | { kind: 'suggestion'; breed: BreedSuggestion }
    | { kind: 'create'; name: string }
  > = [
    ...suggestions.map(b => ({ kind: 'suggestion' as const, breed: b })),
    ...(showCreate ? [{ kind: 'create' as const, name: trimmed }] : []),
  ]

  function commit(item: typeof items[number]) {
    if (item.kind === 'suggestion') {
      onChange(item.breed.name)
      setOpen(false)
      return
    }
    void handleCreate(item.name)
  }

  async function handleCreate(name: string) {
    setCreating(true)
    const result = await createBreedIfMissing(species, name)
    setCreating(false)
    if ('error' in result) {
      // mantém valor digitado, fecha dropdown — o submit do form ainda salva o texto livre
      setOpen(false)
      return
    }
    onChange(result.breed.name)
    setOpen(false)
    // Atualiza cache de sugestões para refletir a nova raça
    const refreshed = await searchBreeds(species, result.breed.name)
    setSuggestions(refreshed)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActiveIdx(i => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(-1, i - 1))
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0 && activeIdx < items.length) {
        e.preventDefault()
        commit(items[activeIdx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">
        {label}
      </label>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
        }
        className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none transition-all"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        {...inputProps}
      />

      {open && items.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
        >
          {items.map((item, i) => {
            const isActive = i === activeIdx
            if (item.kind === 'suggestion') {
              return (
                <li
                  key={item.breed.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={e => { e.preventDefault(); commit(item) }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`px-4 py-2 cursor-pointer text-sm flex items-center justify-between gap-2 ${
                    isActive ? 'bg-teal-50 text-teal-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{item.breed.name}</span>
                  {item.breed.is_global ? (
                    <Globe2 className="h-3 w-3 text-slate-300 shrink-0" aria-label="Catálogo global" />
                  ) : (
                    <span className="text-[9px] font-bold text-teal-600 uppercase tracking-wider shrink-0">Clínica</span>
                  )}
                </li>
              )
            }
            return (
              <li
                key="__create__"
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={e => { e.preventDefault(); commit(item) }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-2 border-t border-slate-100 ${
                  isActive ? 'bg-teal-50 text-teal-900' : 'text-teal-700 hover:bg-teal-50'
                }`}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Adicionar <strong>&ldquo;{item.name}&rdquo;</strong> como nova raça
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
