'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  Package, Plus, AlertTriangle, RefreshCw, Trash2, Pencil,
  ArrowDownToLine, Search, X, Loader2, Check, Calendar,
  Shield, ShoppingBag, Scissors, Sparkles, FlaskConical, Pill,
} from 'lucide-react'
import type { StockItemV2, StockCategory } from '@/lib/actions/stock'
import {
  addStockItemV2, updateStockItemV2,
  restockItemV2, adjustStockItemV2,
  dispenseStockItem, deleteStockItemV2,
} from '@/lib/actions/stock'

// ─── Categorias ───────────────────────────────────────────────────────────────

const CATEGORIES: {
  key: StockCategory | 'all'
  label: string
  icon: React.ReactNode
  color: string
  badge: string
}[] = [
  { key: 'all',                   label: 'Todos',               icon: <Package     className="h-4 w-4" />, color: 'text-slate-600',   badge: 'bg-slate-100 text-slate-600'   },
  { key: 'medication',            label: 'Med. Comuns',         icon: <Pill        className="h-4 w-4" />, color: 'text-blue-600',    badge: 'bg-blue-100 text-blue-700'    },
  { key: 'controlled_medication', label: 'Controlados',         icon: <Shield      className="h-4 w-4" />, color: 'text-red-600',     badge: 'bg-red-100 text-red-700'      },
  { key: 'clinic_product',        label: 'Clínica',             icon: <FlaskConical className="h-4 w-4" />, color: 'text-purple-600',  badge: 'bg-purple-100 text-purple-700' },
  { key: 'petshop',               label: 'Petshop',             icon: <ShoppingBag className="h-4 w-4" />, color: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700'  },
  { key: 'grooming_supply',       label: 'Banho e Tosa',        icon: <Scissors    className="h-4 w-4" />, color: 'text-pink-600',    badge: 'bg-pink-100 text-pink-700'    },
  { key: 'aesthetics',            label: 'Estética/Perfum.',    icon: <Sparkles    className="h-4 w-4" />, color: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700' },
]

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter(c => c.key !== 'all').map(c => [c.key, c.label])
)

// Campos obrigatórios/opcionais por categoria
const CAT_FIELDS: Record<string, { batch: boolean; expiry: boolean; barcode: boolean; sku: boolean }> = {
  medication:            { batch: true,  expiry: true,  barcode: false, sku: false },
  controlled_medication: { batch: true,  expiry: true,  barcode: false, sku: false },
  clinic_product:        { batch: true,  expiry: true,  barcode: false, sku: false },
  petshop:               { batch: false, expiry: false, barcode: true,  sku: true  },
  grooming_supply:       { batch: false, expiry: true,  barcode: false, sku: false },
  aesthetics:            { batch: false, expiry: true,  barcode: true,  sku: true  },
}

const UNITS = ['un', 'comprimido', 'cápsula', 'frasco', 'ampola', 'ml', 'mg', 'g', 'kg', 'l', 'caixa', 'sachê', 'kit', 'par', 'rolo', 'bisnaga', 'spray', 'tubo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(item: StockItemV2): 'critical' | 'warning' | 'ok' {
  if (item.quantity <= 0)               return 'critical'
  if (item.quantity < item.min_quantity) return 'critical'
  if (item.quantity < item.min_quantity * 1.5) return 'warning'
  return 'ok'
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  stock:    StockItemV2[]
  userRole: 'admin' | 'vet'
}

// ─── Formulário de cadastro/edição ────────────────────────────────────────────

interface ItemForm {
  name:           string
  category:       StockCategory
  quantity:       string
  unit:           string
  min_quantity:   string
  unit_price:     string
  is_controlled:  boolean
  brand:          string
  sku:            string
  barcode:        string
  batch_number:   string
  expiry_date:    string
  supplier:       string
}

const EMPTY_FORM: ItemForm = {
  name: '', category: 'medication', quantity: '0', unit: 'un',
  min_quantity: '0', unit_price: '0', is_controlled: false,
  brand: '', sku: '', barcode: '', batch_number: '', expiry_date: '', supplier: '',
}

function formFromItem(item: StockItemV2): ItemForm {
  return {
    name:          item.name,
    category:      item.category,
    quantity:      String(item.quantity),
    unit:          item.unit,
    min_quantity:  String(item.min_quantity),
    unit_price:    String(item.unit_price),
    is_controlled: item.is_controlled,
    brand:         item.brand ?? '',
    sku:           item.sku ?? '',
    barcode:       item.barcode ?? '',
    batch_number:  item.batch_number ?? '',
    expiry_date:   item.expiry_date ?? '',
    supplier:      item.supplier ?? '',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PharmacyWorkspace({ stock: initialStock, userRole }: Props) {
  const [stock, setStock]       = useState<StockItemV2[]>(initialStock)
  const [catTab, setCatTab]     = useState<StockCategory | 'all'>('all')
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'ok'>('all')

  // Modals
  const [formModal, setFormModal]   = useState<{ mode: 'add' | 'edit'; item?: StockItemV2 } | null>(null)
  const [restockItem, setRestockItem] = useState<StockItemV2 | null>(null)
  const [dispenseItem, setDispenseItem] = useState<StockItemV2 | null>(null)
  const [adjustItem, setAdjustItem] = useState<StockItemV2 | null>(null)

  const [toast, setToast]       = useState<{ ok: boolean; msg: string } | null>(null)
  const [isPending, startTx]    = useTransition()

  function showToast(msg: string, ok = true) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Contagens por categoria ────────────────────────────────────────────────
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: stock.length }
    for (const item of stock) map[item.category] = (map[item.category] ?? 0) + 1
    return map
  }, [stock])

  const expiringCount = useMemo(() =>
    stock.filter(i => { const d = daysUntilExpiry(i.expiry_date); return d !== null && d <= 30 }).length
  , [stock])

  const lowCount = useMemo(() => stock.filter(i => stockStatus(i) === 'critical').length, [stock])

  // ── Filtragem ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return stock.filter(item => {
      if (catTab !== 'all' && item.category !== catTab) return false
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())
        && !(item.brand ?? '').toLowerCase().includes(search.toLowerCase())
        && !(item.sku ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter === 'critical') return stockStatus(item) === 'critical'
      if (statusFilter === 'ok')       return stockStatus(item) === 'ok'
      return true
    })
  }, [stock, catTab, search, statusFilter])

  // ── Handlers CRUD ─────────────────────────────────────────────────────────

  function handleSaved(item: StockItemV2, isNew: boolean) {
    setStock(prev =>
      isNew
        ? [...prev, item].sort((a, b) => a.name.localeCompare(b.name))
        : prev.map(i => i.id === item.id ? item : i)
    )
    setFormModal(null)
    showToast(isNew ? 'Item cadastrado com sucesso!' : 'Item atualizado com sucesso!')
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Estoque</h1>
            <p className="text-sm text-slate-500">{stock.length} itens cadastrados</p>
          </div>
          {userRole === 'admin' && (
            <button
              onClick={() => setFormModal({ mode: 'add' })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> Novo Item
            </button>
          )}
        </div>

        {/* Alertas */}
        {(lowCount > 0 || expiringCount > 0) && (
          <div className="flex flex-wrap gap-3">
            {lowCount > 0 && (
              <button
                onClick={() => setStatusFilter(s => s === 'critical' ? 'all' : 'critical')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
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
          <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.ok ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
          </div>
        )}

        {/* Tabs de categoria */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCatTab(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                catTab === cat.key
                  ? 'bg-white border-teal-500 text-teal-700 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span className={catTab === cat.key ? 'text-teal-600' : 'text-slate-400'}>
                {cat.icon}
              </span>
              {cat.label}
              {counts[cat.key] !== undefined && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${catTab === cat.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[cat.key] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + filtro */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, marca ou código…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setStatusFilter(s => s === 'ok' ? 'all' : 'ok')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              statusFilter === 'ok'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            Normais
          </button>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum item encontrado</p>
              {userRole === 'admin' && (
                <button onClick={() => setFormModal({ mode: 'add' })}
                  className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-semibold underline">
                  Cadastrar primeiro item
                </button>
              )}
            </div>
          ) : (
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
                    const cat = CATEGORIES.find(c => c.key === item.category)
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${expiring ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
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
                              {item.supplier && (
                                <p className="text-[11px] text-slate-400">{item.supplier}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat?.badge ?? 'bg-slate-100 text-slate-600'}`}>
                            {cat?.icon}
                            {cat?.label ?? item.category}
                          </span>
                        </td>
                        <td className={`px-3 py-3 text-right font-bold tabular-nums ${
                          st === 'critical' ? 'text-red-600' : st === 'warning' ? 'text-amber-600' : 'text-slate-900'
                        }`}>
                          {Number(item.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500 text-xs">{item.unit}</td>
                        <td className="px-3 py-3 text-right text-slate-600 tabular-nums text-xs">
                          {item.unit_price > 0
                            ? `R$ ${item.unit_price.toFixed(2)}`
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {item.expiry_date ? (
                            <span className={`text-xs font-medium ${
                              days !== null && days < 0     ? 'text-red-600 font-bold' :
                              days !== null && days <= 30   ? 'text-amber-600' :
                              'text-slate-500'
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
                            <ActionBtn title="Repor" color="blue"   onClick={() => setRestockItem(item)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </ActionBtn>
                            <ActionBtn title="Dispensar" color="green" onClick={() => setDispenseItem(item)}>
                              <ArrowDownToLine className="h-3.5 w-3.5" />
                            </ActionBtn>
                            {userRole === 'admin' && <>
                              <ActionBtn title="Editar" color="teal" onClick={() => setFormModal({ mode: 'edit', item })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </ActionBtn>
                              <ActionBtn title="Ajustar" color="amber" onClick={() => setAdjustItem(item)}>
                                <Package className="h-3.5 w-3.5" />
                              </ActionBtn>
                              <ActionBtn title="Remover" color="red" onClick={() => {
                                startTx(async () => {
                                  const res = await deleteStockItemV2(item.id)
                                  if ('error' in res) showToast(res.error, false)
                                  else handleDeleted(item.id)
                                })
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </ActionBtn>
                            </>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Cadastro / Edição */}
      {formModal && (
        <ItemFormModal
          mode={formModal.mode}
          item={formModal.item}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Modal: Repor */}
      {restockItem && (
        <SimpleModal
          title={`Repor: ${restockItem.name}`}
          onClose={() => setRestockItem(null)}
          color="blue"
        >
          <RestockForm
            item={restockItem}
            onDone={(newQty) => handleRestocked(restockItem.id, newQty)}
            onError={(msg) => showToast(msg, false)}
          />
        </SimpleModal>
      )}

      {/* Modal: Dispensar */}
      {dispenseItem && (
        <SimpleModal
          title={`Dispensar: ${dispenseItem.name}`}
          onClose={() => setDispenseItem(null)}
          color="green"
        >
          <DispenseForm
            item={dispenseItem}
            onDone={(newQty) => handleDispensed(dispenseItem.id, newQty)}
            onError={(msg) => showToast(msg, false)}
          />
        </SimpleModal>
      )}

      {/* Modal: Ajustar */}
      {adjustItem && (
        <SimpleModal
          title={`Ajustar: ${adjustItem.name}`}
          onClose={() => setAdjustItem(null)}
          color="amber"
        >
          <AdjustForm
            item={adjustItem}
            onDone={(newQty) => handleAdjusted(adjustItem.id, newQty)}
            onError={(msg) => showToast(msg, false)}
          />
        </SimpleModal>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ActionBtn({ children, title, color, onClick }: {
  children: React.ReactNode; title: string
  color: 'blue' | 'green' | 'teal' | 'amber' | 'red'
  onClick: () => void
}) {
  const colors = {
    blue:  'text-blue-500 hover:bg-blue-50 hover:text-blue-700',
    green: 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700',
    teal:  'text-teal-500 hover:bg-teal-50 hover:text-teal-700',
    amber: 'text-amber-500 hover:bg-amber-50 hover:text-amber-700',
    red:   'text-slate-400 hover:bg-red-50 hover:text-red-600',
  }
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-lg transition-colors ${colors[color]}`}>
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
    blue:  'from-blue-600 to-blue-700',
    green: 'from-emerald-600 to-emerald-700',
    amber: 'from-amber-600 to-amber-700',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className={`bg-gradient-to-r ${headers[color]} px-5 py-4 flex items-center justify-between`}>
          <p className="text-sm font-semibold text-white">{title}</p>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── ItemFormModal (Cadastro / Edição completa) ───────────────────────────────

function ItemFormModal({ mode, item, onClose, onSaved }: {
  mode: 'add' | 'edit'
  item?: StockItemV2
  onClose: () => void
  onSaved: (item: StockItemV2, isNew: boolean) => void
}) {
  const [form, setForm]     = useState<ItemForm>(item ? formFromItem(item) : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const fields = CAT_FIELDS[form.category] ?? { batch: false, expiry: false, barcode: false, sku: false }
  const isNew  = mode === 'add'

  function set(key: keyof ItemForm, val: string | boolean) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError(null)

    const payload = {
      name:          form.name,
      category:      form.category,
      quantity:      Number(form.quantity),
      unit:          form.unit,
      min_quantity:  Number(form.min_quantity),
      unit_price:    Number(form.unit_price),
      is_controlled: form.is_controlled,
      brand:         form.brand || null,
      sku:           form.sku || null,
      barcode:       form.barcode || null,
      batch_number:  form.batch_number || null,
      expiry_date:   form.expiry_date || null,
      supplier:      form.supplier || null,
    }

    if (isNew) {
      const res = await addStockItemV2(payload)
      setSaving(false)
      if ('error' in res) { setError(res.error); return }
      onSaved(res, true)
    } else {
      const { quantity: _q, ...updatePayload } = payload
      const res = await updateStockItemV2(item!.id, updatePayload)
      setSaving(false)
      if ('error' in res) { setError(res.error); return }
      onSaved(res, false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              <Package className="h-4 w-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-white">
              {isNew ? 'Novo Item de Estoque' : `Editar: ${item?.name}`}
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Categoria */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Categoria <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.filter(c => c.key !== 'all').map(cat => (
                <button key={cat.key} type="button"
                  onClick={() => { set('category', cat.key); if (cat.key === 'controlled_medication') set('is_controlled', true) }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left text-xs font-semibold transition-all ${
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

          {/* Nome + Marca */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nome <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ex: Amoxicilina 250mg"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Marca / Fabricante</label>
              <input value={form.brand} onChange={e => set('brand', e.target.value)}
                placeholder="Ex: Duprat, Vetnil…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          </div>

          {/* Qtd + Unidade + Mínimo */}
          <div className="grid grid-cols-3 gap-3">
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

          {/* Fornecedor */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fornecedor / Distribuidora</label>
            <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
              placeholder="Ex: Distribuidora Pet Brasil"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>

          {/* Campos condicionais por categoria */}
          {(fields.batch || fields.expiry) && (
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

          {(fields.sku || fields.barcode) && (
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

          {/* Medicamento Controlado */}
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
                Medicamento controlado — a dispensação exige receituário assinado por Médico Veterinário (CFMV). Mantenha os registros de movimentação para fiscalização.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isNew ? 'Cadastrar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Formulários simples (Repor / Dispensar / Ajustar) ────────────────────────

function RestockForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (newQty: number) => void; onError: (msg: string) => void
}) {
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  async function handle() {
    if (!qty || Number(qty) <= 0) { onError('Informe uma quantidade válida.'); return }
    setSaving(true)
    const res = await restockItemV2(item.id, Number(qty), notes || undefined)
    setSaving(false)
    if ('error' in res) { onError(res.error); return }
    onDone(res.new_quantity)
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Qtd. atual: <strong className="text-slate-800">{item.quantity} {item.unit}</strong></p>
      <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
        placeholder="Quantidade a adicionar"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota: NF, fornecedor… (opcional)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      <button onClick={handle} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Repor Estoque
      </button>
    </div>
  )
}

function DispenseForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (newQty: number) => void; onError: (msg: string) => void
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
      <p className="text-xs text-slate-500">Disponível: <strong className="text-slate-800">{item.quantity} {item.unit}</strong>
        {item.is_controlled && <span className="ml-2 text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">CONTROLADO</span>}
      </p>
      <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
        placeholder="Quantidade a dispensar"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota: consulta, paciente… (opcional)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
      <button onClick={handle} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} Dispensar
      </button>
    </div>
  )
}

function AdjustForm({ item, onDone, onError }: {
  item: StockItemV2; onDone: (newQty: number) => void; onError: (msg: string) => void
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
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar Ajuste
      </button>
    </div>
  )
}
