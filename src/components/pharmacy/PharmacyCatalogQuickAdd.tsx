'use client'

import { useState, useTransition } from 'react'
import {
  X, Check, Loader2, Package, Shield,
  Pill, FlaskConical, ShoppingBag, Scissors, Sparkles,
} from 'lucide-react'
import type { GlobalCatalogSuggestion } from '@/lib/actions/catalog'
import { addStockItemV2 } from '@/lib/actions/stock'
import type { StockItemV2 } from '@/lib/actions/stock'
import type { StockCategory } from '@/lib/stock-constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = [
  'comprimido', 'cápsula', 'frasco', 'ampola', 'un', 'ml', 'mg', 'g',
  'kg', 'l', 'caixa', 'sachê', 'kit', 'dose', 'par', 'bisnaga', 'spray', 'tubo',
]

const CAT_LABELS: Record<StockCategory, string> = {
  medication:            'Med. Comum',
  controlled_medication: 'Controlado',
  clinic_product:        'Clínica',
  petshop:               'Petshop',
  grooming_supply:       'Banho e Tosa',
  aesthetics:            'Estética',
  other:                 'Outro',
  service:               'Serviço Geral',
  exam:                  'Exame/Lab',
  vet_service:           'Veterinário',
  grooming_service:      'Banho e Tosa',
  aesthetics_service:    'Estética',
  surgery:               'Cirurgia',
}

const PRODUCT_CAT_KEYS: StockCategory[] = [
  'medication', 'controlled_medication', 'clinic_product',
  'petshop', 'grooming_supply', 'aesthetics', 'other',
]

function catIcon(cat: StockCategory) {
  switch (cat) {
    case 'medication':            return <Pill         className="h-3.5 w-3.5" />
    case 'controlled_medication': return <Shield       className="h-3.5 w-3.5" />
    case 'clinic_product':        return <FlaskConical className="h-3.5 w-3.5" />
    case 'petshop':               return <ShoppingBag  className="h-3.5 w-3.5" />
    case 'grooming_supply':       return <Scissors     className="h-3.5 w-3.5" />
    case 'aesthetics':            return <Sparkles     className="h-3.5 w-3.5" />
    default:                      return <Package      className="h-3.5 w-3.5" />
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  suggestion: GlobalCatalogSuggestion
  onClose:    () => void
  onSaved:    (item: StockItemV2) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PharmacyCatalogQuickAdd({ suggestion, onClose, onSaved }: Props) {
  const [category,   setCategory]   = useState<StockCategory>(suggestion.category as StockCategory)
  const [unit,       setUnit]       = useState(suggestion.unit ?? 'un')
  const [price,      setPrice]      = useState(suggestion.price_avg != null ? String(suggestion.price_avg) : '')
  const [quantity,   setQuantity]   = useState('0')
  const [minQty,     setMinQty]     = useState('10')
  const [barcode,    setBarcode]    = useState(suggestion.barcode ?? '')
  const [supplier,   setSupplier]   = useState('')
  const [error,      setError]      = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  const brandText = suggestion.brand || ''
  const ncmText   = suggestion.ncm   || ''

  function handleConfirm() {
    const unitPrice = parseFloat(price.replace(',', '.'))
    if (!suggestion.name.trim()) { setError('Nome do produto inválido.'); return }
    if (isNaN(unitPrice) || unitPrice < 0) { setError('Preço inválido.'); return }

    startTransition(async () => {
      setError(null)
      const res = await addStockItemV2({
        name:          suggestion.name.trim(),
        category,
        quantity:      parseFloat(quantity) || 0,
        unit,
        min_quantity:  parseFloat(minQty) || 0,
        unit_price:    unitPrice,
        brand:         brandText || null,
        barcode:       barcode.trim() || null,
        ncm:           ncmText.replace(/\./g, '').trim() || null,
        supplier:      supplier.trim() || null,
        is_controlled: category === 'controlled_medication',
      })

      if ('error' in res) { setError(res.error); return }
      onSaved(res)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              <Package className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Cadastrar no Estoque</p>
              <p className="text-xs text-white/70">A partir do catálogo veterinário</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Produto identificado */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-bold text-teal-900">{suggestion.name}</p>
            {brandText && <p className="text-xs text-teal-700">{brandText}</p>}
            <div className="flex flex-wrap gap-2 mt-1">
              {ncmText && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">
                  NCM {ncmText}
                </span>
              )}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {CAT_LABELS[suggestion.category as StockCategory]}
              </span>
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Categoria</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRODUCT_CAT_KEYS.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left text-xs font-semibold transition-all ${
                    category === cat
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className={category === cat ? 'text-teal-600' : 'text-slate-400'}>
                    {catIcon(cat)}
                  </span>
                  {CAT_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Unidade + Preço */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Preço (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                placeholder="0,00"
                autoFocus
              />
            </div>
          </div>

          {/* Qtde inicial + Qtde mínima */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Qtde inicial</label>
              <input
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Qtde mínima</label>
              <input
                type="number"
                min="0"
                step="1"
                value={minQty}
                onChange={e => setMinQty(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Código de barras */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cód. de Barras (EAN)</label>
            <input
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              placeholder="Ex: 7891035024510"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Fornecedor */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fornecedor / Distribuidora</label>
            <input
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Ex: Distribuidora Pet Brasil"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Aviso controlado */}
          {category === 'controlled_medication' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <Shield className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                A dispensação exige receituário assinado por Médico Veterinário (CFMV). Mantenha os registros para fiscalização.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-4 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60"
          >
            {isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Check className="h-4 w-4" />
            }
            Cadastrar no Estoque
          </button>
        </div>
      </div>
    </div>
  )
}
