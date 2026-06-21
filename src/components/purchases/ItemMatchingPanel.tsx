'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { X, Search, Plus, Link2, Loader2, AlertCircle, Sparkles } from 'lucide-react'
import type { PurchaseOrderItem, StockMatchSuggestion } from '@/lib/actions/purchases'
import { matchItemToStock, autoCreateStockFromItem, enrichProductFromNCM, searchProductByEAN, searchStockMatchesForPurchaseItem } from '@/lib/actions/purchases'
import { createClient } from '@/lib/supabase/client'

interface Props {
  item:      PurchaseOrderItem
  onClose:   () => void
  onMatched: () => void
}

interface StockSearchResult {
  id:   string
  name: string
  category: string
  unit_price: number
}

export function ItemMatchingPanel({ item, onClose, onMatched }: Props) {
  const [query, setQuery]           = useState(item.description.substring(0, 30))
  const [results, setResults]       = useState<StockSearchResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [ncmData, setNcmData]       = useState<string | null>(null)
  const [createName, setCreateName] = useState(item.description)
  const [createCat, setCreateCat]   = useState('supply')
  const [unitsPerPackage, setUnitsPerPackage] = useState('')   // M13(b)
  const [baseUnit, setBaseUnit]     = useState('')
  const [tab, setTab]               = useState<'search' | 'create'>('search')
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<StockMatchSuggestion[]>([])
  const [loadingSug, setLoadingSug]   = useState(true)

  // M13(a) — sugere candidatos do estoque (EAN > NCM > nome) ao abrir.
  useEffect(() => {
    searchStockMatchesForPurchaseItem({ ean: item.ean, ncm: item.ncm, description: item.description }).then(res => {
      setLoadingSug(false)
      if (Array.isArray(res)) setSuggestions(res)
    })
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch() {
    setSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('stock_items')
      .select('id, name, category, unit_price')
      .ilike('name', `%${query.trim()}%`)
      .limit(15)
    setResults((data ?? []) as StockSearchResult[])
    setSearching(false)
  }

  function handleLink(stockItemId: string) {
    startTransition(async () => {
      setErrorMsg(null)
      const res = await matchItemToStock(item.id, stockItemId)
      if ('error' in res) { setErrorMsg(res.error); return }
      onMatched()
    })
  }

  function handleCreate() {
    startTransition(async () => {
      setErrorMsg(null)
      const upp = unitsPerPackage ? parseInt(unitsPerPackage) : undefined
      const res = await autoCreateStockFromItem(item.id, {
        name: createName,
        category: createCat,
        units_per_package: upp,
        unit: upp && upp > 1 && baseUnit.trim() ? baseUnit.trim() : undefined,
      })
      if ('error' in res) { setErrorMsg(res.error); return }
      onMatched()
    })
  }

  async function loadNCMInfo() {
    if (!item.ncm) return
    const res = await enrichProductFromNCM(item.ncm)
    if (!('error' in res)) setNcmData(res.description)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-purple-600" />
            <h2 className="font-bold text-slate-800">Vincular Item ao Estoque</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Item info */}
        <div className="bg-purple-50 px-5 py-3 text-sm">
          <p className="font-semibold text-purple-900 truncate">{item.description}</p>
          <p className="text-purple-600 text-xs mt-0.5">
            {item.quantity} {item.unit} · NCM {item.ncm || '—'} · EAN {item.ean || '—'}
          </p>
          {item.ncm && !ncmData && (
            <button onClick={loadNCMInfo} className="mt-1 text-xs text-purple-700 underline">
              Ver descrição NCM
            </button>
          )}
          {ncmData && <p className="mt-1 text-xs text-purple-700">{ncmData}</p>}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5">
          {(['search', 'create'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-1 mr-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'search' ? 'Buscar existente' : 'Criar novo produto'}
            </button>
          ))}
        </div>

        <div className="px-5 py-4">
          {errorMsg && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              {errorMsg}
            </div>
          )}

          {tab === 'search' && (
            <div>
              {/* Sugestões automáticas (M13a) */}
              {(loadingSug || suggestions.length > 0) && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 mb-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Sugestões do estoque
                  </p>
                  {loadingSug ? (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Buscando correspondências…</p>
                  ) : (
                    <div className="space-y-1.5">
                      {suggestions.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
                            <p className="text-[10px] text-amber-600">{s.reason} · R$ {s.unit_price.toFixed(2)}</p>
                          </div>
                          <button onClick={() => handleLink(s.id)} disabled={isPending}
                            className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">
                            <Link2 className="h-3 w-3" /> Vincular
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!loadingSug && suggestions.length === 0 && (
                    <p className="text-xs text-amber-600">Nenhuma correspondência — busque manualmente ou cadastre como novo.</p>
                  )}
                </div>
              )}
              <div className="flex gap-2 mb-3">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                  placeholder="Nome do produto no estoque..."
                />
                <button
                  onClick={doSearch}
                  disabled={searching}
                  className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {results.length === 0 && !searching && (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Clique em buscar para encontrar produtos do estoque
                  </p>
                )}
                {results.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-100 hover:border-purple-200 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{r.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{r.category} · R$ {r.unit_price.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => handleLink(r.id)}
                      disabled={isPending}
                      className="flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Link2 className="h-3 w-3" />
                      Vincular
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nome do produto</label>
                <input
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                <select
                  value={createCat}
                  onChange={e => setCreateCat(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                >
                  <option value="supply">Insumo / Produto</option>
                  <option value="medication">Medicamento</option>
                  <option value="grooming_supply">Banho e Tosa</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Itens por embalagem</label>
                  <input
                    type="number" min="1" value={unitsPerPackage}
                    onChange={e => setUnitsPerPackage(e.target.value)}
                    placeholder="Ex: 30 (comprimidos/caixa)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unidade-base</label>
                  <input
                    type="text" value={baseUnit}
                    onChange={e => setBaseUnit(e.target.value)}
                    placeholder="Ex: comprimido"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Preço unitário {item.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, quantidade zero.
                {unitsPerPackage && parseInt(unitsPerPackage) > 1
                  ? ` O recebimento creditará ${item.quantity} × ${parseInt(unitsPerPackage)} = ${item.quantity * parseInt(unitsPerPackage)} ${baseUnit.trim() || 'itens'} (baixa dá-se na unidade-base).`
                  : ` O recebimento irá creditar ${item.quantity} ${item.unit}.`}
              </p>
              <button
                onClick={handleCreate}
                disabled={isPending || createName.length < 2}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar e Vincular
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
