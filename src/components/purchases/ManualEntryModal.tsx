'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Plus, Trash2, PackagePlus } from 'lucide-react'
import { createManualPurchaseOrder, type ManualPurchaseItem, type PurchaseOrder } from '@/lib/actions/purchases'
import type { Supplier } from '@/lib/actions/suppliers'

/**
 * Entrada manual de mercadoria — alternativa ao upload de NF-e XML.
 *
 * Útil para clínicas que recebem itens sem nota fiscal eletrônica
 * (compras avulsas, brindes, transferências entre filiais, ajustes
 * de inventário). Cria uma purchase_order com xml_content=null e os
 * itens informados, ficando disponível na mesma tela de Entradas para
 * confirmação/conciliação no estoque.
 */

interface Props {
  suppliers: Supplier[]
  onClose:   () => void
  onSuccess: (order: PurchaseOrder) => void
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

type ItemDraft = {
  description: string
  quantity:    string
  unit_price:  string
  unit:        string
  ean:         string
}

function emptyItem(): ItemDraft {
  return { description: '', quantity: '1', unit_price: '0', unit: '', ean: '' }
}

export default function ManualEntryModal({ suppliers, onClose, onSuccess }: Props) {
  const [supplierId, setSupplierId] = useState<string>('')
  const [issueDate,  setIssueDate]  = useState<string>(todayStr())
  const [notes,      setNotes]      = useState<string>('')
  const [items,      setItems]      = useState<ItemDraft[]>([emptyItem()])
  const [error,      setError]      = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function patchItem(idx: number, patch: Partial<ItemDraft>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  const total = items.reduce((sum, it) => {
    const q = parseFloat(it.quantity.replace(',', '.')) || 0
    const p = parseFloat(it.unit_price.replace(',', '.')) || 0
    return sum + q * p
  }, 0)

  function handleSave() {
    setError(null)
    const parsedItems: ManualPurchaseItem[] = items.map(it => ({
      description: it.description.trim(),
      quantity:    parseFloat(it.quantity.replace(',', '.')) || 0,
      unit_price:  parseFloat(it.unit_price.replace(',', '.')) || 0,
      unit:        it.unit.trim() || null,
      ean:         it.ean.trim()  || null,
    }))

    for (const it of parsedItems) {
      if (!it.description) { setError('Todos os itens precisam de descrição.'); return }
      if (!(it.quantity > 0)) { setError(`Quantidade inválida para "${it.description}".`); return }
    }

    startTransition(async () => {
      const res = await createManualPurchaseOrder({
        supplier_id: supplierId || null,
        issue_date:  issueDate || null,
        notes:       notes.trim() || null,
        items:       parsedItems,
      })
      if ('error' in res) { setError(res.error); return }
      onSuccess(res)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-in">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600">
              <PackagePlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Entrada Manual</h2>
              <p className="text-[11px] text-slate-500">Registro de mercadoria sem NF-e XML</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Fornecedor + Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fornecedor (opcional)</label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
              >
                <option value="">— Sem fornecedor —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data de Entrada</label>
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Itens */}
          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Itens · {items.length}
              </span>
              <button
                onClick={addItem}
                className="flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white"
              >
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <div key={idx} className="px-3 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={it.description}
                      onChange={e => patchItem(idx, { description: e.target.value })}
                      placeholder="Descrição do item *"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qtd *</label>
                      <input
                        value={it.quantity}
                        onChange={e => patchItem(idx, { quantity: e.target.value })}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unid.</label>
                      <input
                        value={it.unit}
                        onChange={e => patchItem(idx, { unit: e.target.value })}
                        placeholder="UN, CX, KG..."
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Preço unitário *</label>
                      <input
                        value={it.unit_price}
                        onChange={e => patchItem(idx, { unit_price: e.target.value })}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">EAN/Código de Barras (opcional)</label>
                    <input
                      value={it.ean}
                      onChange={e => patchItem(idx, { ean: e.target.value })}
                      placeholder="Para auto-match com estoque"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50">
              <span className="text-xs font-semibold text-slate-600">Total estimado</span>
              <span className="text-base font-bold text-purple-700 font-mono tabular-nums">
                {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhes da entrada — origem, motivo, número de pedido externo..."
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm resize-none focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</>
              : <><PackagePlus className="h-4 w-4" /> Registrar Entrada</>}
          </button>
        </div>
      </div>
    </div>
  )
}
