'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import {
  Plus, Gift, Pencil, Trash2, ToggleLeft, ToggleRight,
  Search, X, Loader2, Check, ChevronDown, Package, Stethoscope,
  CalendarDays, Tag, AlignLeft,
} from 'lucide-react'
import type { CatalogPackage, UpsertPackagePayload } from '@/lib/actions/packages'
import {
  listCatalogPackages, upsertCatalogPackage,
  togglePackageActive, deleteCatalogPackage,
} from '@/lib/actions/packages'
import type { StockItemV2 } from '@/lib/actions/stock'
import { getPharmacyStockV2 } from '@/lib/actions/stock'

// ─── Sub-tipos ────────────────────────────────────────────────────────────────

type DraftItem = {
  key:        string
  item_type:  'product' | 'service'
  item_id:    string
  item_name:  string
  unit:       string
  unit_price: number
  quantity:   number
}

const EMPTY_FORM = {
  name:          '',
  description:   '',
  price:         '',
  interval_days: '7',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface Props {
  userRole: string
}

export default function PackagesTab({ userRole }: Props) {
  const [packages, setPackages] = useState<CatalogPackage[]>([])
  const [stock,    setStock]    = useState<StockItemV2[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<{ mode: 'add' | 'edit'; pkg?: CatalogPackage } | null>(null)
  const [toast,    setToast]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [, startTx]             = useTransition()

  useEffect(() => {
    Promise.all([listCatalogPackages(), getPharmacyStockV2()]).then(([pkgs, stk]) => {
      if (Array.isArray(pkgs)) setPackages(pkgs)
      if (Array.isArray(stk))  setStock(stk)
      setLoading(false)
    })
  }, [])

  function showToast(msg: string, ok = true) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function handleSaved(pkg: CatalogPackage) {
    setPackages(prev => {
      const idx = prev.findIndex(p => p.id === pkg.id)
      return idx >= 0 ? prev.map(p => p.id === pkg.id ? pkg : p) : [pkg, ...prev]
    })
    setModal(null)
    showToast(modal?.mode === 'edit' ? 'Pacote atualizado!' : 'Pacote criado!')
  }

  function handleToggle(pkg: CatalogPackage) {
    startTx(async () => {
      const res = await togglePackageActive(pkg.id)
      if ('error' in res) { showToast(res.error, false); return }
      setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, active: !p.active } : p))
      showToast(pkg.active ? 'Pacote desativado.' : 'Pacote ativado!')
    })
  }

  function handleDelete(pkg: CatalogPackage) {
    if (!confirm(`Excluir pacote "${pkg.name}"? Esta ação não pode ser desfeita.`)) return
    startTx(async () => {
      const res = await deleteCatalogPackage(pkg.id)
      if ('error' in res) { showToast(res.error, false); return }
      setPackages(prev => prev.filter(p => p.id !== pkg.id))
      showToast('Pacote excluído.')
    })
  }

  const canEdit = userRole === 'admin'

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {packages.length} pacote{packages.length !== 1 ? 's' : ''} cadastrado{packages.length !== 1 ? 's' : ''}
        </p>
        {canEdit && (
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo Pacote
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Gift className="h-12 w-12 text-slate-200" />
          <p className="text-slate-500 font-medium">Nenhum pacote cadastrado</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Crie pacotes de banho, tosa ou protocolos de vacinas para oferecer aos tutores.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              canEdit={canEdit}
              onEdit={() => setModal({ mode: 'edit', pkg })}
              onToggle={() => handleToggle(pkg)}
              onDelete={() => handleDelete(pkg)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <PackageFormModal
          mode={modal.mode}
          pkg={modal.pkg}
          stock={stock}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Card do Pacote ───────────────────────────────────────────────────────────

function PackageCard({ pkg, canEdit, onEdit, onToggle, onDelete }: {
  pkg:     CatalogPackage
  canEdit: boolean
  onEdit:  () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const totalItems = (pkg.items ?? []).reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 transition-opacity ${!pkg.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-teal-600 shrink-0" />
            <span className="font-semibold text-slate-900 truncate">{pkg.name}</span>
            {!pkg.active && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">INATIVO</span>
            )}
          </div>
          {pkg.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{pkg.description}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-teal-700 text-base">{fmtPrice(pkg.price)}</p>
          <p className="text-[10px] text-slate-400">{pkg.interval_days}d intervalo</p>
        </div>
      </div>

      {/* Itens */}
      {(pkg.items ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pkg.items!.map(item => (
            <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-600">
              {item.stock_item?.is_service
                ? <Stethoscope className="h-3 w-3 text-teal-500" />
                : <Package className="h-3 w-3 text-amber-500" />
              }
              {item.quantity}× {item.stock_item?.name ?? '—'}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <span className="text-xs text-slate-400">{totalItems} sessão{totalItems !== 1 ? 'ões' : ''}</span>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              onClick={onToggle}
              title={pkg.active ? 'Desativar' : 'Ativar'}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {pkg.active ? <ToggleRight className="h-4 w-4 text-teal-500" /> : <ToggleLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={onEdit}
              title="Editar"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              title="Excluir"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal de Criação / Edição ────────────────────────────────────────────────

function PackageFormModal({ mode, pkg, stock, onClose, onSaved }: {
  mode:    'add' | 'edit'
  pkg?:    CatalogPackage
  stock:   StockItemV2[]
  onClose: () => void
  onSaved: (pkg: CatalogPackage) => void
}) {
  const [form, setForm]       = useState({ ...EMPTY_FORM, ...pkg ? {
    name:          pkg.name,
    description:   pkg.description ?? '',
    price:         String(pkg.price),
    interval_days: String(pkg.interval_days),
  } : {} })
  const [items, setItems]     = useState<DraftItem[]>(() => {
    if (!pkg?.items) return []
    return pkg.items.map(i => ({
      key:        i.id,
      item_type:  i.item_type,
      item_id:    i.item_id,
      item_name:  i.stock_item?.name ?? '—',
      unit:       i.stock_item?.unit ?? 'un',
      unit_price: i.stock_item?.unit_price ?? 0,
      quantity:   i.quantity,
    }))
  })
  const [itemSearch, setItemSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredStock = stock
    .filter(s => s.name.toLowerCase().includes(itemSearch.toLowerCase()))
    .slice(0, 8)

  function addItem(s: StockItemV2) {
    const exists = items.find(i => i.item_id === s.id)
    if (exists) {
      setItems(prev => prev.map(i => i.item_id === s.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setItems(prev => [...prev, {
        key:        s.id,
        item_type:  s.is_service ? 'service' : 'product',
        item_id:    s.id,
        item_name:  s.name,
        unit:       s.unit,
        unit_price: s.unit_price,
        quantity:   1,
      }])
    }
    setItemSearch('')
    setShowDropdown(false)
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  function updateQty(key: string, qty: number) {
    if (qty < 1) return
    setItems(prev => prev.map(i => i.key === key ? { ...i, quantity: qty } : i))
  }

  const suggestedPrice = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.name.trim())  { setError('Nome é obrigatório.'); return }
    if (items.length === 0) { setError('Adicione pelo menos um item.'); return }

    const price = parseFloat(form.price.replace(',', '.'))
    const interval_days = parseInt(form.interval_days)
    if (isNaN(price) || price < 0)      { setError('Preço inválido.'); return }
    if (isNaN(interval_days) || interval_days < 1) { setError('Intervalo inválido.'); return }

    setSaving(true)
    const payload: UpsertPackagePayload = {
      ...(pkg ? { id: pkg.id } : {}),
      name:          form.name.trim(),
      description:   form.description.trim() || undefined,
      price,
      interval_days,
      items:         items.map(i => ({ item_type: i.item_type, item_id: i.item_id, quantity: i.quantity })),
    }

    const res = await upsertCatalogPackage(payload)
    setSaving(false)

    if ('error' in res) { setError(res.error); return }

    // Reconstituiu o objeto para passar ao callback
    const saved: CatalogPackage = {
      id:           res.id,
      clinic_id:    pkg?.clinic_id ?? '',
      name:         payload.name,
      description:  payload.description ?? null,
      price,
      interval_days,
      active:       pkg?.active ?? true,
      created_at:   pkg?.created_at ?? new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      items:        items.map(i => ({
        id:         i.key,
        package_id: res.id,
        item_type:  i.item_type,
        item_id:    i.item_id,
        quantity:   i.quantity,
        stock_item: { id: i.item_id, name: i.item_name, unit: i.unit, unit_price: i.unit_price, is_service: i.item_type === 'service' },
      })),
    }
    onSaved(saved)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-900">
              {mode === 'add' ? 'Novo Pacote / Plano' : 'Editar Pacote'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Pacote *</label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: Pacote Mensal de Banho e Tosa"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
              <AlignLeft className="h-3.5 w-3.5" /> Descrição (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Descreva o que está incluído..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          {/* Preço e Intervalo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
                <Tag className="h-3.5 w-3.5" /> Preço do Pacote (R$) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl pl-3 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {suggestedPrice > 0 && !form.price && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, price: suggestedPrice.toFixed(2) }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-teal-600 hover:underline"
                  >
                    {fmtPrice(suggestedPrice)}
                  </button>
                )}
              </div>
              {suggestedPrice > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Avulso: {fmtPrice(suggestedPrice)}
                </p>
              )}
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
                <CalendarDays className="h-3.5 w-3.5" /> Intervalo Sugerido (dias)
              </label>
              <input
                type="number"
                min={1}
                value={form.interval_days}
                onChange={e => setForm(f => ({ ...f, interval_days: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Seletor de Itens */}
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
              <Package className="h-3.5 w-3.5" /> Itens do Pacote *
            </label>

            {/* Items adicionados */}
            {items.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {items.map(item => (
                  <div key={item.key} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                    <span className="flex-1 text-sm text-slate-700 truncate">{item.item_name}</span>
                    <span className="text-xs text-slate-400">{item.unit}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateQty(item.key, item.quantity - 1)} className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-bold flex items-center justify-center">−</button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button type="button" onClick={() => updateQty(item.key, item.quantity + 1)} className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-bold flex items-center justify-center">+</button>
                    </div>
                    <button type="button" onClick={() => removeItem(item.key)} className="text-slate-300 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Busca de itens */}
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar produto ou serviço..."
                  value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full border border-slate-300 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {showDropdown && itemSearch && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredStock.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-slate-400">Nenhum resultado.</p>
                  ) : (
                    filteredStock.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={() => addItem(s)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-teal-50 transition-colors"
                      >
                        {s.is_service
                          ? <Stethoscope className="h-4 w-4 text-teal-500 shrink-0" />
                          : <Package className="h-4 w-4 text-amber-500 shrink-0" />
                        }
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{fmtPrice(s.unit_price)}/{s.unit}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={e => { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {mode === 'add' ? 'Criar Pacote' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
