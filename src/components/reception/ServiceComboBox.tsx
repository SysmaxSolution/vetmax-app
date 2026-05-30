'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, Plus, X, Tag, Sparkles, PlusCircle } from 'lucide-react'
import { searchServices, type ServiceItem } from '@/lib/actions/services'
import QuickServiceModal from './QuickServiceModal'

/**
 * Combobox de serviços para a Recepção — substitui o seletor fixo de
 * "motivo da visita". Lê dinamicamente de stock_items (is_service=TRUE).
 *
 * Modo múltiplo: vet/recepcionista pode lançar Consulta + Vacina + Coleta de
 * exame numa visita só. Cada item vira chip acima do input com botão X.
 *
 * Preço exibido no momento da seleção é o SNAPSHOT que vai virar
 * consultation_services.price_snapshot — mudanças futuras no estoque não
 * afetam a consulta.
 */

export type SelectedService = Omit<ServiceItem, 'quantity'> & {
  /** Quantidade do serviço (default 1 — vet pode mudar depois). */
  quantity?: number
}

interface Props {
  selected:  SelectedService[]
  onChange:  (services: SelectedService[]) => void
  /** Texto da label acima do input. Default: "Serviços lançados". */
  label?:    string
  /** Default false — quando true mostra um aviso vermelho se a lista estiver vazia. */
  required?: boolean
  placeholder?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  vet_service:        'Consulta',
  exam:               'Exame',
  surgery:            'Cirurgia',
  service:            'Serviço',
  grooming_service:   'B&T',
  aesthetics_service: 'Estética',
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ServiceComboBox({
  selected, onChange, label = 'Serviços lançados', required = false, placeholder = 'Digite para buscar (nome, SKU ou EAN)…',
}: Props) {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<ServiceItem[]>([])
  const [searching, setSearching] = useState(false)
  const [quickModal, setQuickModal] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef  = useRef<HTMLDivElement>(null)

  // Browse mode ao abrir (lista 20 primeiros)
  useEffect(() => {
    if (!open) return
    setSearching(true)
    searchServices(query).then(res => {
      setSearching(false)
      if (Array.isArray(res)) setResults(res)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce busca
  useEffect(() => {
    if (!open) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearching(true)
      searchServices(query).then(res => {
        setSearching(false)
        if (Array.isArray(res)) setResults(res)
      })
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, open])

  // Fechar ao clicar fora
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const isPicked = (id: string) => selected.some(s => s.id === id)

  function handlePick(item: ServiceItem) {
    if (isPicked(item.id)) return
    onChange([...selected, { ...item, quantity: 1 }])
    setQuery('')
  }

  function handleRemove(id: string) {
    onChange(selected.filter(s => s.id !== id))
  }

  function handleQuantityChange(id: string, qty: number) {
    if (!(qty > 0)) return
    onChange(selected.map(s => s.id === id ? { ...s, quantity: qty } : s))
  }

  const total = selected.reduce((sum, s) => sum + s.unit_price * (s.quantity ?? 1), 0)

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-teal-500" />
          {label}
          <span className="text-[10px] font-normal text-slate-400">(opcional — pode ser lançado depois)</span>
        </label>
        {selected.length > 0 && (
          <span className="text-xs font-bold text-teal-700">{formatBRL(total)}</span>
        )}
      </div>

      {/* Chips dos selecionados */}
      {selected.length > 0 && (
        <div className="space-y-1.5">
          {selected.map(s => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-2.5 py-1.5">
              <Tag className="h-3 w-3 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                <p className="text-[10px] text-slate-500">
                  {CATEGORY_LABEL[s.category] ?? s.category} · {formatBRL(s.unit_price)} / {s.unit}
                </p>
              </div>
              <input
                type="number"
                min="1"
                step="0.1"
                value={s.quantity ?? 1}
                onChange={e => handleQuantityChange(s.id, parseFloat(e.target.value))}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center focus:border-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleRemove(s.id)}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                title="Remover serviço"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trigger + [+ Novo] + dropdown */}
      <div className="relative">
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className={`flex-1 flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition-colors ${
              required && selected.length === 0
                ? 'border-rose-200 hover:border-rose-300'
                : 'border-slate-300 hover:border-teal-400'
            }`}
          >
            <span className="flex items-center gap-2 text-slate-500">
              <Plus className="h-3.5 w-3.5" />
              {selected.length === 0 ? 'Adicionar serviço' : 'Adicionar outro serviço'}
            </span>
            <span className="text-[10px] text-slate-400">{selected.length} no carrinho</span>
          </button>
          <button
            type="button"
            onClick={() => setQuickModal(true)}
            title="Cadastrar item novo sem sair da recepção"
            className="flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors whitespace-nowrap"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Novo
          </button>
        </div>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-30">
            {/* Search input */}
            <div className="sticky top-0 bg-white border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-md border border-slate-200 pl-8 pr-2 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                />
                {searching && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-slate-400" />
                )}
              </div>
            </div>

            {results.length === 0 && !searching && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                {query.length >= 2 ? `Nenhum serviço encontrado para "${query}"` : 'Nenhum serviço cadastrado na clínica'}
              </div>
            )}

            {results.map(item => {
              const picked = isPicked(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={picked}
                  onClick={() => handlePick(item)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 transition-colors ${
                    picked ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-teal-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {item.name}
                        {picked && <span className="ml-1 text-[9px] font-bold text-teal-600">· no carrinho</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                        <span className="bg-slate-100 rounded px-1 font-semibold text-slate-600">
                          {CATEGORY_LABEL[item.category] ?? item.category}
                        </span>
                        {item.sku && <span>· SKU {item.sku}</span>}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-teal-700 flex-shrink-0">
                      {formatBRL(item.unit_price)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {required && selected.length === 0 && (
        <p className="text-[11px] text-rose-600 italic">
          Ao menos um serviço será necessário para encerrar o atendimento.
        </p>
      )}

      {quickModal && (
        <QuickServiceModal
          initialName={query}
          onClose={() => setQuickModal(false)}
          onCreated={item => {
            // Auto-adiciona ao carrinho para a recepcionista não ter que buscar de novo
            onChange([...selected, item])
            setQuickModal(false)
            setOpen(false)
            setQuery('')
          }}
        />
      )}
    </div>
  )
}
