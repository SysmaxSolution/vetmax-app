'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Sparkles, Loader2, AlertCircle, Plus, Search } from 'lucide-react'
import { addStockItemV2 } from '@/lib/actions/stock'
import { searchProductByEAN, enrichProductFromNCM } from '@/lib/actions/purchases'
import { isEAN } from '@/lib/actions/sales'
import type { CartItem } from './SalesCart'

interface Props {
  query:   string
  onClose: () => void
  onAdded: (item: CartItem) => void
}

interface Preview {
  name:        string
  ncm:         string
  description: string
  unit:        string
  brand:       string
  source:      string
}

const CAT_OPTIONS = [
  { value: 'petshop',        label: 'Petshop' },
  { value: 'medication',     label: 'Medicamento' },
  { value: 'grooming_supply',label: 'Banho e Tosa' },
  { value: 'supply',         label: 'Insumo' },
  { value: 'other',          label: 'Outro' },
]

const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none'

export default function QuickAddProductModal({ query, onClose, onAdded }: Props) {
  const [preview, setPreview]   = useState<Preview | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name,     setName]     = useState(query)
  const [ncm,      setNcm]      = useState('')
  const [unit,     setUnit]     = useState('un')
  const [price,    setPrice]    = useState('')
  const [category, setCategory] = useState('petshop')
  const [qty,      setQty]      = useState('0')

  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]      = useState<string | null>(null)

  useEffect(() => {
    lookupPublic(query)
  }, [query])

  async function lookupPublic(q: string) {
    setLoading(true)
    setNotFound(false)

    let found: Preview | null = null

    if (isEAN(q)) {
      const res = await searchProductByEAN(q)
      if (!('error' in res) && res.description) {
        found = {
          name:        res.description,
          ncm:         res.ncm ?? '',
          description: res.description,
          unit:        res.unit ?? 'un',
          brand:       res.brand ?? '',
          source:      res.source,
        }
      }
    }

    // Se não achou por EAN e tem >= 8 dígitos finais parecendo NCM, tenta NCM
    if (!found) {
      const ncmMatch = q.replace(/\D/g, '')
      if (ncmMatch.length === 8) {
        const res = await enrichProductFromNCM(ncmMatch)
        if (!('error' in res)) {
          found = {
            name:        res.description,
            ncm:         res.code,
            description: res.description,
            unit:        'un',
            brand:       '',
            source:      'BrasilAPI NCM',
          }
        }
      }
    }

    if (found) {
      setPreview(found)
      setName(found.name || q)
      setNcm(found.ncm || '')
      setUnit(found.unit || 'un')
    } else {
      setNotFound(true)
      setName(q)
    }
    setLoading(false)
  }

  function handleConfirm() {
    const unitPrice = parseFloat(price.replace(',', '.'))
    if (!name.trim())         { setErrorMsg('Digite o nome do produto.'); return }
    if (isNaN(unitPrice) || unitPrice < 0) { setErrorMsg('Preço de venda inválido.'); return }

    startTransition(async () => {
      setErrorMsg(null)
      const res = await addStockItemV2({
        name:            name.trim(),
        category:        category as any,
        quantity:        parseFloat(qty) || 0,
        unit,
        min_quantity:    1,
        unit_price:      unitPrice,
        barcode:         isEAN(query) ? query : null,
        ncm:             ncm.trim() || null,
        ncm_description: preview?.description || null,
      })

      if ('error' in res) { setErrorMsg(res.error); return }

      onAdded({
        key:           crypto.randomUUID(),
        stock_item_id: res.id,
        description:   res.name,
        unit_price:    unitPrice,
        quantity:      1,
        discount:      0,
      })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Cadastrar e Adicionar</h2>
              <p className="text-xs text-slate-400">"{query}"</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Lookup status */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 rounded-lg bg-slate-50 px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
              Buscando na base pública de produtos...
            </div>
          )}
          {!loading && preview && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs">
              <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-800">Dados encontrados via {preview.source}</p>
                {preview.brand && <p className="text-emerald-600">{preview.brand}</p>}
              </div>
            </div>
          )}
          {!loading && notFound && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
              <Search className="h-4 w-4" />
              Produto não encontrado na base pública. Preencha os dados manualmente.
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              {errorMsg}
            </div>
          )}

          {/* Form */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome do produto *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="Nome do produto" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={INPUT}>
                {CAT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unidade</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} className={INPUT} placeholder="un, kg, fr..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Preço de Venda (R$) *</label>
              <input
                value={price}
                onChange={e => setPrice(e.target.value)}
                className={INPUT}
                placeholder="0,00"
                autoFocus={!loading}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Qtd. em estoque</label>
              <input value={qty} onChange={e => setQty(e.target.value)} className={INPUT} placeholder="0" type="number" min="0" />
            </div>
          </div>

          {ncm && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">NCM</label>
              <input value={ncm} onChange={e => setNcm(e.target.value)} className={INPUT} placeholder="00000000" maxLength={8} />
            </div>
          )}
          {!ncm && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">NCM (opcional)</label>
              <input value={ncm} onChange={e => setNcm(e.target.value)} className={INPUT} placeholder="8 dígitos" maxLength={8} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || loading || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Cadastrar e Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
