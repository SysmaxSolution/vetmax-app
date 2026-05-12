'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Package, Link2, Loader2 } from 'lucide-react'
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/actions/purchases'
import {
  confirmPurchaseReceipt,
  cancelPurchaseOrder,
  getPurchaseOrder,
} from '@/lib/actions/purchases'
import { ItemMatchingPanel } from './ItemMatchingPanel'

interface Props {
  order:          PurchaseOrder
  onStatusChange: () => void
}

const STATUS_CONFIG = {
  pending:   { label: 'Pendente',  color: 'bg-amber-100 text-amber-700',  icon: Clock },
  received:  { label: 'Recebida',  color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700',      icon: XCircle },
}

export function PurchaseOrderCard({ order, onStatusChange }: Props) {
  const [expanded, setExpanded]       = useState(false)
  const [fullOrder, setFullOrder]     = useState<PurchaseOrder | null>(null)
  const [matchingItem, setMatchingItem] = useState<PurchaseOrderItem | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [msg, setMsg]                 = useState<string | null>(null)

  const status = STATUS_CONFIG[order.status]
  const StatusIcon = status.icon

  function loadItems() {
    if (fullOrder) { setExpanded(v => !v); return }
    setExpanded(true)
    startTransition(async () => {
      const res = await getPurchaseOrder(order.id)
      if (!('error' in res)) setFullOrder(res)
    })
  }

  function handleConfirm() {
    startTransition(async () => {
      setMsg(null)
      const res = await confirmPurchaseReceipt(order.id)
      if ('error' in res) { setMsg(res.error); return }
      onStatusChange()
    })
  }

  function handleCancel() {
    if (!confirm('Cancelar esta ordem de compra?')) return
    startTransition(async () => {
      const res = await cancelPurchaseOrder(order.id)
      if ('error' in res) { setMsg(res.error); return }
      onStatusChange()
    })
  }

  const items = fullOrder?.items ?? []
  const unmatchedCount = items.filter(i => !i.is_matched).length

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.color}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
              {order.nfe_number && (
                <span className="text-xs text-slate-500">NF-e nº {order.nfe_number}/{order.nfe_series}</span>
              )}
              {order.issue_date && (
                <span className="text-xs text-slate-400">
                  {new Date(order.issue_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <p className="mt-1 font-semibold text-slate-800 truncate">
              {(order.supplier as any)?.name ?? 'Fornecedor não informado'}
            </p>
            {order.total_value != null && (
              <p className="text-sm text-purple-700 font-bold">
                {order.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            )}
            {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {order.status === 'pending' && (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Confirmar
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            )}
            <button
              onClick={loadItems}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
            >
              {expanded
                ? <ChevronUp className="h-4 w-4 text-slate-500" />
                : <ChevronDown className="h-4 w-4 text-slate-500" />}
            </button>
          </div>
        </div>

        {/* Expanded items */}
        {expanded && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            {isPending && !fullOrder ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando itens...
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum item nesta ordem.</p>
            ) : (
              <>
                {unmatchedCount > 0 && order.status === 'pending' && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    <Link2 className="h-4 w-4" />
                    {unmatchedCount} item(ns) sem correspondência no estoque — clique em "Vincular" para associar.
                  </div>
                )}
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-100 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-700 truncate">{item.description}</p>
                        <p className="text-xs text-slate-400">
                          {item.quantity} {item.unit} × {item.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          {item.ncm ? ` · NCM ${item.ncm}` : ''}
                          {item.ean ? ` · EAN ${item.ean}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.is_matched ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Vinculado
                          </span>
                        ) : (
                          <button
                            onClick={() => setMatchingItem(item)}
                            className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100"
                          >
                            <Link2 className="h-3 w-3" />
                            Vincular
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {matchingItem && (
        <ItemMatchingPanel
          item={matchingItem}
          onClose={() => setMatchingItem(null)}
          onMatched={() => {
            setMatchingItem(null)
            startTransition(async () => {
              const res = await getPurchaseOrder(order.id)
              if (!('error' in res)) setFullOrder(res)
            })
          }}
        />
      )}
    </>
  )
}
