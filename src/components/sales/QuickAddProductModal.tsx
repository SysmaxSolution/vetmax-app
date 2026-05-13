'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Sparkles, Loader2, AlertCircle, Plus, Search, BookOpen, ChevronRight } from 'lucide-react'
import { addStockItemV2 } from '@/lib/actions/stock'
import { searchProductByEAN, enrichProductFromNCM } from '@/lib/actions/purchases'
import { searchGlobalCatalog, type CatalogSuggestion } from '@/lib/actions/catalog'
import { isEAN } from '@/lib/utils/ean'
import type { CartItem } from './SalesCart'

interface Props {
  query:          string
  onClose:        () => void
  onAdded:        (item: CartItem) => void
  activeModules?: string[]
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
  { value: 'medication',          label: 'Medicamento' },
  { value: 'controlled_medication', label: 'Medicamento Controlado' },
  { value: 'grooming_supply',     label: 'Banho e Tosa' },
  { value: 'aesthetics',          label: 'Estética Pet' },
  { value: 'vaccine',             label: 'Vacina' },
  { value: 'clinic_product',      label: 'Insumo Clínico' },
  { value: 'petshop',             label: 'Petshop' },
  { value: 'other',               label: 'Outro' },
]

const CAT_LABEL: Record<string, string> = {
  medication:           'Medicamento',
  controlled_medication:'Controlado',
  grooming_supply:      'Banho e Tosa',
  aesthetics:           'Estética',
  vaccine:              'Vacina',
  clinic_product:       'Insumo',
  petshop:              'Petshop',
  other:                'Outro',
}

const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none'

export default function QuickAddProductModal({ query, onClose, onAdded, activeModules = [] }: Props) {
  const [step,     setStep]     = useState<'catalog' | 'form'>('catalog')
  const [catalog,  setCatalog]  = useState<CatalogSuggestion[]>([])
  const [preview,  setPreview]  = useState<Preview | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name,     setName]     = useState(query)
  const [ncm,      setNcm]      = useState('')
  const [unit,     setUnit]     = useState('un')
  const [price,    setPrice]    = useState('')
  const [category, setCategory] = useState('petshop')
  const [qty,      setQty]      = useState('0')

  const [isPending, startTransition] = useTransition()
  const [errorMsg,  setErrorMsg]     = useState<string | null>(null)

  useEffect(() => {
    lookupAll(query)
  }, [query])

  async function lookupAll(q: string) {
    setLoading(true)
    setNotFound(false)

    // Busca paralela: catálogo global + EAN/NCM externo
    const [catalogResults, eanResult] = await Promise.all([
      searchGlobalCatalog(q, undefined, 8, activeModules),
      isEAN(q) ? searchProductByEAN(q) : Promise.resolve(null),
    ])

    let found: Preview | null = null
    if (eanResult && !('error' in eanResult) && eanResult.description) {
      found = {
        name:        eanResult.description,
        ncm:         eanResult.ncm ?? '',
        description: eanResult.description,
        unit:        eanResult.unit ?? 'un',
        brand:       eanResult.brand ?? '',
        source:      eanResult.source,
      }
    }

    if (!found && !isEAN(q)) {
      const ncmMatch = q.replace(/\D/g, '')
      if (ncmMatch.length === 8) {
        const ncmRes = await enrichProductFromNCM(ncmMatch)
        if (!('error' in ncmRes)) {
          found = { name: ncmRes.description, ncm: ncmRes.code, description: ncmRes.description, unit: 'un', brand: '', source: 'BrasilAPI NCM' }
        }
      }
    }

    setPreview(found)

    // Se achou no catálogo global, mostra seleção primeiro
    const catalogArr = Array.isArray(catalogResults) ? catalogResults : []
    setCatalog(catalogArr)
    if (catalogArr.length > 0) {
      setStep('catalog')
    } else {
      // Sem catálogo: vai direto pro formulário
      setStep('form')
      if (found) {
        setName(found.name || q)
        setNcm(found.ncm || '')
        setUnit(found.unit || 'un')
      } else {
        setNotFound(true)
        setName(q)
      }
    }

    setLoading(false)
  }

  function selectCatalogItem(item: CatalogSuggestion) {
    setName(item.name)
    setUnit(item.unit ?? 'un')
    setCategory(item.category in CAT_LABEL ? item.category : 'other')
    setNcm('')
    setStep('form')
  }

  function goToManualForm() {
    setName(query)
    if (preview) {
      setName(preview.name || query)
      setNcm(preview.ncm || '')
      setUnit(preview.unit || 'un')
    }
    setStep('form')
  }

  function handleConfirm() {
    const unitPrice = parseFloat(price.replace(',', '.'))
    if (!name.trim())                      { setErrorMsg('Digite o nome do produto.'); return }
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
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'catalog'
              ? <BookOpen className="h-5 w-5 text-emerald-600" />
              : <Sparkles className="h-5 w-5 text-emerald-600" />
            }
            <div>
              <h2 className="font-bold text-slate-800 text-sm">
                {step === 'catalog' ? 'Sugestões do Catálogo' : 'Cadastrar e Adicionar'}
              </h2>
              <p className="text-xs text-slate-400">"{query}"</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-5">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm text-slate-500">Buscando no catálogo veterinário...</p>
          </div>
        )}

        {/* PASSO 1: Catálogo */}
        {!loading && step === 'catalog' && (
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 pt-3 pb-1 shrink-0">
              <p className="text-xs text-slate-500">
                Selecione um produto para pré-preencher o cadastro ou cadastre manualmente.
              </p>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-2 space-y-1">
              {catalog.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectCatalogItem(item)}
                  className="w-full text-left rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 px-3 py-2.5 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{CAT_LABEL[item.category] ?? item.category}</span>
                      {item.common_brand && (
                        <span className="text-xs text-emerald-600 font-medium">{item.common_brand}</span>
                      )}
                      <span className="text-xs text-slate-300">· {item.unit}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 shrink-0">
              <button
                type="button"
                onClick={goToManualForm}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Não encontrei — cadastrar manualmente
              </button>
            </div>
          </div>
        )}

        {/* PASSO 2: Formulário */}
        {!loading && step === 'form' && (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Voltar para catálogo */}
              {catalog.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStep('catalog')}
                  className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                >
                  ← Ver sugestões do catálogo ({catalog.length})
                </button>
              )}

              {/* Lookup status */}
              {preview && (
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800">Dados de {preview.source}</p>
                    {preview.brand && <p className="text-emerald-600">{preview.brand}</p>}
                  </div>
                </div>
              )}
              {notFound && (
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
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Qtd. em estoque</label>
                  <input value={qty} onChange={e => setQty(e.target.value)} className={INPUT} placeholder="0" type="number" min="0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">NCM (opcional)</label>
                <input value={ncm} onChange={e => setNcm(e.target.value)} className={INPUT} placeholder="8 dígitos" maxLength={8} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 shrink-0">
              <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Cadastrar e Adicionar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
