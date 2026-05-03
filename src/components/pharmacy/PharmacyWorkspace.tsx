'use client'

import { useState, useTransition } from 'react'
import { Package, Plus, AlertTriangle, RefreshCw, Trash2, Edit3, CheckCircle, X, ChevronDown, ChevronUp, ArrowDownToLine } from 'lucide-react'
import type { StockItem } from '@/lib/actions/stock'
import { addStockItem, addStockItemV2, restockItem, adjustStockItem, deleteStockItem, dispenseStockItem } from '@/lib/actions/stock'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  stock:         StockItem[]
  lowStockItems: StockItem[]
  userRole:      'admin' | 'vet'
}

type ModalMode = 'add' | 'restock' | 'adjust' | 'dispense' | null

// ─── Utilitários ──────────────────────────────────────────────────────────────

function stockStatus(item: StockItem): 'critical' | 'warning' | 'ok' {
  if (item.quantity <= 0) return 'critical'
  if (item.quantity < item.min_stock_level) return 'critical'
  if (item.quantity < item.min_stock_level * 1.5) return 'warning'
  return 'ok'
}

const statusColors = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning:  'bg-amber-50 border-amber-200 text-amber-700',
  ok:       'bg-emerald-50 border-emerald-200 text-emerald-700',
}
const statusLabels = { critical: 'Crítico', warning: 'Atenção', ok: 'OK' }

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PharmacyWorkspace({ stock: initialStock, lowStockItems: initialLow, userRole }: Props) {
  const [stock, setStock]       = useState<StockItem[]>(initialStock)
  const [filter, setFilter]     = useState<'all' | 'critical' | 'ok'>('all')
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState<{ mode: ModalMode; item?: StockItem } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const lowCount = stock.filter(i => stockStatus(i) === 'critical').length

  const filtered = stock.filter(item => {
    const matchesSearch = item.medication_name.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (filter === 'critical') return stockStatus(item) === 'critical'
    if (filter === 'ok')       return stockStatus(item) === 'ok'
    return true
  })

  function showFeedback(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else         { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  function refreshItem(updated: StockItem) {
    setStock(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleAdd(data: { medication_name: string; quantity: number; unit: string; min_stock_level: number }) {
    startTransition(async () => {
      // Write to stock_items (primary table) and pharmacy_stock (legacy)
      const v2Result = await addStockItemV2({
        name:         data.medication_name,
        quantity:     data.quantity,
        unit:         data.unit,
        min_quantity: data.min_stock_level,
      })
      if ('error' in v2Result) {
        // Fallback to pharmacy_stock
        const result = await addStockItem(data)
        if ('error' in result) { showFeedback(result.error, true); return }
        setStock(prev => [...prev, result].sort((a, b) => a.medication_name.localeCompare(b.medication_name)))
        showFeedback('Item salvo com sucesso.')
        setModal(null)
        return
      }
      // Convert StockItemV2 to StockItem for state
      const converted: StockItem = {
        id:              v2Result.id,
        clinic_id:       v2Result.clinic_id,
        medication_name: v2Result.name,
        quantity:        v2Result.quantity,
        unit:            v2Result.unit,
        min_stock_level: v2Result.min_quantity,
        last_restock:    v2Result.last_restock,
        created_at:      v2Result.created_at,
        updated_at:      v2Result.updated_at,
      }
      setStock(prev => [...prev, converted].sort((a, b) => a.medication_name.localeCompare(b.medication_name)))
      showFeedback('Item salvo com sucesso.')
      setModal(null)
    })
  }

  function handleRestock(item: StockItem, qty: number, notes: string) {
    startTransition(async () => {
      const result = await restockItem(item.id, qty, notes)
      if ('error' in result) { showFeedback(result.error, true); return }
      refreshItem({ ...item, quantity: result.new_quantity, last_restock: new Date().toISOString() })
      showFeedback(`Estoque de "${item.medication_name}" reposto: +${qty} ${item.unit}`)
      setModal(null)
    })
  }

  function handleAdjust(item: StockItem, newQty: number, notes: string) {
    startTransition(async () => {
      const result = await adjustStockItem(item.id, newQty, notes)
      if ('error' in result) { showFeedback(result.error, true); return }
      refreshItem({ ...item, quantity: newQty })
      showFeedback(`Estoque de "${item.medication_name}" ajustado para ${newQty} ${item.unit}`)
      setModal(null)
    })
  }

  function handleDelete(item: StockItem) {
    if (!confirm(`Remover "${item.medication_name}" do estoque? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const result = await deleteStockItem(item.id)
      if ('error' in result) { showFeedback(result.error, true); return }
      setStock(prev => prev.filter(i => i.id !== item.id))
      showFeedback(`"${item.medication_name}" removido.`)
    })
  }

  function handleDispense(item: StockItem, qty: number, notes: string) {
    startTransition(async () => {
      const result = await dispenseStockItem(item.id, qty, notes)
      if ('error' in result) { showFeedback(result.error, true); return }
      refreshItem({ ...item, quantity: result.new_quantity })
      showFeedback(`${qty} ${item.unit} de "${item.medication_name}" dispensados.`)
      setModal(null)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 rounded-lg p-2">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Estoque de Medicamentos</h1>
            <p className="text-sm text-slate-500">{stock.length} itens no estoque</p>
          </div>
        </div>
        {userRole === 'admin' && (
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Item
          </button>
        )}
      </div>

      {/* Alertas de estoque baixo */}
      {lowCount > 0 && (
        <div data-testid="low-stock-alert" className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm font-medium text-red-700">
            {lowCount} {lowCount === 1 ? 'medicamento está' : 'medicamentos estão'} abaixo do nível mínimo de estoque.
          </p>
          <button
            onClick={() => setFilter('critical')}
            className="ml-auto text-xs font-semibold text-red-600 underline hover:no-underline"
          >
            Ver críticos
          </button>
        </div>
      )}

      {/* Feedback */}
      {error   && <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><X className="w-4 h-4 shrink-0" />{error}</div>}
      {success && <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm"><CheckCircle className="w-4 h-4 shrink-0" />{success}</div>}

      {/* Filtros + Busca */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar medicamento..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {(['all', 'critical', 'ok'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : 'Normal'}
          </button>
        ))}
      </div>

      {/* Tabela de Estoque */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {stock.length === 0 ? 'Nenhum medicamento no estoque.' : 'Nenhum item encontrado para este filtro.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Medicamento</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Qtd.</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-700">Unidade</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Mínimo</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const status = stockStatus(item)
                return (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.medication_name}</td>
                    <td className={`px-4 py-3 text-right font-bold ${status === 'critical' ? 'text-red-600' : status === 'warning' ? 'text-amber-600' : 'text-slate-900'}`}>
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{item.min_stock_level}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setModal({ mode: 'restock', item })}
                          title="Repor estoque"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setModal({ mode: 'dispense', item })}
                          aria-label="Registrar saída"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          Dispensar
                        </button>
                        {userRole === 'admin' && (
                          <>
                            <button
                              onClick={() => setModal({ mode: 'adjust', item })}
                              title="Ajustar quantidade"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              title="Remover item"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal?.mode === 'add' && (
        <AddItemModal
          onConfirm={handleAdd}
          onClose={() => setModal(null)}
          isPending={isPending}
        />
      )}
      {modal?.mode === 'restock' && modal.item && (
        <RestockModal
          item={modal.item}
          onConfirm={(qty, notes) => handleRestock(modal.item!, qty, notes)}
          onClose={() => setModal(null)}
          isPending={isPending}
        />
      )}
      {modal?.mode === 'adjust' && modal.item && (
        <AdjustModal
          item={modal.item}
          onConfirm={(qty, notes) => handleAdjust(modal.item!, qty, notes)}
          onClose={() => setModal(null)}
          isPending={isPending}
        />
      )}
      {modal?.mode === 'dispense' && modal.item && (
        <DispenseModal
          item={modal.item}
          onConfirm={(qty, notes) => handleDispense(modal.item!, qty, notes)}
          onClose={() => setModal(null)}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ─── Modal: Adicionar Item ─────────────────────────────────────────────────────

function AddItemModal({ onConfirm, onClose, isPending }: {
  onConfirm: (data: { medication_name: string; quantity: number; unit: string; min_stock_level: number }) => void
  onClose: () => void
  isPending: boolean
}) {
  const [name, setName]           = useState('')
  const [quantity, setQuantity]   = useState('')
  const [unit, setUnit]           = useState('un')
  const [minLevel, setMinLevel]   = useState('0')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !quantity) return
    onConfirm({
      medication_name: name.trim(),
      quantity:        parseFloat(quantity),
      unit:            unit || 'un',
      min_stock_level: parseFloat(minLevel),
    })
  }

  return (
    <ModalWrapper title="Adicionar Medicamento ao Estoque" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="add-item-name" className="block text-xs font-medium text-slate-700 mb-1">Nome do Medicamento *</label>
          <input id="add-item-name" value={name} onChange={e => setName(e.target.value)} required
            placeholder="ex: Amoxicilina 250mg"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="add-item-qty" className="block text-xs font-medium text-slate-700 mb-1">Qtd. Inicial *</label>
            <input id="add-item-qty" type="number" min="0" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Unidade *</label>
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="un">un</option>
              <option value="comprimido">comprimido</option>
              <option value="frasco">frasco</option>
              <option value="ampola">ampola</option>
              <option value="ml">ml</option>
              <option value="mg">mg</option>
              <option value="caixa">caixa</option>
              <option value="sachê">sachê</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nível Mínimo *</label>
            <input type="number" min="0" step="0.001" value={minLevel} onChange={e => setMinLevel(e.target.value)} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isPending ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  )
}

// ─── Modal: Repor Estoque ─────────────────────────────────────────────────────

function RestockModal({ item, onConfirm, onClose, isPending }: {
  item: StockItem
  onConfirm: (qty: number, notes: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')

  return (
    <ModalWrapper title={`Repor: ${item.medication_name}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">Estoque atual: <span className="font-semibold text-slate-900">{item.quantity} {item.unit}</span></p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Quantidade a adicionar *</label>
          <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Observação (opcional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: NF 12345, fornecedor XYZ"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={() => qty && onConfirm(parseFloat(qty), notes)} disabled={!qty || isPending}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {isPending ? 'Salvando...' : 'Repor Estoque'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

// ─── Modal: Ajuste Manual ─────────────────────────────────────────────────────

function AdjustModal({ item, onConfirm, onClose, isPending }: {
  item: StockItem
  onConfirm: (qty: number, notes: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [qty, setQty]     = useState(String(item.quantity))
  const [notes, setNotes] = useState('')

  return (
    <ModalWrapper title={`Ajustar: ${item.medication_name}`} onClose={onClose}>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        Ajuste manual — informe sempre o motivo para o Audit Trail.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Nova quantidade *</label>
          <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Motivo do ajuste *</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: Inventário mensal, quebra, vencimento..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={() => qty && notes.trim() && onConfirm(parseFloat(qty), notes)} disabled={!qty || !notes.trim() || isPending}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
            {isPending ? 'Salvando...' : 'Salvar Ajuste'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

// ─── Modal: Dispensar Item ────────────────────────────────────────────────────

function DispenseModal({ item, onConfirm, onClose, isPending }: {
  item: StockItem
  onConfirm: (qty: number, notes: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')

  return (
    <ModalWrapper title={`Dispensar: ${item.medication_name}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">Estoque atual: <span className="font-semibold text-slate-900">{item.quantity} {item.unit}</span></p>
      <div className="space-y-3">
        <div>
          <label htmlFor="dispense-qty" className="block text-xs font-medium text-slate-700 mb-1">Quantidade a dispensar *</label>
          <input id="dispense-qty" type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
            placeholder="Quantidade"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Observação (opcional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: Consulta #123, paciente Rex"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => qty && parseFloat(qty) > 0 && onConfirm(parseFloat(qty), notes)}
            disabled={!qty || parseFloat(qty) <= 0 || isPending}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Dispensando...' : 'Confirmar Dispensa'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

// ─── Modal Wrapper ────────────────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
