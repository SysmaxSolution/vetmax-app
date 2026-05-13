'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, Package, Sparkles, BookOpen } from 'lucide-react'
import { searchSalesProducts, type StockProduct } from '@/lib/actions/sales'
import { searchGlobalCatalog, type CatalogSuggestion } from '@/lib/actions/catalog'
import { isEAN } from '@/lib/utils/ean'
import type { CartItem } from './SalesCart'
import QuickAddProductModal from './QuickAddProductModal'

interface ProductSearchProps {
  onAdd:         (item: CartItem) => void
  disabled?:     boolean
  refocusTrigger?: number   // incrementar após cada addProduct para re-focar
}

const CATEGORY_LABELS: Record<string, string> = {
  medication:      'Medicamento',
  supply:          'Insumo',
  grooming_supply: 'B&T',
  other:           'Outro',
  petshop:         'Petshop',
  service:         'Serviço',
  exam:            'Exame',
}

export default function ProductSearch({ onAdd, disabled = false, refocusTrigger }: ProductSearchProps) {
  const [query,       setQuery]      = useState('')
  const [results,     setResults]    = useState<StockProduct[]>([])
  const [catalog,     setCatalog]    = useState<CatalogSuggestion[]>([])
  const [open,        setOpen]       = useState(false)
  const [loading,     setLoading]    = useState(false)
  const [notFound,    setNotFound]   = useState(false)
  const [quickAdd,    setQuickAdd]   = useState(false)
  const [manualDesc,  setManualDesc] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [showManual,  setShowManual] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // F2 — focar busca
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Refoco automático após adição ao carrinho
  useEffect(() => {
    if (refocusTrigger !== undefined && refocusTrigger > 0) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [refocusTrigger])

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setCatalog([])
      setOpen(false)
      setNotFound(false)
      return
    }
    setLoading(true)
    setNotFound(false)

    const [r, cat] = await Promise.all([
      searchSalesProducts(trimmed),
      trimmed.length >= 3 && !isEAN(trimmed) ? searchGlobalCatalog(trimmed, undefined, 5) : Promise.resolve([]),
    ])

    setResults(r)
    const catArr = Array.isArray(cat) ? cat : []
    setCatalog(catArr)

    if (r.length > 0 || catArr.length > 0) {
      setOpen(true)
      setNotFound(false)
    } else {
      setOpen(false)
      setNotFound(trimmed.length >= 3 || isEAN(trimmed))
    }
    setLoading(false)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setNotFound(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    // EAN: busca imediata após 8+ dígitos; texto: debounce 300ms
    const delay = isEAN(q.trim()) && q.trim().length >= 8 ? 0 : 300
    timerRef.current = setTimeout(() => search(q), delay)
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
    setNotFound(false)
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
    inputRef.current?.focus()
  }

  function handleQuickAdded(item: CartItem) {
    onAdd(item)
    setQuery('')
    setNotFound(false)
    setQuickAdd(false)
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-2">
      {/* Busca principal */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          {loading
            ? <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            : <Search className="h-4 w-4 text-slate-400" />
          }
        </div>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          placeholder={`Buscar produto ou EAN... (F2)`}
          value={query}
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />

        {/* Dropdown de resultados */}
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
            {/* Resultados do estoque */}
            {results.length > 0 && (
              <>
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
              </>
            )}
            {/* Sugestões do catálogo global */}
            {catalog.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Catálogo veterinário — clique para cadastrar
                  </p>
                </div>
                {catalog.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => { setQuickAdd(true); setOpen(false) }}
                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                        {c.common_brand ? ` · ${c.common_brand}` : ''}
                        {' · '}{c.unit}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-emerald-600 flex-shrink-0 flex items-center gap-1">
                      <Plus className="h-3 w-3" />
                      Cadastrar
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Produto não encontrado → oferecer cadastro rápido */}
      {notFound && !open && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2.5">
          <Sparkles className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-800">
              "{query}" não está no estoque
            </p>
            <p className="text-xs text-emerald-600">
              {isEAN(query.trim()) ? 'Buscando dados fiscais na base pública...' : 'Cadastre com 1 clique'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar
          </button>
        </div>
      )}

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

      {/* QuickAdd Modal */}
      {quickAdd && (
        <QuickAddProductModal
          query={query}
          onClose={() => setQuickAdd(false)}
          onAdded={handleQuickAdded}
        />
      )}
    </div>
  )
}
