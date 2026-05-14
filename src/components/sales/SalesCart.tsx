'use client'

import { Trash2, Plus, Minus } from 'lucide-react'

export interface CartItem {
  key:           string
  stock_item_id: string | null
  package_id?:   string | null
  description:   string
  unit_price:    number
  quantity:      number
  discount:      number
}

interface SalesCartProps {
  items:     CartItem[]
  onChange:  (items: CartItem[]) => void
  disabled?: boolean
}

const PAYMENT_LABELS: Record<string, string> = {
  cash:     'Dinheiro',
  credit:   'Cartão Crédito',
  debit:    'Cartão Débito',
  pix:      'Pix',
  convenio: 'Convênio',
  other:    'Outro',
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((s, i) => s + i.quantity * i.unit_price - i.discount, 0)
}

export { PAYMENT_LABELS }

export default function SalesCart({ items, onChange, disabled = false }: SalesCartProps) {
  function update(key: string, patch: Partial<CartItem>) {
    onChange(items.map(i => i.key === key ? { ...i, ...patch } : i))
  }

  function remove(key: string) {
    onChange(items.filter(i => i.key !== key))
  }

  function adjustQty(key: string, delta: number) {
    const item = items.find(i => i.key === key)!
    const next = Math.max(0.001, +(item.quantity + delta).toFixed(3))
    update(key, { quantity: next })
  }

  const subtotal = cartSubtotal(items)

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-200 rounded-xl">
        <p className="text-sm text-slate-400">Nenhum item adicionado</p>
        <p className="text-xs text-slate-300 mt-1">Busque um produto acima ou adicione manualmente</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const lineTotal = item.quantity * item.unit_price - item.discount
        return (
          <div key={item.key} className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{item.description}</p>
              <div className="flex items-center gap-2 mt-1">
                {/* Quantity controls */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustQty(item.key, -1)}
                    disabled={disabled || item.quantity <= 1}
                    className="h-6 w-6 rounded flex items-center justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    type="number"
                    min="0.001"
                    step="1"
                    value={item.quantity}
                    disabled={disabled}
                    onChange={e => update(item.key, { quantity: Math.max(0.001, Number(e.target.value)) })}
                    className="w-12 text-center text-sm border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => adjustQty(item.key, 1)}
                    disabled={disabled}
                    className="h-6 w-6 rounded flex items-center justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-xs text-slate-400">×</span>
                <span className="text-xs text-slate-600">R$ {item.unit_price.toFixed(2)}</span>
                {item.discount > 0 && (
                  <span className="text-xs text-green-600">-R$ {item.discount.toFixed(2)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-semibold text-slate-900 min-w-[4rem] text-right">
                R$ {lineTotal.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => remove(item.key)}
                disabled={disabled}
                className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
                aria-label={`Remover ${item.description}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Subtotal */}
      <div className="flex justify-between items-center pt-2 border-t border-slate-200 px-1">
        <span className="text-sm text-slate-500">Subtotal</span>
        <span className="text-sm font-semibold text-slate-900">R$ {subtotal.toFixed(2)}</span>
      </div>
    </div>
  )
}
