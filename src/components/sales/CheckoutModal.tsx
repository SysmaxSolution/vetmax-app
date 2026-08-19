'use client'

import { useState, useTransition } from 'react'
import { X, CheckCircle2, Receipt, AlertCircle } from 'lucide-react'
import { createSale, type CreateSaleParams, type SaleTutor } from '@/lib/actions/sales'
import { sellPackageToPet } from '@/lib/actions/packages'
import { cartSubtotal, type CartItem } from './SalesCart'
import type { Sale } from '@/lib/actions/sales'
import PaymentMethodModal, { type PaymentSplit } from '@/components/payments/PaymentMethodModal'

interface CheckoutModalProps {
  clinicId:    string
  items:       CartItem[]
  discount:    number
  tutor?:      SaleTutor | null
  petId?:      string | null
  onSuccess:   (sale: Sale) => void
  onClose:     () => void
}

export default function CheckoutModal({
  clinicId, items, discount, tutor, petId, onSuccess, onClose,
}: CheckoutModalProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(true)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const subtotal = cartSubtotal(items)
  const total    = Math.max(subtotal - discount, 0)

  async function handlePaymentConfirm(splits: PaymentSplit[]) {
    if (items.length === 0) { setError('Carrinho vazio.'); return }
    setError('')

    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          // Determina payment_method principal — quando split, usamos o de maior valor
          const sorted = [...splits].sort((a, b) => b.amount - a.amount)
          const primary = sorted[0]
          const mapped = mapToSalesMethod(primary.payment_method)

          const params: CreateSaleParams = {
            clinic_id:       clinicId,
            items:           items.map(i => ({
              stock_item_id: i.stock_item_id,
              description:   i.description,
              quantity:      i.quantity,
              unit_price:    i.unit_price,
              discount:      i.discount,
            })),
            payment_method:  mapped,
            discount_amount: discount,
            tutor_id:        tutor?.id ?? null,
            patient_id:      petId ?? null,
            splits:          splits.length > 0
              ? splits.map(s => ({
                  amount:             s.amount,
                  payment_method:     mapToSalesMethod(s.payment_method),
                  payment_card_id:    s.payment_card_id ?? null,
                  installments:       s.installments,
                  card_acquirer:      s.card_acquirer ?? null,
                  card_brand:         s.card_brand ?? null,
                  card_nsu:           s.card_nsu ?? null,
                  card_authorization: s.card_authorization ?? null,
                  transaction_date:   s.transaction_date ?? null,
                }))
              : undefined,
          }

          const result = await createSale(params)
          if ('error' in result) {
            setError(result.error)
            reject(new Error(result.error))
            return
          }

          if (petId) {
            const packageItems = items.filter(i => !!i.package_id)
            for (const item of packageItems) {
              await sellPackageToPet({
                pet_id:     petId,
                package_id: item.package_id!,
                price_paid: item.unit_price * item.quantity - item.discount,
              })
            }
          }

          const sale: Sale = {
            id:              result.id,
            clinic_id:       clinicId,
            seller_id:       null,
            tutor_id:        null,
            total_amount:    result.total,
            discount_amount: discount,
            payment_method:  mapped,
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
          setShowPaymentModal(false)
          onSuccess(sale)
          resolve()
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Falha desconhecida.'
          setError(msg)
          reject(e instanceof Error ? e : new Error(msg))
        }
      })
    })
  }

  if (!showPaymentModal && !error) {
    return null
  }

  return (
    <>
      {showPaymentModal && (
        <PaymentMethodModal
          totalDue={total}
          subject={`Venda PDV${tutor ? ` · ${tutor.name}` : ''}`}
          onCancel={() => { setShowPaymentModal(false); onClose() }}
          onConfirm={handlePaymentConfirm}
        />
      )}
      {error && !isPending && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-3 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Falha ao registrar venda</h2>
            </div>
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setError(''); setShowPaymentModal(true) }}
                className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-semibold text-white"
              >
                <Receipt className="h-4 w-4 inline mr-1.5" /> Tentar novamente
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4 inline mr-1.5" /> Fechar
              </button>
            </div>
            {subtotal > 0 && (
              <p className="text-[11px] text-slate-400 text-center pt-1">
                Subtotal {subtotal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}{discount > 0 ? ` · Desconto ${discount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}` : ''} · Total {total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
              </p>
            )}
            {isPending && <CheckCircle2 className="h-4 w-4 animate-pulse text-slate-300" />}
          </div>
        </div>
      )}
    </>
  )
}

function mapToSalesMethod(m: string): 'cash' | 'credit' | 'debit' | 'pix' | 'convenio' | 'other' {
  if (m === 'cash' || m === 'credit' || m === 'debit' || m === 'pix' || m === 'convenio') return m
  return 'other'
}
