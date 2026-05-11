'use client'

import { useState, useTransition } from 'react'
import { X, CreditCard, Banknote, QrCode, Handshake, CheckCircle2 } from 'lucide-react'
import { createSale, type CreateSaleParams, type SaleTutor } from '@/lib/actions/sales'
import { cartSubtotal, PAYMENT_LABELS, type CartItem } from './SalesCart'
import type { Sale } from '@/lib/actions/sales'

interface CheckoutModalProps {
  clinicId:    string
  items:       CartItem[]
  discount:    number
  tutor?:      SaleTutor | null
  onSuccess:   (sale: Sale) => void
  onClose:     () => void
}

type PaymentMethod = 'cash' | 'credit' | 'debit' | 'pix' | 'convenio' | 'other'

const PAYMENT_OPTIONS: { method: PaymentMethod; label: string; icon: React.ComponentType<{ className: string }> }[] = [
  { method: 'cash',     label: 'Dinheiro',       icon: Banknote  },
  { method: 'credit',   label: 'Cartão Crédito', icon: CreditCard },
  { method: 'debit',    label: 'Cartão Débito',  icon: CreditCard },
  { method: 'pix',      label: 'Pix',            icon: QrCode    },
  { method: 'convenio', label: 'Convênio',       icon: Handshake  },
]

export default function CheckoutModal({
  clinicId, items, discount, tutor, onSuccess, onClose,
}: CheckoutModalProps) {
  const [method,   setMethod]  = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const [error,    setError]   = useState('')
  const [isPending, startTransition] = useTransition()

  const subtotal = cartSubtotal(items)
  const total    = Math.max(subtotal - discount, 0)
  const change   = method === 'cash'
    ? Math.max((parseFloat(received.replace(',', '.')) || 0) - total, 0)
    : 0

  function handleConfirm() {
    if (items.length === 0) { setError('Carrinho vazio.'); return }
    setError('')

    startTransition(async () => {
      const params: CreateSaleParams = {
        clinic_id:       clinicId,
        items:           items.map(i => ({
          stock_item_id: i.stock_item_id,
          description:   i.description,
          quantity:      i.quantity,
          unit_price:    i.unit_price,
          discount:      i.discount,
        })),
        payment_method:  method,
        discount_amount: discount,
        tutor_id:        tutor?.id ?? null,
      }

      const result = await createSale(params)

      if ('error' in result) {
        setError(result.error)
        return
      }

      // Constrói objeto Sale mínimo para o recibo
      const sale: Sale = {
        id:              result.id,
        clinic_id:       clinicId,
        seller_id:       null,
        tutor_id:        null,
        total_amount:    result.total,
        discount_amount: discount,
        payment_method:  method,
        payment_status:  'paid',
        notes:           null,
        created_at:      new Date().toISOString(),
        cancelled_at:    null,
        items: items.map(i => ({
          id:            crypto.randomUUID(),
          stock_item_id: i.stock_item_id,
          description:   i.description,
          quantity:      i.quantity,
          unit_price:    i.unit_price,
          discount:      i.discount,
          total:         i.quantity * i.unit_price - i.discount,
        })),
      }

      onSuccess(sale)
    })
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Finalizar Venda</h2>
          <button onClick={onClose} disabled={isPending} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Resumo */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto global</span>
                <span>-R$ {discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
              <span>Total</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Forma de pagamento */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Forma de pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map(o => {
                const Icon = o.icon
                const active = method === o.method
                return (
                  <button
                    key={o.method}
                    type="button"
                    onClick={() => setMethod(o.method)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Troco (só no dinheiro) */}
          {method === 'cash' && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Valor recebido</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">R$</span>
                <input
                  type="text"
                  placeholder="0,00"
                  value={received}
                  onChange={e => setReceived(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {change > 0 && (
                <p className="text-sm text-green-700 font-semibold mt-1.5">
                  Troco: R$ {change.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || items.length === 0}
            className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isPending ? 'Registrando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
