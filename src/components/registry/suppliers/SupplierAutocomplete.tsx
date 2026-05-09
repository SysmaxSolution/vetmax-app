'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Building2, Check } from 'lucide-react'
import { searchSuppliers, type Supplier } from '@/lib/actions/suppliers'
import SupplierFullModal from './SupplierFullModal'

interface Props {
  value:        Supplier | null
  onChange:     (s: Supplier | null) => void
  placeholder?: string
  required?:    boolean
}

export default function SupplierAutocomplete({ value, onChange, placeholder, required }: Props) {
  const [query, setQuery]         = useState(value?.name ?? '')
  const [results, setResults]     = useState<Supplier[]>([])
  const [open, setOpen]           = useState(false)
  const [searching, setSearching] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)

    const term = query.trim()
    if (term.length < 2) { setResults([]); return }
    if (value && term === value.name) { setResults([]); return }

    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const res = await searchSuppliers(term)
      setSearching(false)
      if (Array.isArray(res)) setResults(res)
      else setResults([])
    }, 250)

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, value])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(s: Supplier) {
    onChange(s)
    setQuery(s.name)
    setOpen(false)
  }

  function handleClear() {
    onChange(null)
    setQuery('')
    setResults([])
  }

  const term = query.trim()
  const showCreateOption = term.length >= 2 && results.length === 0 && !searching && (!value || value.name !== term)

  return (
    <>
      {showModal && (
        <SupplierFullModal
          prefillName={term}
          onClose={() => setShowModal(false)}
          onSuccess={async () => {
            setShowModal(false)
            // re-fetch to get the newly created supplier
            const res = await searchSuppliers(term)
            if (Array.isArray(res) && res.length > 0) {
              const exact = res.find(s => s.name.toLowerCase() === term.toLowerCase()) ?? res[0]
              handleSelect(exact)
            }
          }}
        />
      )}

      <div ref={containerRef} className="relative">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {searching ? (
              <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : value ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setOpen(true)
              if (value && e.target.value !== value.name) onChange(null)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? 'Buscar fornecedor por nome...'}
            required={required}
            className={`w-full rounded-lg border px-3 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
              value
                ? 'border-emerald-300 bg-emerald-50/30 focus:border-emerald-500'
                : 'border-slate-300 focus:border-teal-500'
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
              title="Limpar seleção"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && (results.length > 0 || showCreateOption) && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
            {results.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-100">
                  <Building2 className="h-4 w-4 text-teal-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {s.category}
                    {s.document && ` · ${s.document}`}
                  </p>
                </div>
              </button>
            ))}
            {showCreateOption && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-teal-50 transition-colors text-teal-700 font-medium border-t border-slate-200"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-100">
                  <Plus className="h-4 w-4 text-teal-700" />
                </div>
                <span className="text-sm">Cadastrar &quot;{term}&quot; como novo fornecedor</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
