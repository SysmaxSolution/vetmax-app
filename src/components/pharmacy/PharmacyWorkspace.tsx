'use client'

import { useState, useTransition, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Package, Plus, AlertTriangle, RefreshCw, Trash2, Pencil,
  ArrowDownToLine, Search, X, Loader2, Check, Calendar,
  Shield, ShoppingBag, Scissors, Sparkles, FlaskConical, Pill,
  Upload, Stethoscope, Gift, Activity, FileText,
} from 'lucide-react'
import type { StockItemV2 } from '@/lib/actions/stock'
import type { StockCategory } from '@/lib/stock-constants'
import {
  addStockItemV2, updateStockItemV2,
  restockItemV2, adjustStockItemV2,
  dispenseStockItem, deleteStockItemV2,
} from '@/lib/actions/stock'
import type { GlobalCatalogSuggestion } from '@/lib/actions/catalog'
import { searchGlobalCatalog } from '@/lib/actions/catalog'
import { suggestDefaultInsurancePrice } from '@/lib/actions/insurance-pricing'
import { getInsuranceProviders, getProvidersForStockItem, setProvidersForStockItem, type InsuranceProvider } from '@/lib/actions/insurance-providers'
import { clinicEmitsNfse } from '@/lib/actions/billing-documents'
import StockCsvImporter from './StockCsvImporter'
import { EnrichNcmModal } from './EnrichNcmModal'
import PharmacyCatalogQuickAdd from './PharmacyCatalogQuickAdd'
import PackagesTab from './PackagesTab'

// ─── Categorias de Produtos ───────────────────────────────────────────────────

const PRODUCT_CATS: {
  key: StockCategory | 'all'; label: string; icon: React.ReactNode; color: string; badge: string
}[] = [
  { key: 'all',                   label: 'Todos',            icon: <Package      className="h-4 w-4" />, color: 'text-slate-600',   badge: 'bg-slate-100 text-slate-600'   },
  { key: 'medication',            label: 'Med. Comuns',      icon: <Pill         className="h-4 w-4" />, color: 'text-blue-600',    badge: 'bg-blue-100 text-blue-700'    },
  { key: 'controlled_medication', label: 'Controlados',      icon: <Shield       className="h-4 w-4" />, color: 'text-red-600',     badge: 'bg-red-100 text-red-700'      },
  { key: 'clinic_product',        label: 'Clínica',          icon: <FlaskConical className="h-4 w-4" />, color: 'text-purple-600',  badge: 'bg-purple-100 text-purple-700' },
  { key: 'petshop',               label: 'Petshop',          icon: <ShoppingBag  className="h-4 w-4" />, color: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700'  },
  { key: 'grooming_supply',       label: 'Banho e Tosa',     icon: <Scissors     className="h-4 w-4" />, color: 'text-pink-600',    badge: 'bg-pink-100 text-pink-700'    },
  { key: 'aesthetics',            label: 'Estética/Perfum.', icon: <Sparkles     className="h-4 w-4" />, color: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700' },
]

// ─── Categorias de Serviços ───────────────────────────────────────────────────

const SERVICE_CATS: {
  key: StockCategory | 'all'; label: string; icon: React.ReactNode; color: string; badge: string
}[] = [
  { key: 'all',               label: 'Todos',        icon: <Package      className="h-4 w-4" />, color: 'text-slate-600',   badge: 'bg-slate-100 text-slate-600'   },
  { key: 'vet_service',       label: 'Veterinário',  icon: <Stethoscope  className="h-4 w-4" />, color: 'text-teal-600',    badge: 'bg-teal-100 text-teal-700'    },
  { key: 'grooming_service',  label: 'Banho e Tosa', icon: <Scissors     className="h-4 w-4" />, color: 'text-pink-600',    badge: 'bg-pink-100 text-pink-700'    },
  { key: 'aesthetics_service',label: 'Estética',     icon: <Sparkles     className="h-4 w-4" />, color: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700' },
  { key: 'exam',              label: 'Exame/Lab',    icon: <FlaskConical className="h-4 w-4" />, color: 'text-indigo-600',  badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'surgery',           label: 'Cirurgia',     icon: <Scissors     className="h-4 w-4" />, color: 'text-red-600',     badge: 'bg-red-100 text-red-700'      },
  { key: 'service',           label: 'Procedimentos', icon: <Activity     className="h-4 w-4" />, color: 'text-slate-600',   badge: 'bg-slate-100 text-slate-600'  },
]

// Campos condicionais por categoria de produto
const CAT_FIELDS: Record<string, { batch: boolean; expiry: boolean; barcode: boolean; sku: boolean }> = {
  medication:            { batch: true,  expiry: true,  barcode: false, sku: false },
  controlled_medication: { batch: true,  expiry: true,  barcode: false, sku: false },
  clinic_product:        { batch: true,  expiry: true,  barcode: false, sku: false },
  petshop:               { batch: false, expiry: false, barcode: true,  sku: true  },
  grooming_supply:       { batch: false, expiry: true,  barcode: false, sku: false },
  aesthetics:            { batch: false, expiry: true,  barcode: true,  sku: true  },
}

const SERVICE_CAT_KEYS = new Set(['service', 'exam', 'vet_service', 'grooming_service', 'aesthetics_service', 'surgery'])

const UNITS = ['un', 'comprimido', 'cápsula', 'frasco', 'ampola', 'ml', 'mg', 'g', 'kg', 'l', 'caixa', 'sachê', 'kit', 'par', 'rolo', 'bisnaga', 'spray', 'tubo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(item: StockItemV2): 'critical' | 'warning' | 'ok' {
  if (item.quantity <= 0)                          return 'critical'
  if (item.quantity < item.min_quantity)           return 'critical'
  if (item.quantity < item.min_quantity * 1.5)     return 'warning'
  return 'ok'
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Types / Form ─────────────────────────────────────────────────────────────

interface Props {
  stock:         StockItemV2[]
  userRole:      'admin' | 'vet'
  activeModules?: string[]
}

interface ItemForm {
  name: string; category: StockCategory; quantity: string; unit: string
  min_quantity: string; unit_price: string; is_controlled: boolean
  brand: string; sku: string; barcode: string; batch_number: string
  expiry_date: string; supplier: string
  /** Preço base do serviço quando o pet tem convênio. Vazio = sem default. */
  default_insurance_price: string
  /** Épico A (04/06): % de taxa sobre a coparticipação quando paga no cartão. */
  insurance_card_interest_percent: string
  /** NFS-e (Fase 3): item da lista de serviço LC116 + código tributário municipal. */
  nfse_item_lista_servico: string
  nfse_codigo_tributario_municipio: string
}

const EMPTY_PRODUCT_FORM: ItemForm = {
  name: '', category: 'medication', quantity: '0', unit: 'un',
  min_quantity: '0', unit_price: '0', is_controlled: false,
  brand: '', sku: '', barcode: '', batch_number: '', expiry_date: '', supplier: '',
  default_insurance_price: '',
  insurance_card_interest_percent: '',
  nfse_item_lista_servico: '', nfse_codigo_tributario_municipio: '',
}

const EMPTY_SERVICE_FORM: ItemForm = {
  name: '', category: 'service', quantity: '0', unit: 'un',
  min_quantity: '0', unit_price: '0', is_controlled: false,
  brand: '', sku: '', barcode: '', batch_number: '', expiry_date: '', supplier: '',
  default_insurance_price: '',
  insurance_card_interest_percent: '',
  nfse_item_lista_servico: '', nfse_codigo_tributario_municipio: '',
}

function formFromItem(item: StockItemV2): ItemForm {
  return {
    name: item.name, category: item.category,
    quantity: String(item.quantity), unit: item.unit,
    min_quantity: String(item.min_quantity), unit_price: String(item.unit_price),
    is_controlled: item.is_controlled, brand: item.brand ?? '', sku: item.sku ?? '',
    barcode: item.barcode ?? '', batch_number: item.batch_number ?? '',
    expiry_date: item.expiry_date ?? '', supplier: item.supplier ?? '',
    default_insurance_price: item.default_insurance_price === null ? '' : String(item.default_insurance_price),
    insurance_card_interest_percent: Number(item.insurance_card_interest_percent ?? 0) > 0
      ? String(item.insurance_card_interest_percent)
      : '',
    nfse_item_lista_servico: item.nfse_item_lista_servico ?? '',
    nfse_codigo_tributario_municipio: item.nfse_codigo_tributario_municipio ?? '',
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PharmacyWorkspace({ stock: initialStock, userRole, activeModules = [] }: Props) {
  const [stock, setStock]   = useState<StockItemV2[]>(initialStock)
  const [view, setView]     = useState<'products' | 'services' | 'packages'>('products')
  const [catTab, setCatTab] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'ok'>('all')

  // Catalog suggestions (empty-state search)
  const [catalogSuggestions, setCatalogSuggestions] = useState<GlobalCatalogSuggestion[]>([])
  const [catalogLoading, setCatalogLoading]         = useState(false)
  const [quickAddSuggestion, setQuickAddSuggestion] = useState<GlobalCatalogSuggestion | null>(null)
  const catalogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modals
  const [formModal, setFormModal]       = useState<{ mode: 'add' | 'edit'; item?: StockItemV2; serviceMode?: boolean } | null>(null)
  const [restockItem, setRestockItem]   = useState<StockItemV2 | null>(null)
  const [dispenseItem, setDispenseItem] = useState<StockItemV2 | null>(null)
  const [adjustItem, setAdjustItem]     = useState<StockItemV2 | null>(null)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [enrichItem,   setEnrichItem]   = useState<StockItemV2 | null>(null)

  const [toast, setToast]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [, startTx]          = useTransition()

  function showToast(msg: string, ok = true) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function switchView(v: 'products' | 'services' | 'packages') {
    setView(v); setCatTab('all'); setSearch(''); setStatusFilter('all')
    setCatalogSuggestions([])
  }

  // Trigger catalog search when filtered list is empty and search >= 3 chars
  const triggerCatalogSearch = useCallback((term: string, filteredLen: number) => {
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)
    if (term.length < 3 || view !== 'products') {
      setCatalogSuggestions([])
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(true)
    catalogDebounceRef.current = setTimeout(async () => {
      const results = await searchGlobalCatalog(term, undefined, 6, activeModules)
      if (!Array.isArray(results)) { setCatalogLoading(false); return }
      setCatalogSuggestions(results)
      setCatalogLoading(false)
    }, 400)
  }, [view])

  // Clear suggestions when search is cleared
  useEffect(() => {
    if (!search || search.length < 3) {
      setCatalogSuggestions([])
      setCatalogLoading(false)
      if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)
    }
  }, [search])

  // Split stock
  const products   = useMemo(() => stock.filter(i => !i.is_service), [stock])
  const services   = useMemo(() => stock.filter(i => i.is_service),  [stock])
  const activeList = view === 'products' ? products : services
  const activeCats = view === 'products' ? PRODUCT_CATS : SERVICE_CATS

  // Counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: activeList.length }
    for (const item of activeList) map[item.category] = (map[item.category] ?? 0) + 1
    return map
  }, [activeList])

  const expiringCount = useMemo(() =>
    products.filter(i => { const d = daysUntilExpiry(i.expiry_date); return d !== null && d <= 30 }).length
  , [products])

  const lowCount = useMemo(() => products.filter(i => stockStatus(i) === 'critical').length, [products])

  // Filter
  const filtered = useMemo(() => {
    return activeList.filter(item => {
      if (catTab !== 'all' && item.category !== catTab) return false
      const q = search.toLowerCase()
      if (q && !item.name.toLowerCase().includes(q)
            && !(item.brand ?? '').toLowerCase().includes(q)
            && !(item.sku ?? '').toLowerCase().includes(q)) return false
      if (view === 'products') {
        if (statusFilter === 'critical') return stockStatus(item) === 'critical'
        if (statusFilter === 'ok')       return stockStatus(item) === 'ok'
      }
      return true
    })
  }, [activeList, catTab, search, statusFilter, view])

  // Trigger catalog suggestions whenever search >= 3 chars (regardless of stock results)
  useEffect(() => {
    if (view !== 'products') return
    if (search.length >= 3) {
      triggerCatalogSearch(search, filtered.length)
    } else {
      setCatalogSuggestions([])
      setCatalogLoading(false)
      if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)
    }
  }, [filtered.length, search, view, triggerCatalogSearch])

  // CRUD handlers
  function handleSaved(item: StockItemV2, isNew: boolean) {
    setStock(prev =>
      isNew ? [...prev, item].sort((a, b) => a.name.localeCompare(b.name))
             : prev.map(i => i.id === item.id ? item : i)
    )
    setFormModal(null)
    showToast(isNew ? 'Item cadastrado com sucesso!' : 'Item atualizado com sucesso!')
  }

  function handleCatalogQuickSaved(item: StockItemV2) {
    setStock(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))
    setQuickAddSuggestion(null)
    setCatalogSuggestions([])
    setSearch('')
    showToast('Item cadastrado no estoque!')
  }

  function handleDeleted(id: string) {
    setStock(prev => prev.filter(i => i.id !== id))
    showToast('Item removido.')
  }

  function handleRestocked(id: string, newQty: number) {
    setStock(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty, last_restock: new Date().toISOString() } : i))
    setRestockItem(null)
    showToast('Estoque reposto!')
  }

  function handleDispensed(id: string, newQty: number) {
    setStock(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
    setDispenseItem(null)
    showToast('Item dispensado.')
  }

  function handleAdjusted(id: string, newQty: number) {
    setStock(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
    setAdjustItem(null)
    showToast('Quantidade ajustada.')
  }

  const isServiceView = view === 'services'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 animate-enter">

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Estoque</h1>
              <p className="text-sm text-slate-600">
                {products.length} produto{products.length !== 1 ? 's' : ''} · {services.length} serviço{services.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Importar CSV — apenas estoque */}
              {userRole === 'admin' && view !== 'packages' && (
                <button
                  onClick={() => setCsvImportOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> Importar CSV
                </button>
              )}
              {/* Novo item — apenas estoque */}
              {userRole === 'admin' && view !== 'packages' && (
                <button
                  onClick={() => setFormModal({ mode: 'add', serviceMode: isServiceView })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-sm hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden xs:inline">{isServiceView ? 'Novo Serviço' : 'Novo Item'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Toggle Produtos / Serviços / Pacotes — linha separada, scroll em mobile */}
          <div className="w-full overflow-x-auto pb-0.5 -mb-0.5">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white w-full sm:w-auto">
              <button
                onClick={() => switchView('products')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  view === 'products' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Package className="h-3.5 w-3.5" /> Produtos
              </button>
              <button
                onClick={() => switchView('services')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors border-l border-slate-200 ${
                  view === 'services' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Stethoscope className="h-3.5 w-3.5" /> Serviços
              </button>
              <button
                onClick={() => switchView('packages')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors border-l border-slate-200 ${
                  view === 'packages' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Gift className="h-3.5 w-3.5" /> Pacotes e Planos
              </button>
            </div>
          </div>
        </div>

        {/* Alertas — apenas para produtos */}
        {view === 'products' && (lowCount > 0 || expiringCount > 0) && (
          <div className="flex flex-wrap gap-3">
            {lowCount > 0 && (
              <button
                onClick={() => setStatusFilter(s => s === 'critical' ? 'all' : 'critical')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  statusFilter === 'critical'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
                {lowCount} item{lowCount !== 1 ? 's' : ''} abaixo do mínimo
              </button>
            )}
            {expiringCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                {expiringCount} item{expiringCount !== 1 ? 's' : ''} vence{expiringCount === 1 ? '' : 'm'} em 30 dias
              </div>
            )}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-enter-fast ${
            toast.ok ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
          </div>
        )}

        {/* Tabs de categoria — oculto em Pacotes */}
        {view !== 'packages' && <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {activeCats.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCatTab(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                catTab === cat.key
                  ? 'bg-white border-teal-500 text-teal-700 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span className={catTab === cat.key ? 'text-teal-600' : 'text-slate-400'}>{cat.icon}</span>
              {cat.label}
              {counts[cat.key] !== undefined && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${catTab === cat.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[cat.key] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>}

        {/* Search + filtros — oculto em Pacotes */}
        {view !== 'packages' && <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isServiceView ? 'Buscar por nome…' : 'Buscar por nome, marca ou código…'}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {view === 'products' && (
            <button
              onClick={() => setStatusFilter(s => s === 'ok' ? 'all' : 'ok')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === 'ok'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              Normais
            </button>
          )}
        </div>}

        {/* Conteúdo principal */}
        {view === 'packages'
          ? <PackagesTab userRole={userRole} />
          : isServiceView
          ? <ServicesTable
              filtered={filtered}
              userRole={userRole}
              onEdit={item => setFormModal({ mode: 'edit', item, serviceMode: true })}
              onDelete={id => {
                startTx(async () => {
                  const res = await deleteStockItemV2(id)
                  if ('error' in res) showToast(res.error, false)
                  else handleDeleted(id)
                })
              }}
            />
          : <ProductsTable
              filtered={filtered}
              userRole={userRole}
              searchTerm={search}
              catalogLoading={catalogLoading}
              catalogSuggestions={catalogSuggestions}
              onCatalogQuickAdd={setQuickAddSuggestion}
              onManualAdd={() => setFormModal({ mode: 'add' })}
              onEdit={item => setFormModal({ mode: 'edit', item })}
              onDelete={id => {
                startTx(async () => {
                  const res = await deleteStockItemV2(id)
                  if ('error' in res) showToast(res.error, false)
                  else handleDeleted(id)
                })
              }}
              onRestock={setRestockItem}
              onDispense={setDispenseItem}
              onAdjust={setAdjustItem}
              onEnrich={setEnrichItem}
            />
        }
      </div>


      {/* Modal: Cadastro / Edição */}
      {formModal && (
        <ItemFormModal
          mode={formModal.mode}
          item={formModal.item}
          serviceMode={formModal.serviceMode}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Modal: Repor */}
      {restockItem && (
        <SimpleModal title={`Repor: ${restockItem.name}`} onClose={() => setRestockItem(null)} color="blue">
          <RestockForm item={restockItem} onDone={qty => handleRestocked(restockItem.id, qty)} onError={msg => showToast(msg, false)} />
        </SimpleModal>
      )}

      {/* Modal: Dispensar */}
      {dispenseItem && (
        <SimpleModal title={`Dispensar: ${dispenseItem.name}`} onClose={() => setDispenseItem(null)} color="green">
          <DispenseForm item={dispenseItem} onDone={qty => handleDispensed(dispenseItem.id, qty)} onError={msg => showToast(msg, false)} />
        </SimpleModal>
      )}

      {/* Modal: Ajustar */}
      {adjustItem && (
        <SimpleModal title={`Ajustar: ${adjustItem.name}`} onClose={() => setAdjustItem(null)} color="amber">
          <AdjustForm item={adjustItem} onDone={qty => handleAdjusted(adjustItem.id, qty)} onError={msg => showToast(msg, false)} />
        </SimpleModal>
      )}

      {/* Modal: Enriquecer NCM/EAN */}
      {enrichItem && (
        <EnrichNcmModal
          item={enrichItem}
          onClose={() => setEnrichItem(null)}
          onSaved={updated => {
            setStock(prev => prev.map(i => i.id === updated.id ? updated : i))
            setEnrichItem(null)
            showToast('Dados fiscais salvos!')
          }}
        />
      )}

      {/* Importação CSV */}
      {csvImportOpen && (
        <StockCsvImporter
          mode={isServiceView ? 'services' : 'products'}
          onDone={inserted => {
            setCsvImportOpen(false)
            showToast(`${inserted} ${inserted !== 1 ? 'itens importados' : 'item importado'}!`)
            setTimeout(() => window.location.reload(), 1800)
          }}
          onClose={() => setCsvImportOpen(false)}
        />
      )}

      {/* Modal: Cadastro rápido a partir do catálogo global */}
      {quickAddSuggestion && (
        <PharmacyCatalogQuickAdd
          suggestion={quickAddSuggestion}
          onClose={() => setQuickAddSuggestion(null)}
          onSaved={handleCatalogQuickSaved}
        />
      )}
    </div>
  )
}

// ─── Tabela de Produtos ───────────────────────────────────────────────────────

function CatBadge({ cat }: { cat: typeof PRODUCT_CATS[number] | undefined }) {
  if (!cat) return null
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cat.badge}`}>
      {cat.icon}{cat.label}
    </span>
  )
}

function ProductsTable({ filtered, userRole, searchTerm, catalogLoading, catalogSuggestions, onCatalogQuickAdd, onManualAdd, onEdit, onDelete, onRestock, onDispense, onAdjust, onEnrich }: {
  filtered:             StockItemV2[]
  userRole:             'admin' | 'vet'
  searchTerm:           string
  catalogLoading:       boolean
  catalogSuggestions:   GlobalCatalogSuggestion[]
  onCatalogQuickAdd:    (s: GlobalCatalogSuggestion) => void
  onManualAdd:          () => void
  onEdit:               (item: StockItemV2) => void
  onDelete:             (id: string) => void
  onRestock:            (item: StockItemV2) => void
  onDispense:           (item: StockItemV2) => void
  onAdjust:             (item: StockItemV2) => void
  onEnrich?:            (item: StockItemV2) => void
}) {
  if (filtered.length === 0) {
    const isSearching = searchTerm.length >= 3
    return (
      <div className="space-y-3">
        {/* Empty state panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Header: search not found */}
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center border-b border-slate-100">
            <Search className="h-8 w-8 mb-2 text-slate-300" />
            {isSearching ? (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  "{searchTerm}" não encontrado no estoque
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {catalogLoading ? 'Buscando sugestões no Catálogo Veterinário…' : 'Veja sugestões abaixo ou cadastre manualmente'}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-slate-400">Nenhum produto encontrado</p>
            )}
          </div>

          {/* Catalog suggestions */}
          {isSearching && (
            <div className="p-4 space-y-2">
              {catalogLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Buscando no Catálogo Veterinário…</span>
                </div>
              ) : catalogSuggestions.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pb-1">
                    Sugestões do Catálogo Veterinário
                  </p>
                  {catalogSuggestions.map(s => {
                    const cat = PRODUCT_CATS.find(c => c.key === s.category)
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                      >
                        {/* Category icon */}
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${cat?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                          {cat?.icon ?? <Package className="h-4 w-4" />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900 leading-tight">{s.name}</p>
                            {s.ncm && (
                              <span className="text-[9px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">
                                NCM {s.ncm}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{s.brand}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <CatBadge cat={cat} />
                            {s.price_avg != null && (
                              <span className="text-xs font-semibold text-slate-600 font-mono tabular-nums">
                                R$ {s.price_avg.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action button — only for admin */}
                        {userRole === 'admin' && (
                          <button
                            onClick={() => onCatalogQuickAdd(s)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Cadastrar
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                  <Package className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma sugestão encontrada</p>
                  <p className="text-xs mt-0.5">Cadastre o produto manualmente</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botão Cadastrar Manualmente */}
        {userRole === 'admin' && (
          <button
            onClick={onManualAdd}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-medium hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Cadastrar produto manualmente
          </button>
        )}
      </div>
    )
  }
  const hasCatalog = catalogLoading || catalogSuggestions.length > 0
  return (
    <div className="space-y-3">
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qtd.</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unid.</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Preço</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Validade</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(item => {
              const st = stockStatus(item)
              const days = daysUntilExpiry(item.expiry_date)
              const expiring = days !== null && days <= 30
              const cat = PRODUCT_CATS.find(c => c.key === item.category)
              return (
                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${expiring ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 leading-tight">{item.name}</p>
                        {item.is_controlled && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide">Controlado</span>
                        )}
                      </div>
                      {(item.brand || item.sku) && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {[item.brand, item.sku && `SKU: ${item.sku}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {item.supplier && <p className="text-[11px] text-slate-400">{item.supplier}</p>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat?.badge ?? 'bg-slate-100 text-slate-600'}`}>
                      {cat?.icon}{cat?.label ?? item.category}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-right font-bold font-mono tabular-nums ${
                    st === 'critical' ? 'text-red-600' : st === 'warning' ? 'text-amber-600' : 'text-slate-900'
                  }`}>
                    {Number(item.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-500 text-xs">{item.unit}</td>
                  <td className="px-3 py-3 text-right text-slate-600 font-mono tabular-nums text-xs">
                    {item.unit_price > 0 ? `R$ ${item.unit_price.toFixed(2)}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {item.expiry_date ? (
                      <span className={`text-xs font-medium font-mono tabular-nums ${
                        days !== null && days < 0   ? 'text-red-600 font-bold' :
                        days !== null && days <= 30 ? 'text-amber-600' : 'text-slate-500'
                      }`}>
                        {days !== null && days < 0 ? '⚠ Vencido' : formatDate(item.expiry_date)}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      st === 'critical' ? 'bg-red-50 border-red-200 text-red-700' :
                      st === 'warning'  ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                          'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}>
                      {st === 'critical' ? 'Crítico' : st === 'warning' ? 'Atenção' : 'OK'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn title="Repor"     color="blue"  onClick={() => onRestock(item)}><RefreshCw className="h-3.5 w-3.5" /></ActionBtn>
                      <ActionBtn title="Dispensar" color="green" onClick={() => onDispense(item)}><ArrowDownToLine className="h-3.5 w-3.5" /></ActionBtn>
                      {userRole === 'admin' && <>
                        {onEnrich && !(item as any).ncm && !item.barcode && (
                          <ActionBtn title="Enriquecer NCM/EAN" color="teal" onClick={() => onEnrich(item)}>
                            <Sparkles className="h-3.5 w-3.5" />
                          </ActionBtn>
                        )}
                        <ActionBtn title="Editar"  color="teal"  onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                        <ActionBtn title="Ajustar" color="amber" onClick={() => onAdjust(item)}><Package className="h-3.5 w-3.5" /></ActionBtn>
                        <ActionBtn title="Remover" color="red"   onClick={() => onDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                      </>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>

    {/* Sugestões do catálogo veterinário — aparece mesmo quando há resultados em estoque */}
    {hasCatalog && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <Sparkles className="h-4 w-4 text-teal-600" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {catalogLoading ? 'Buscando no Catálogo Veterinário…' : `Sugestões do Catálogo Veterinário (${catalogSuggestions.length})`}
          </p>
        </div>
        <div className="p-3 space-y-2">
          {catalogLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Buscando…</span>
            </div>
          ) : catalogSuggestions.map(s => {
            const cat = PRODUCT_CATS.find(c => c.key === s.category)
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 transition-colors">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cat?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                  {cat?.icon ?? <Package className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">{s.name}</p>
                    {s.ncm && (
                      <span className="text-[9px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 uppercase tracking-wide">NCM {s.ncm}</span>
                    )}
                    {s.barcode && (
                      <span className="text-[9px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">EAN {s.barcode}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {s.brand && <p className="text-xs text-slate-500">{s.brand}</p>}
                    {s.price_avg != null && (
                      <span className="text-xs font-bold text-emerald-700 font-mono tabular-nums">R$ {s.price_avg.toFixed(2)}</span>
                    )}
                    {s.unit && <span className="text-xs text-slate-400">· {s.unit}</span>}
                  </div>
                </div>
                {userRole === 'admin' && (
                  <button
                    onClick={() => onCatalogQuickAdd(s)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Cadastrar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )}
    </div>
  )
}

// ─── Tabela de Serviços ───────────────────────────────────────────────────────

function ServicesTable({ filtered, userRole, onEdit, onDelete }: {
  filtered: StockItemV2[]
  userRole: 'admin' | 'vet'
  onEdit:   (item: StockItemV2) => void
  onDelete: (id: string) => void
}) {
  if (filtered.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
        <Stethoscope className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Nenhum serviço cadastrado</p>
        <p className="text-xs mt-1">Adicione manualmente ou importe via CSV</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serviço / Procedimento</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Preço</th>
              {userRole === 'admin' && (
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(item => {
              const cat = SERVICE_CATS.find(c => c.key === item.category)
              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    {item.supplier && <p className="text-[11px] text-slate-400 mt-0.5">{item.supplier}</p>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat?.badge ?? 'bg-slate-100 text-slate-600'}`}>
                      {cat?.icon}{cat?.label ?? item.category}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900 font-mono tabular-nums">
                    {item.unit_price > 0
                      ? `R$ ${item.unit_price.toFixed(2)}`
                      : <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  {userRole === 'admin' && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn title="Editar"  color="teal" onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                        <ActionBtn title="Remover" color="red"  onClick={() => onDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sub-componentes genéricos ────────────────────────────────────────────────

function ActionBtn({ children, title, color, onClick }: {
  children: React.ReactNode; title: string
  color: 'blue' | 'green' | 'teal' | 'amber' | 'red'
  onClick: () => void
}) {
  const colors = {
    blue:  'text-sky-500 hover:bg-sky-50 hover:text-sky-700',
    green: 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700',
    teal:  'text-teal-500 hover:bg-teal-50 hover:text-teal-700',
    amber: 'text-amber-500 hover:bg-amber-50 hover:text-amber-700',
    red:   'text-slate-400 hover:bg-red-50 hover:text-red-600',
  }
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-lg transition-colors ${colors[color]}`}>
      {children}
    </button>
  )
}

function SimpleModal({ title, onClose, color, children }: {
  title: string; onClose: () => void
  color: 'blue' | 'green' | 'amber'
  children: React.ReactNode
}) {
  const headers = {
    blue:  'from-teal-600 to-teal-700',
    green: 'from-emerald-600 to-emerald-700',
    amber: 'from-amber-600 to-amber-700',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden animate-scale-in">
        <div className={`bg-gradient-to-r ${headers[color]} px-5 py-4 flex items-center justify-between`}>
          <p className="text-sm font-semibold text-white">{title}</p>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── ItemFormModal (Cadastro / Edição) ────────────────────────────────────────

function ItemFormModal({ mode, item, serviceMode, onClose, onSaved }: {
  mode:         'add' | 'edit'
  item?:        StockItemV2
  serviceMode?: boolean
  onClose:      () => void
  onSaved:      (item: StockItemV2, isNew: boolean) => void
}) {
  const defaultForm = serviceMode ? EMPTY_SERVICE_FORM : EMPTY_PRODUCT_FORM
  const [form, setForm]     = useState<ItemForm>(item ? formFromItem(item) : defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [providers, setProviders] = useState<InsuranceProvider[]>([])
  const [acceptedProviderIds, setAcceptedProviderIds] = useState<string[]>([])
  // Campos fiscais de serviço só aparecem quando a clínica emite NFS-e (Fase 3).
  const [emitsNfse, setEmitsNfse] = useState(false)

  const isNew     = mode === 'add'
  const isService = serviceMode || SERVICE_CAT_KEYS.has(form.category)
  const fields    = CAT_FIELDS[form.category] ?? { batch: false, expiry: false, barcode: false, sku: false }

  // Carrega convênios + IDs já vinculados (apenas em modo serviço)
  useEffect(() => {
    if (!isService) return
    getInsuranceProviders().then(res => {
      if (!('error' in res)) setProviders(res.filter(p => p.is_active))
    })
    if (item?.id) {
      getProvidersForStockItem(item.id).then(res => {
        if (!('error' in res)) setAcceptedProviderIds(res)
      })
    }
  }, [isService, item?.id])

  // Descobre se a clínica emite NFS-e (revela os campos fiscais do serviço).
  useEffect(() => {
    if (!isService) return
    clinicEmitsNfse().then(res => setEmitsNfse(res.emits))
  }, [isService])

  function toggleProvider(id: string) {
    setAcceptedProviderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function set(key: keyof ItemForm, val: string | boolean) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError(null)

    const basePayload = {
      name:          form.name,
      category:      form.category,
      unit:          form.unit,
      min_quantity:  isService ? 0 : Number(form.min_quantity),
      unit_price:    Number(form.unit_price),
      is_controlled: form.is_controlled,
      is_service:    isService,
      brand:         form.brand || null,
      sku:           form.sku || null,
      barcode:       form.barcode || null,
      batch_number:  form.batch_number || null,
      expiry_date:   form.expiry_date || null,
      supplier:      form.supplier || null,
      default_insurance_price: form.default_insurance_price.trim() === ''
        ? null
        : Number(form.default_insurance_price.replace(',', '.')),
      insurance_card_interest_percent: form.insurance_card_interest_percent.trim() === ''
        ? 0
        : Math.min(100, Math.max(0, Number(form.insurance_card_interest_percent.replace(',', '.')) || 0)),
      // NFS-e (Fase 3): só faz sentido para serviços.
      nfse_item_lista_servico:          isService ? (form.nfse_item_lista_servico.trim() || null) : null,
      nfse_codigo_tributario_municipio: isService ? (form.nfse_codigo_tributario_municipio.trim() || null) : null,
    }

    if (isNew) {
      const res = await addStockItemV2({ ...basePayload, quantity: isService ? 0 : Number(form.quantity) })
      if ('error' in res) { setSaving(false); setError(res.error); return }
      if (isService && providers.length > 0) {
        await setProvidersForStockItem(res.id, acceptedProviderIds)
      }
      setSaving(false)
      onSaved(res, true)
    } else {
      const res = await updateStockItemV2(item!.id, basePayload)
      if ('error' in res) { setSaving(false); setError(res.error); return }
      if (isService && providers.length > 0) {
        await setProvidersForStockItem(item!.id, acceptedProviderIds)
      }
      setSaving(false)
      onSaved(res, false)
    }
  }

  const headerTitle = isService
    ? (isNew ? 'Novo Serviço / Procedimento' : `Editar: ${item?.name}`)
    : (isNew ? 'Novo Item de Estoque'         : `Editar: ${item?.name}`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              {isService ? <Stethoscope className="h-4 w-4 text-white" /> : <Package className="h-4 w-4 text-white" />}
            </div>
            <p className="text-sm font-semibold text-white">{headerTitle}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Categoria */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              {isService ? 'Tipo' : 'Categoria'} <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {(isService ? SERVICE_CATS.filter(c => c.key !== 'all') : PRODUCT_CATS.filter(c => c.key !== 'all')).map(cat => (
                <button key={cat.key} type="button"
                  onClick={() => {
                    set('category', cat.key)
                    if (cat.key === 'controlled_medication') set('is_controlled', true)
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-left text-xs font-semibold transition-all ${
                    form.category === cat.key
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className={form.category === cat.key ? 'text-teal-600' : 'text-slate-400'}>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nome + (Marca para produtos) */}
          <div className={`grid gap-3 ${isService ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nome <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder={isService ? 'Ex: Consulta Clínica, Hemograma…' : 'Ex: Amoxicilina 250mg'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            {!isService && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Marca / Fabricante</label>
                <input value={form.brand} onChange={e => set('brand', e.target.value)}
                  placeholder="Ex: Duprat, Vetnil…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
            )}
          </div>

          {/* Campos de estoque (apenas produtos) */}
          {!isService && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {isNew && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Qtd. inicial</label>
                  <input type="number" min="0" step="0.001" value={form.quantity} onChange={e => set('quantity', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade</label>
                <select value={form.unit} onChange={e => set('unit', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estoque mínimo</label>
                <input type="number" min="0" step="0.001" value={form.min_quantity} onChange={e => set('min_quantity', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Preço unitário (R$)</label>
                <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => set('unit_price', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
            </div>
          )}

          {/* Preço para serviços */}
          {isService && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Preço Particular (R$)</label>
                <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => set('unit_price', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                <p className="text-[10px] text-slate-400 mt-1">Valor cheio cobrado quando o pet NÃO tem convênio.</p>
              </div>

              {/* Item 5 (2026-06-02): preço base de convênio + sugestão IA */}
              <DefaultInsurancePriceField
                stockItemId={item?.id ?? null}
                value={form.default_insurance_price}
                onChange={v => set('default_insurance_price', v)}
              />

              {/* Épico A (04/06): taxa % sobre a coparticipação no cartão */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  % de taxa sobre coparticipação (cartão)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.insurance_card_interest_percent}
                  onChange={e => set('insurance_card_interest_percent', e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Aplicada automaticamente quando o tutor pagar a coparticipação do convênio no cartão.
                  Inclua aqui taxa da maquininha + impostos (ex.: 10% → R$ 3,02 sobre copart de R$ 30,21).
                  Não afeta dinheiro/PIX nem itens particulares.
                </p>
              </div>

              {/* NFS-e (Fase 3): códigos fiscais do serviço — só quando a clínica emite nota */}
              {emitsNfse && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Dados fiscais (NFS-e)
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Item da Lista de Serviço (LC 116)</label>
                      <input type="text" value={form.nfse_item_lista_servico}
                        onChange={e => set('nfse_item_lista_servico', e.target.value)}
                        placeholder="ex.: 5.07"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Código Tributário do Município</label>
                      <input type="text" value={form.nfse_codigo_tributario_municipio}
                        onChange={e => set('nfse_codigo_tributario_municipio', e.target.value)}
                        placeholder="código do serviço no município"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Usados na emissão da NFS-e deste serviço. A alíquota de ISS é definida em Configurações &gt; Contábil.
                  </p>
                </div>
              )}

              {/* Item B (2026-06-02): convênios que aceitam este serviço */}
              {providers.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Convênios que aceitam este serviço
                  </label>
                  <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    {providers.map(p => {
                      const checked = acceptedProviderIds.includes(p.id)
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                            checked ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProvider(p.id)}
                            className="hidden"
                          />
                          {p.name}
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Se nenhum convênio for marcado, o serviço fica disponível em todos. Para restringir a convênios específicos, marque-os acima.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Fornecedor */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isService ? 'Observações / Fornecedor' : 'Fornecedor / Distribuidora'}
            </label>
            <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
              placeholder={isService ? 'Ex: Laboratório, notas…' : 'Ex: Distribuidora Pet Brasil'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>

          {/* Campos condicionais de lote/validade/sku/barcode (apenas produtos) */}
          {!isService && (fields.batch || fields.expiry) && (
            <div className="grid grid-cols-2 gap-3">
              {fields.batch && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Número do Lote</label>
                  <input value={form.batch_number} onChange={e => set('batch_number', e.target.value)}
                    placeholder="Ex: LOT2024A"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              )}
              {fields.expiry && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Data de Validade</label>
                  <input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              )}
            </div>
          )}

          {!isService && (fields.sku || fields.barcode) && (
            <div className="grid grid-cols-2 gap-3">
              {fields.sku && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">SKU / Cód. Interno</label>
                  <input value={form.sku} onChange={e => set('sku', e.target.value)}
                    placeholder="Ex: PET-001"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              )}
              {fields.barcode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Código de Barras (EAN)</label>
                  <input value={form.barcode} onChange={e => set('barcode', e.target.value)}
                    placeholder="7890000000000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              )}
            </div>
          )}

          {/* Toggle controlado (apenas produtos) */}
          {!isService && (
            <>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => set('is_controlled', !form.is_controlled)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${form.is_controlled ? 'bg-red-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_controlled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-700">Medicamento Controlado</span>
                  <p className="text-[11px] text-slate-400">Receituário Azul / Amarelo — CFMV</p>
                </div>
              </label>
              {form.is_controlled && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <Shield className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">
                    A dispensação exige receituário assinado por Médico Veterinário (CFMV). Mantenha os registros para fiscalização.
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isNew ? 'Cadastrar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Formulários: Repor / Dispensar / Ajustar ─────────────────────────────────

function RestockForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (qty: number) => void; onError: (msg: string) => void
}) {
  const [qty, setQty]       = useState('')
  const [notes, setNotes]   = useState('')
  const [expiry, setExpiry] = useState('')
  const [batch, setBatch]   = useState('')
  const [saving, setSaving] = useState(false)
  async function handle() {
    if (!qty || Number(qty) <= 0) { onError('Informe uma quantidade válida.'); return }
    setSaving(true)
    // Retroalimentação FIFO: cria um novo lote com a validade informada.
    const res = await restockItemV2(item.id, Number(qty), notes || undefined, {
      expiryDate:  expiry || null,
      batchNumber: batch  || null,
    })
    setSaving(false)
    if ('error' in res) { onError(res.error); return }
    onDone(res.new_quantity)
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Qtd. atual: <strong className="text-slate-800 font-mono tabular-nums">{item.quantity} {item.unit}</strong></p>
      <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
        placeholder="Quantidade a adicionar"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Validade do lote</span>
          <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Nº do lote</span>
          <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="opcional"
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </label>
      </div>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota: NF, fornecedor… (opcional)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
      <button onClick={handle} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Repor Estoque
      </button>
    </div>
  )
}

function DispenseForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (qty: number) => void; onError: (msg: string) => void
}) {
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  async function handle() {
    if (!qty || Number(qty) <= 0) { onError('Informe uma quantidade válida.'); return }
    setSaving(true)
    const res = await dispenseStockItem(item.id, Number(qty), notes || undefined)
    setSaving(false)
    if ('error' in res) { onError(res.error); return }
    onDone(res.new_quantity)
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Disponível: <strong className="text-slate-800 font-mono tabular-nums">{item.quantity} {item.unit}</strong>
        {item.is_controlled && <span className="ml-2 text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">CONTROLADO</span>}
      </p>
      <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
        placeholder="Quantidade a dispensar"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota: consulta, paciente… (opcional)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
      <button onClick={handle} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} Dispensar
      </button>
    </div>
  )
}

function AdjustForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (qty: number) => void; onError: (msg: string) => void
}) {
  const [qty, setQty]     = useState(String(item.quantity))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  async function handle() {
    if (!notes.trim()) { onError('Informe o motivo do ajuste.'); return }
    setSaving(true)
    const res = await adjustStockItemV2(item.id, Number(qty), notes)
    setSaving(false)
    if ('error' in res) { onError(res.error); return }
    onDone(Number(qty))
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">Ajuste manual requer motivo para fins de auditoria.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nova quantidade</label>
        <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo <span className="text-red-500">*</span></label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Inventário mensal, quebra, vencimento…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
      </div>
      <button onClick={handle} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar Ajuste
      </button>
    </div>
  )
}

// ─── Item 5 (2026-06-02): Campo de preço base de convênio ──────────────────
function DefaultInsurancePriceField({
  stockItemId, value, onChange,
}: {
  stockItemId: string | null
  value:       string
  onChange:    (v: string) => void
}) {
  const [loading, setLoading]     = useState(false)
  const [suggestion, setSuggestion] = useState<{ suggested: number | null; sample_size: number; min: number | null; max: number | null } | null>(null)

  async function handleSuggest() {
    if (!stockItemId) return
    setLoading(true)
    const res = await suggestDefaultInsurancePrice(stockItemId)
    setLoading(false)
    if ('error' in res) return
    setSuggestion(res)
    if (res.suggested !== null) onChange(String(res.suggested))
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
      <label className="flex items-center justify-between text-xs font-semibold text-indigo-800">
        <span>Preço Base de Convênio (R$)</span>
        {stockItemId && (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md bg-white border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            title="Sugere baseado no histórico de patient_custom_prices"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : '✨'} Sugerir do histórico
          </button>
        )}
      </label>
      <input
        type="number" min="0" step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Em branco = sem default (operador define no consultório)"
        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      />
      {suggestion && (
        <p className="text-[10px] text-indigo-700">
          {suggestion.suggested === null
            ? `Sem histórico de remessas Petlove para este serviço ainda.`
            : `Média ponderada de ${suggestion.sample_size} pet${suggestion.sample_size === 1 ? '' : 's'}: R$ ${suggestion.suggested.toFixed(2)}` +
              (suggestion.min !== null && suggestion.max !== null
                ? ` · variação R$ ${suggestion.min.toFixed(2)} a R$ ${suggestion.max.toFixed(2)}`
                : '')
          }
        </p>
      )}
      <p className="text-[10px] text-slate-500">
        Total acordado com a Petlove (= coparticipação tutor + repasse plano). Quando preenchido, é usado como base sempre que o pet tem convênio. Sem default, o sistema cobra o particular e pede o split manual no consultório.
      </p>
    </div>
  )
}
