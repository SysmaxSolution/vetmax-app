'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X, Check, Tag } from 'lucide-react'
import {
  saveCatalogItem, deleteCatalogItem, toggleCatalogItem,
  type CatalogItem, type CatalogItemType, type SaveCatalogPayload,
} from '@/lib/actions/catalog'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_TYPE_OPTIONS: { value: CatalogItemType; label: string }[] = [
  { value: 'consultation', label: 'Consulta' },
  { value: 'medication',   label: 'Medicação' },
  { value: 'exam',         label: 'Exame' },
  { value: 'grooming',     label: 'Banho e Tosa' },
  { value: 'other',        label: 'Outro' },
]

const TYPE_BADGE: Record<CatalogItemType, string> = {
  consultation: 'bg-blue-100 text-blue-700',
  medication:   'bg-green-100 text-green-700',
  exam:         'bg-purple-100 text-purple-700',
  grooming:     'bg-teal-100 text-teal-700',
  other:        'bg-slate-100 text-slate-600',
}

const TYPE_LABELS: Record<CatalogItemType, string> = {
  consultation: 'Consulta',
  medication:   'Medicação',
  exam:         'Exame',
  grooming:     'Banho e Tosa',
  other:        'Outro',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Inline form (create / edit) ──────────────────────────────────────────────

interface FormState {
  id?:       string
  item_type: CatalogItemType
  name:      string
  price:     string
}

const EMPTY_FORM: FormState = { item_type: 'consultation', name: '', price: '' }

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialItems: CatalogItem[]
  onToast: (type: 'success' | 'error', message: string) => void
}

export default function CatalogTab({ initialItems, onToast }: Props) {
  const [items,       setItems]       = useState<CatalogItem[]>(initialItems)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [togglingId,  setTogglingId]  = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [formError,   setFormError]   = useState<string | null>(null)

  // ── Form handlers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (item: CatalogItem) => {
    setForm({ id: item.id, item_type: item.item_type, name: item.name, price: String(item.price) })
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    const price = parseFloat(form.price.replace(',', '.'))
    if (!form.name.trim()) { setFormError('Nome é obrigatório.'); return }
    if (isNaN(price) || price < 0) { setFormError('Preço inválido.'); return }

    setSaving(true)
    setFormError(null)
    const payload: SaveCatalogPayload = {
      id:        form.id,
      item_type: form.item_type,
      name:      form.name.trim(),
      price,
    }
    const result = await saveCatalogItem(payload)
    setSaving(false)

    if ('error' in result) { setFormError(result.error); return }

    if (payload.id) {
      setItems(prev => prev.map(i => i.id === result.id ? result : i))
      onToast('success', `"${result.name}" atualizado.`)
    } else {
      setItems(prev => [...prev, result])
      onToast('success', `"${result.name}" adicionado ao catálogo.`)
    }
    setShowForm(false)
    setForm(EMPTY_FORM)
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggle = async (item: CatalogItem) => {
    setTogglingId(item.id)
    const result = await toggleCatalogItem(item.id, !item.is_active)
    setTogglingId(null)
    if ('error' in result) { onToast('error', result.error); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    onToast('success', item.is_active ? 'Item desativado.' : 'Item ativado.')
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}" do catálogo?`)) return
    setDeletingId(id)
    const result = await deleteCatalogItem(id)
    setDeletingId(null)
    if ('error' in result) { onToast('error', result.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
    onToast('success', 'Item excluído.')
  }

  // ── Group by type ──────────────────────────────────────────────────────────

  const grouped = ITEM_TYPE_OPTIONS.map(opt => ({
    type:  opt.value,
    label: opt.label,
    items: items.filter(i => i.item_type === opt.value),
  })).filter(g => g.items.length > 0)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <Tag className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Tabela de Preços</h2>
            <p className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''} no catálogo</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />Novo Item
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">
              {form.id ? 'Editar Item' : 'Novo Item'}
            </p>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
              <select
                value={form.item_type}
                onChange={e => setForm(f => ({ ...f, item_type: e.target.value as CatalogItemType }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {ITEM_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nome do Item</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Consulta Veterinária"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Preço (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0,00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {formError && (
            <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="max-h-[60vh] overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-14 text-center">
            <Tag className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Catálogo vazio</p>
            <p className="text-xs text-slate-400 mt-1">Clique em "Novo Item" para adicionar o primeiro preço</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.type}>
              {/* Type header */}
              <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_BADGE[group.type as CatalogItemType]}`}>
                  {group.label}
                </span>
              </div>
              {group.items.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-6 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                      {item.name}
                    </p>
                    {!item.is_active && (
                      <p className="text-xs text-slate-400">Inativo</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-sm font-bold ${item.is_active ? 'text-slate-900' : 'text-slate-400'}`}>
                      {fmt(item.price)}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={togglingId === item.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                        title={item.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {togglingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : item.is_active ? (
                          <ToggleRight className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ToggleLeft className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
