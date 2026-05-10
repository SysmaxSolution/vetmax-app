'use client'

import { useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X, Check,
  Tag, Upload, AlertCircle, Download,
} from 'lucide-react'
import {
  listProductPrices, upsertProductPrice, deactivateProductPrice,
  type ProductPrice,
} from '@/lib/actions/core-management'

// ─── Constants ────────────────────────────────────────────────────────────────

type Category = ProductPrice['category']

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'services',          label: 'Serviços' },
  { value: 'grooming_supplies', label: 'Insumos de Banho e Tosa' },
  { value: 'medications',       label: 'Medicamentos' },
  { value: 'exams',             label: 'Exames' },
  { value: 'other',             label: 'Outros' },
]

const CATEGORY_BADGE: Record<Category, string> = {
  services:          'bg-blue-100 text-blue-700',
  grooming_supplies: 'bg-teal-100 text-teal-700',
  medications:       'bg-green-100 text-green-700',
  exams:             'bg-purple-100 text-purple-700',
  other:             'bg-slate-100 text-slate-600',
}

const VALID_CATEGORIES = new Set<string>(CATEGORY_OPTIONS.map(o => o.value))

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── CSV parser (client-side) ─────────────────────────────────────────────────

interface CsvRow { name: string; category: string; price: number }
interface CsvParseResult { valid: CsvRow[]; errors: { row: number; reason: string }[] }

function parseCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const [header, ...rows] = lines
  const cols = header.split(',').map(c => c.trim().toLowerCase())
  const nameIdx     = cols.indexOf('name')
  const categoryIdx = cols.indexOf('category')
  const priceIdx    = cols.indexOf('price')

  if (nameIdx < 0 || categoryIdx < 0 || priceIdx < 0) {
    return { valid: [], errors: [{ row: 0, reason: 'Cabeçalho deve ter colunas: name, category, price' }] }
  }

  const valid: CsvRow[] = []
  const errors: { row: number; reason: string }[] = []

  rows.forEach((line, idx) => {
    const rowNum = idx + 2
    // Handle quoted fields
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQuotes) { inQuotes = true; continue }
      if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
      if (ch === '"' && inQuotes) { inQuotes = false; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())

    const name     = fields[nameIdx]?.trim() ?? ''
    const category = fields[categoryIdx]?.trim() ?? ''
    const rawPrice = fields[priceIdx]?.trim().replace(',', '.') ?? ''
    const price    = parseFloat(rawPrice)

    if (!name)                       { errors.push({ row: rowNum, reason: 'Nome vazio' }); return }
    if (name.length > 100)           { errors.push({ row: rowNum, reason: `Nome excede 100 caracteres` }); return }
    if (!VALID_CATEGORIES.has(category)) { errors.push({ row: rowNum, reason: `Categoria inválida: "${category}"` }); return }
    if (isNaN(price) || price < 0)   { errors.push({ row: rowNum, reason: `Preço inválido: "${rawPrice}"` }); return }

    valid.push({ name, category, price })
  })

  return { valid, errors }
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  id?:      string
  category: Category
  name:     string
  price:    string
}

const EMPTY_FORM: FormState = { category: 'services', name: '', price: '' }

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialItems: ProductPrice[]
  onToast: (type: 'success' | 'error', message: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingTab({ initialItems, onToast }: Props) {
  const [items,       setItems]       = useState<ProductPrice[]>(initialItems)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [togglingId,  setTogglingId]  = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [formError,   setFormError]   = useState<string | null>(null)
  const [importing,   setImporting]   = useState(false)
  const [importLog,   setImportLog]   = useState<{ imported: number; errors: { row: number; reason: string }[] } | null>(null)
  const [filterCat,   setFilterCat]   = useState<Category | 'all'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Form CRUD ──────────────────────────────────────────────────────────────

  const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setShowForm(true) }
  const openEdit   = (item: ProductPrice) => {
    setForm({ id: item.id, category: item.category, name: item.name, price: String(item.price) })
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    const price = parseFloat(form.price.replace(',', '.'))
    if (!form.name.trim()) { setFormError('Nome é obrigatório.'); return }
    if (isNaN(price) || price < 0) { setFormError('Preço inválido.'); return }
    setSaving(true); setFormError(null)
    const result = await upsertProductPrice({ id: form.id, name: form.name.trim(), category: form.category, price })
    setSaving(false)
    if ('error' in result) { setFormError(result.error); return }

    if (form.id) {
      setItems(prev => prev.map(i => i.id === form.id ? { ...i, name: form.name.trim(), category: form.category, price } : i))
      onToast('success', 'Preço atualizado.')
    } else {
      // Reload from server to get full object
      const fresh = await listProductPrices()
      if (!('error' in fresh)) setItems(fresh)
      onToast('success', `"${form.name}" adicionado.`)
    }
    setShowForm(false); setForm(EMPTY_FORM)
  }

  const handleToggle = async (item: ProductPrice) => {
    setTogglingId(item.id)
    const result = item.is_active
      ? await deactivateProductPrice(item.id)
      : await upsertProductPrice({ id: item.id, name: item.name, category: item.category, price: item.price, is_active: true })
    setTogglingId(null)
    if ('error' in result) { onToast('error', 'error' in result ? result.error : 'Erro'); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Desativar "${name}"?`)) return
    setDeletingId(id)
    const result = await deactivateProductPrice(id)
    setDeletingId(null)
    if ('error' in result) { onToast('error', result.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
    onToast('success', 'Item desativado.')
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────

  const handleCsvFile = async (file: File) => {
    const text = await file.text()
    const { valid, errors } = parseCsv(text)
    if (valid.length === 0 && errors.length > 0) {
      setImportLog({ imported: 0, errors })
      onToast('error', 'Nenhuma linha válida no arquivo.')
      return
    }

    setImporting(true)
    let imported = 0
    for (const row of valid) {
      const res = await upsertProductPrice({ name: row.name, category: row.category as Category, price: row.price })
      if (!('error' in res)) imported++
      else errors.push({ row: -1, reason: `"${row.name}": ${res.error}` })
    }

    const fresh = await listProductPrices()
    if (!('error' in fresh)) setItems(fresh)

    setImporting(false)
    setImportLog({ imported, errors })
    onToast(errors.length === 0 ? 'success' : 'error', `${imported} item(s) importado(s). ${errors.length} erro(s).`)
  }

  // ── Download template CSV ──────────────────────────────────────────────────

  const downloadTemplate = () => {
    const csv = 'name,category,price\nBanho Completo,services,85.00\nShampoo Neutro,grooming_supplies,12.50'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'template_precos_SysVetMax.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Filtered + grouped view ────────────────────────────────────────────────

  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat)
  const grouped  = CATEGORY_OPTIONS
    .map(opt => ({ ...opt, items: filtered.filter(i => i.category === opt.value) }))
    .filter(g => g.items.length > 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hidden CSV input */}
      <input
        ref={fileRef}
        id="input-csv-upload"
        data-testid="input-csv-upload"
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleCsvFile(f)
          e.target.value = ''
        }}
      />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Tag className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Tabela de Preços</h2>
              <p className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
              title="Baixar modelo CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Modelo CSV
            </button>

            <button
              id="btn-import-csv"
              data-testid="btn-import-csv"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-teal-300 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              {importing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando...</>
                : <><Upload className="w-3.5 h-3.5" /> Importar CSV/Excel</>}
            </button>

            <button
              id="btn-new-price"
              data-testid="btn-new-price"
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />Novo Item
            </button>
          </div>
        </div>

        {/* Import log */}
        {importLog && (
          <div className={`mx-6 mt-4 rounded-xl border px-4 py-3 ${importLog.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-700">
                {importLog.imported} item(s) importado(s) — {importLog.errors.length} erro(s)
              </p>
              <button onClick={() => setImportLog(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {importLog.errors.slice(0, 5).map((e, i) => (
              <p key={i} className="text-xs text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                Linha {e.row}: {e.reason}
              </p>
            ))}
            {importLog.errors.length > 5 && (
              <p className="text-xs text-slate-500">...e mais {importLog.errors.length - 5} erro(s).</p>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterCat === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Todos ({items.length})
          </button>
          {CATEGORY_OPTIONS.map(opt => {
            const count = items.filter(i => i.category === opt.value).length
            if (count === 0) return null
            return (
              <button
                key={opt.value}
                id={`filter-cat-${opt.value}`}
                data-testid={`filter-cat-${opt.value}`}
                onClick={() => setFilterCat(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterCat === opt.value ? CATEGORY_BADGE[opt.value] + ' ring-2 ring-current ring-offset-1' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {opt.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-800">{form.id ? 'Editar Item' : 'Novo Item'}</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Categoria</label>
                <select
                  id="form-category"
                  data-testid="form-category"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nome do Item</label>
                <input
                  id="form-name"
                  data-testid="form-name"
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Banho Completo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Preço (R$)</label>
                <input
                  id="form-price"
                  data-testid="form-price"
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
                id="btn-save-price-form"
                data-testid="btn-save-price-form"
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
        <div
          id="pricing-items-list"
          data-testid="pricing-items-list"
          className="max-h-[55vh] overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="py-14 text-center">
              <Tag className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Nenhum item</p>
              <p className="text-xs text-slate-400 mt-1">Adicione itens manualmente ou importe um CSV.</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.value}>
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${CATEGORY_BADGE[group.value]}`}>
                    {group.label}
                  </span>
                </div>
                {group.items.map(item => (
                  <div
                    key={item.id}
                    data-testid={`price-row-${item.id}`}
                    className={`flex items-center justify-between px-6 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {item.name}
                      </p>
                      {!item.is_active && <p className="text-xs text-slate-400">Inativo</p>}
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className={`text-sm font-bold ${item.is_active ? 'text-slate-900' : 'text-slate-400'}`}>
                        {fmt(item.price)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleToggle(item)} disabled={togglingId === item.id} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50" title={item.is_active ? 'Desativar' : 'Ativar'}>
                          {togglingId === item.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : item.is_active
                              ? <ToggleRight className="w-3.5 h-3.5 text-teal-600" />
                              : <ToggleLeft  className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleDelete(item.id, item.name)} disabled={deletingId === item.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50" title="Excluir">
                          {deletingId === item.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
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
    </div>
  )
}
