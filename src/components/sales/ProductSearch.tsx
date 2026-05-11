'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, Package } from 'lucide-react'
import { searchSalesProducts, type StockProduct } from '@/lib/actions/sales'
import type { CartItem } from './SalesCart'

interface ProductSearchProps {
  onAdd:     (item: CartItem) => void
  disabled?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  medication:      'Medicamento',
  supply:          'Insumo',
  grooming_supply: 'B&T',
  other:           'Outro',
}

export default function ProductSearch({ onAdd, disabled = false }: ProductSearchProps) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<StockProduct[]>([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [manualDesc, setManualDesc] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [showManual, setShowManual]   = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // F2 atalho para focar busca
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    const r = await searchSalesProducts(q)
    setResults(r)
    setOpen(r.length > 0)
    setLoading(false)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(q), 300)
  }

  function addProduct(p: StockProduct) {
    onAdd({
      key:           crypto.randomUUID(),
      stock_item_id: p.id,
      description:   p.name,
      unit_price:    p.unit_price,
      quantity:      1,
      discount:      0,
    })
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function addManual() {
    const price = parseFloat(manualPrice.replace(',', '.'))
    if (!manualDesc.trim() || isNaN(price) || price < 0) return
    onAdd({
      key:           crypto.randomUUID(),
      stock_item_id: null,
      description:   manualDesc.trim(),
      unit_price:    price,
      quantity:      1,
      discount:      0,
    })
    setManualDesc('')
    setManualPrice('')
    setShowManual(false)
  }

  return (
    <div className="space-y-2">
      {/* Busca por produto cadastrado */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          {loading
            ? <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            : <Search className="h-4 w-4 text-slate-400" />
          }
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar produto... (F2)"
          value={query}
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {results.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => addProduct(p)}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{CATEGORY_LABELS[p.category] ?? p.category} · Estoque: {p.quantity} {p.unit}</p>
                </div>
                <span className="text-sm font-semibold text-blue-600 flex-shrink-0">R$ {p.unit_price.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Item manual */}
      {showManual ? (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Package className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <input
            type="text"
            placeholder="Descrição do item"
            value={manualDesc}
            onChange={e => setManualDesc(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <span className="text-xs text-slate-500 flex-shrink-0">R$</span>
          <input
            type="text"
            placeholder="0,00"
            value={manualPrice}
            onChange={e => setManualPrice(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManual()}
            className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button
            type="button"
            onClick={addManual}
            disabled={!manualDesc.trim() || !manualPrice}
            className="flex-shrink-0 bg-amber-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            Adicionar
          </button>
          <button
            type="button"
            onClick={() => setShowManual(false)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 text-xs"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar item manual
        </button>
      )}
    </div>
  )
}
