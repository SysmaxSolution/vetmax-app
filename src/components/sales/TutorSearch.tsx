'use client'

import { useState, useRef, useCallback } from 'react'
import { UserCircle, X } from 'lucide-react'
import { searchSalesTutors, type SaleTutor } from '@/lib/actions/sales'

interface TutorSearchProps {
  selected:  SaleTutor | null
  onSelect:  (tutor: SaleTutor | null) => void
  disabled?: boolean
}

export default function TutorSearch({ selected, onSelect, disabled = false }: TutorSearchProps) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SaleTutor[]>([])
  const [open,    setOpen]    = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    const r = await searchSalesTutors(q)
    setResults(r)
    setOpen(r.length > 0)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(q), 300)
  }

  function pick(t: SaleTutor) {
    onSelect(t)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
        <UserCircle className="h-4 w-4 text-teal-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-teal-800 truncate">{selected.name}</p>
          {selected.phone && <p className="text-xs text-teal-600 font-mono tabular-nums">{selected.phone}</p>}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          disabled={disabled}
          className="text-teal-500 hover:text-teal-700 transition-colors disabled:opacity-40"
          aria-label="Remover tutor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <UserCircle className="h-4 w-4 text-slate-400" />
      </div>
      <input
        type="text"
        placeholder="Buscar tutor (opcional)..."
        value={query}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 bg-slate-50"
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {results.map(t => (
            <button
              key={t.id}
              type="button"
              onMouseDown={() => pick(t)}
              className="w-full text-left px-4 py-2.5 hover:bg-teal-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <p className="text-sm font-medium text-slate-900">{t.name}</p>
              {t.phone && <p className="text-xs text-slate-400">{t.phone}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
