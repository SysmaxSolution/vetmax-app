'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, Plus, X, Tag, Loader2, Check, CircleHelp, PackagePlus } from 'lucide-react'
import { searchServices, type ServiceItem } from '@/lib/actions/services'
import { addStockItemV2 } from '@/lib/actions/stock'

const CATEGORY_LABEL: Record<string, string> = {
  vet_service:        'Consulta',
  exam:               'Exame',
  surgery:            'Cirurgia',
  service:            'Serviço',
  grooming_service:   'B&T',
  aesthetics_service: 'Estética',
  medication:         'Medicação',
  controlled_medication: 'Med. Controlada',
}

interface PickedService {
  item:     ServiceItem
  quantity: number
}

interface Props {
  /** Itens já adicionados à consulta (para destacar e bloquear duplicação). */
  alreadyAddedIds?: string[]
  onCancel:  () => void
  onConfirm: (picked: PickedService[]) => Promise<void> | void
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ServiceSelectionModal({ alreadyAddedIds = [], onCancel, onConfirm }: Props) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<ServiceItem[]>([])
  const [searching, setSearching] = useState(false)
  const [picked,    setPicked]    = useState<PickedService[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Browse + debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearching(true)
      searchServices(query).then(res => {
        setSearching(false)
        if (Array.isArray(res)) setResults(res)
      })
    }, 220)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  // Form: novo serviço
  const [newName,     setNewName]     = useState('')
  const [newPrice,    setNewPrice]    = useState('')
  const [newCategory, setNewCategory] = useState<'vet_service'|'exam'|'surgery'|'service'|'grooming_service'|'aesthetics_service'>('vet_service')
  const [savingNew,   setSavingNew]   = useState(false)

  function togglePick(item: ServiceItem) {
    if (alreadyAddedIds.includes(item.id)) return
    setPicked(prev => {
      const existing = prev.find(p => p.item.id === item.id)
      if (existing) return prev.filter(p => p.item.id !== item.id)
      return [...prev, { item, quantity: 1 }]
    })
  }

  function setQty(id: string, qty: number) {
    setPicked(prev => prev.map(p => p.item.id === id ? { ...p, quantity: Math.max(1, qty) } : p))
  }

  async function handleCreateNew() {
    setError(null)
    if (!newName.trim()) { setError('Informe o nome do serviço.'); return }
    const price = parseFloat(newPrice.replace(',', '.')) || 0
    if (price < 0) { setError('Preço inválido.'); return }
    setSavingNew(true)
    const res = await addStockItemV2({
      name:        newName.trim(),
      category:    newCategory,
      unit:        'un',
      quantity:    0,
      min_quantity: 0,
      unit_price:  price,
      is_service:  true,
    })
    setSavingNew(false)
    if ('error' in res) { setError(res.error); return }

    const newItem: ServiceItem = {
      id:            res.id as string,
      name:          newName.trim(),
      category:      newCategory,
      unit:          'un',
      unit_price:    price,
      sku:           null,
      barcode:       null,
      is_controlled: false,
      is_service:    true,
      quantity:      0,
    }
    setResults(prev => [newItem, ...prev])
    setPicked(prev => [...prev, { item: newItem, quantity: 1 }])
    setShowCreate(false)
    setNewName('')
    setNewPrice('')
  }

  async function handleConfirm() {
    setError(null)
    if (picked.length === 0) { setError('Selecione ao menos um serviço.'); return }
    startTransition(async () => {
      try {
        await onConfirm(picked)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao adicionar.')
      }
    })
  }

  const pickedTotal = picked.reduce((s, p) => s + p.item.unit_price * p.quantity, 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600">
              <PackagePlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Inserir Serviços / Itens</h2>
              <p className="text-[11px] text-slate-500">
                Selecione os serviços/itens cadastrados ou crie um novo
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

          {!showCreate ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Buscar por nome, SKU ou código de barras..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {searching ? (
                  <div className="px-4 py-10 flex items-center justify-center text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando...
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <CircleHelp className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Nenhum serviço encontrado.</p>
                    <button
                      type="button"
                      onClick={() => { setNewName(query); setShowCreate(true) }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700"
                    >
                      <Plus className="h-3 w-3" /> Cadastrar &quot;{query || 'novo serviço'}&quot;
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                    {results.map(item => {
                      const isPicked = picked.some(p => p.item.id === item.id)
                      const alreadyAdded = alreadyAddedIds.includes(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => togglePick(item)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                            alreadyAdded
                              ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                              : isPicked
                                ? 'bg-blue-50'
                                : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Tag className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {CATEGORY_LABEL[item.category] ?? item.category}
                                {item.sku && ` · SKU ${item.sku}`}
                                {alreadyAdded && ' · já adicionado'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold text-slate-900 tabular-nums">{fmtBRL(item.unit_price)}</span>
                            {isPicked && <Check className="h-4 w-4 text-blue-600" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 py-2 text-xs font-semibold text-blue-700"
              >
                <Plus className="h-3 w-3" /> Cadastrar novo serviço/item
              </button>

              {picked.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-900">Selecionados ({picked.length})</p>
                    <p className="text-sm font-bold text-blue-700">{fmtBRL(pickedTotal)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {picked.map(p => (
                      <div key={p.item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-blue-100">
                        <span className="text-xs text-slate-700 truncate flex-1">{p.item.name}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={p.quantity}
                          onChange={e => setQty(p.item.id, parseInt(e.target.value) || 1)}
                          className="w-16 rounded border border-slate-200 px-2 py-0.5 text-xs text-right"
                        />
                        <span className="text-xs font-semibold text-slate-700 tabular-nums w-20 text-right">
                          {fmtBRL(p.item.unit_price * p.quantity)}
                        </span>
                        <button
                          onClick={() => togglePick(p.item)}
                          className="text-slate-400 hover:text-rose-500 rounded p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Cadastrar novo serviço/item</h3>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ← Voltar para busca
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome <span className="text-rose-500">*</span></label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ex.: Consulta clínica geral"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as typeof newCategory)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="vet_service">Consulta</option>
                    <option value="exam">Exame</option>
                    <option value="surgery">Cirurgia</option>
                    <option value="service">Serviço</option>
                    <option value="grooming_service">Banho e Tosa</option>
                    <option value="aesthetics_service">Estética</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Preço (R$)</label>
                  <input
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateNew}
                disabled={savingNew}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingNew ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Cadastrar e selecionar
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          {!showCreate && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || picked.length === 0}
              className="flex-[2] rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Adicionando...</>
                : <><Plus className="h-4 w-4" /> Adicionar {picked.length > 0 ? `(${picked.length})` : ''}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
