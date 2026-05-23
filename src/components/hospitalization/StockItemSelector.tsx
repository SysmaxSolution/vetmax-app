'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, Package, X, AlertTriangle } from 'lucide-react'
import { searchStockItems, type StockItemLite } from '@/lib/actions/stock-consumption'

/**
 * Dropdown buscável de stock_items para vincular à prescrição.
 *
 * Diferenciais aprovados com PO:
 *  - Busca por nome, SKU ou barcode (debounce 250ms).
 *  - Badge "Estoque baixo: N un" quando quantity ≤ min_quantity — o vet vê
 *    a alerta ANTES de aplicar, podendo notificar a farmácia.
 *  - Opção "Sem vínculo" para medicação não cadastrada no estoque.
 */

interface Props {
  value:    string | null   // stock_item_id selecionado
  onChange: (item: StockItemLite | null) => void
  /** Quando o item selecionado tem is_below_min, mostra badge ao lado. */
  showLowStockBadge?: boolean
}

export default function StockItemSelector({ value, onChange, showLowStockBadge = true }: Props) {
  const [open,        setOpen]        = useState(false)
  const [query,       setQuery]        = useState('')
  const [results,     setResults]      = useState<StockItemLite[]>([])
  const [searching,   setSearching]    = useState(false)
  const [selected,    setSelected]     = useState<StockItemLite | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef  = useRef<HTMLDivElement>(null)

  // Re-resolve a label quando value muda externamente (ex.: edição de prescrição existente).
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.id === value) return
    // Busca direta pelo id para preencher o label inicial.
    searchStockItems('').then(res => {
      if (Array.isArray(res)) {
        const hit = res.find(i => i.id === value)
        if (hit) setSelected(hit)
      }
    })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carga inicial dos 20 primeiros quando abre.
  useEffect(() => {
    if (!open) return
    setSearching(true)
    searchStockItems(query).then(res => {
      setSearching(false)
      if (Array.isArray(res)) setResults(res)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce de busca.
  useEffect(() => {
    if (!open) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearching(true)
      searchStockItems(query).then(res => {
        setSearching(false)
        if (Array.isArray(res)) setResults(res)
      })
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, open])

  // Fechar ao clicar fora.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handlePick(item: StockItemLite | null) {
    setSelected(item)
    onChange(item)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-400 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Package className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
            <span className="truncate">{selected.name}</span>
            {selected.is_controlled && (
              <span className="text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1 flex-shrink-0">CONTROL.</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">Vincular item do estoque (opcional)</span>
        )}
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); handlePick(null) }}
            className="text-slate-400 hover:text-rose-500"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {/* Badge "estoque baixo" — fica sob o trigger, sempre visível */}
      {showLowStockBadge && selected?.is_below_min && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          Estoque baixo: <span className="font-bold">{selected.quantity} {selected.unit}</span> restante{selected.quantity !== 1 ? 's' : ''} (mínimo {selected.min_quantity})
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-20">
          {/* Search input */}
          <div className="sticky top-0 bg-white border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, SKU ou código de barras..."
                className="w-full rounded-md border border-slate-200 pl-8 pr-2 py-1.5 text-xs focus:border-violet-500 focus:outline-none"
              />
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-slate-400" />
              )}
            </div>
          </div>

          {/* "Sem vínculo" sempre disponível no topo */}
          <button
            type="button"
            onClick={() => handlePick(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 italic hover:bg-slate-50 border-b border-slate-100"
          >
            — Sem vínculo (não cadastrado no estoque) —
          </button>

          {results.length === 0 && !searching && (
            <div className="px-3 py-4 text-center text-xs text-slate-400">
              {query.length >= 2 ? 'Nenhum item encontrado' : 'Carregando...'}
            </div>
          )}

          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePick(item)}
              className={`w-full text-left px-3 py-2 hover:bg-violet-50 border-b border-slate-50 last:border-0 ${
                selected?.id === item.id ? 'bg-violet-50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    {item.name}
                    {item.is_controlled && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1">C</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.sku && <span>SKU {item.sku}</span>}
                    {item.sku && item.barcode && <span className="mx-1">·</span>}
                    {item.barcode && <span>EAN {item.barcode}</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-bold ${item.is_below_min ? 'text-amber-700' : 'text-slate-700'}`}>
                    {item.quantity} {item.unit}
                  </p>
                  {item.is_below_min && (
                    <p className="text-[9px] font-semibold text-amber-600 flex items-center gap-0.5 justify-end">
                      <AlertTriangle className="h-2.5 w-2.5" /> baixo
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
