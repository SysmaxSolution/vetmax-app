'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CreditCard, Banknote, Smartphone, Receipt } from 'lucide-react'
import { getInvoiceWithItems, processPayment, type InvoiceWithDetails, type PaymentMethod } from '@/lib/actions/billing'
import InsuranceExportPanel from '@/components/reception/InsuranceExportPanel'
import CheckoutInsurancePreview from '@/components/financial/CheckoutInsurancePreview'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'pix',    label: 'Pix',            icon: <Smartphone className="h-4 w-4" /> },
  { value: 'credit', label: 'Cartão Crédito', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'debit',  label: 'Cartão Débito',  icon: <CreditCard className="h-4 w-4" /> },
  { value: 'cash',   label: 'Dinheiro',       icon: <Banknote className="h-4 w-4" /> },
]

const ITEM_TYPE_LABEL: Record<string, string> = {
  consultation: 'Consulta',
  medication:   'Medicação',
  exam:         'Exame',
  other:        'Outro',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  invoiceId: string
  onClose:   () => void
  onSuccess: (petName: string, total: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckoutModal({ invoiceId, onClose, onSuccess }: Props) {
  const [invoice,      setInvoice]      = useState<InvoiceWithDetails | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const [discountType,  setDiscountType]  = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [submitting,    setSubmitting]    = useState(false)
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({})  // itemId → raw input

  useEffect(() => {
    getInvoiceWithItems(invoiceId).then(res => {
      setLoading(false)
      if ('error' in res) { setError(res.error); return }
      setInvoice(res)
    })
  }, [invoiceId])

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl p-10 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          <span className="text-sm text-slate-600">Carregando fatura...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={onClose} className="text-slate-500 text-sm underline">Fechar</button>
        </div>
      </div>
    )
  }

  // Subtotal dinâmico: usa preços editados onde presentes, senão os originais
  const dynamicSubtotal = invoice.items.reduce((sum, item) => {
    const raw = editingPrices[item.id]
    const price = raw !== undefined
      ? (parseFloat(raw.replace(',', '.')) || 0)
      : item.unit_price
    return sum + Math.max(0, price) * item.quantity
  }, 0)

  // Calcular desconto e total dinâmicos
  const discountValue = (() => {
    const raw = parseFloat(discountInput.replace(',', '.')) || 0
    if (discountType === 'percent') {
      return Math.min(dynamicSubtotal, (dynamicSubtotal * raw) / 100)
    }
    return Math.min(dynamicSubtotal, raw)
  })()

  const totalDue = Math.max(0, dynamicSubtotal - discountValue)

  async function handleConfirm() {
    if (!invoice) return
    setSubmitting(true)

    // Montar overrides de preço para itens editados
    const item_prices = Object.entries(editingPrices)
      .map(([id, raw]) => ({ id, unit_price: Math.max(0, parseFloat(raw.replace(',', '.')) || 0) }))
      .filter(o => {
        const orig = invoice.items.find(it => it.id === o.id)
        return orig && o.unit_price !== orig.unit_price
      })

    const res = await processPayment(invoice.id, {
      payment_method: paymentMethod,
      discount:       discountValue,
      item_prices:    item_prices.length > 0 ? item_prices : undefined,
    })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess(invoice.patient.name, totalDue)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100">
              <Receipt className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Receber Pagamento</h2>
              <p className="text-xs text-slate-500">
                {SPECIES_EMOJI[invoice.patient.species] ?? '🐾'} {invoice.patient.name}
                {' · '}{invoice.tutor.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Itens — estilo cupom fiscal */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Itens da Consulta</p>
              {invoice.items.some(it => it.unit_price === 0) && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  Ajuste preços zerados
                </span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {invoice.items.map((item) => {
                const rawInput  = editingPrices[item.id]
                const isEditing = rawInput !== undefined
                const isZero    = item.unit_price === 0 && !isEditing

                return (
                  <div key={item.id} className={`flex items-center justify-between px-4 py-3 bg-white gap-3 ${isZero ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                        item.item_type === 'consultation'
                          ? 'bg-blue-100 text-blue-700'
                          : item.item_type === 'medication'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          autoFocus
                          value={rawInput}
                          onChange={e => setEditingPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onBlur={() => {
                            // Mantém o override mesmo ao perder foco
                          }}
                          className="w-24 text-right border border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          placeholder="0,00"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingPrices(prev => ({
                            ...prev,
                            [item.id]: String(item.unit_price),
                          }))}
                          className={`text-sm font-semibold px-2 py-1 rounded-lg transition-colors ${
                            isZero
                              ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                              : 'text-slate-800 hover:bg-slate-100'
                          }`}
                          title="Clique para editar"
                        >
                          {isZero ? 'R$ —' : fmt(item.unit_price)}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* Subtotal */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                <span className="text-xs font-semibold text-slate-500">Subtotal</span>
                <span className="text-sm font-semibold text-slate-700">{fmt(dynamicSubtotal)}</span>
              </div>
            </div>
            {Object.keys(editingPrices).length > 0 && (
              <p className="mt-1.5 text-xs text-blue-600">
                Preços ajustados — o total será atualizado automaticamente
              </p>
            )}
          </div>

          {/* Painel de Convênio (exibido automaticamente se o pet tiver convênio) */}
          <InsuranceExportPanel
            patientId={invoice.patient_id}
            consultationId={invoice.consultation_id}
            patientName={invoice.patient.name}
            tutorName={invoice.tutor.name}
            items={invoice.items}
          />

          {/* Caixa Inteligente — split tutor × cartão Petlove × repasse + botão imprimir */}
          {invoice.consultation_id && (
            <CheckoutInsurancePreview
              consultationId={invoice.consultation_id}
              patientName={invoice.patient.name}
              tutorName={invoice.tutor.name}
            />
          )}

          {/* Desconto */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Desconto</p>
            <div className="flex gap-2">
              <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs flex-shrink-0">
                <button
                  onClick={() => setDiscountType('amount')}
                  className={`px-3 py-2 font-semibold transition-colors ${
                    discountType === 'amount' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  R$
                </button>
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`px-3 py-2 font-semibold transition-colors ${
                    discountType === 'percent' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  %
                </button>
              </div>
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? 100 : dynamicSubtotal}
                step="0.01"
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                placeholder={discountType === 'percent' ? 'Ex: 10' : 'Ex: 20,00'}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            {discountValue > 0 && (
              <p className="mt-1 text-xs text-emerald-600">
                Desconto aplicado: {fmt(discountValue)}
              </p>
            )}
          </div>

          {/* Método de Pagamento */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Método de Pagamento</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentMethod(opt.value)}
                  data-mentor-step={`cashier-payment-method-${opt.value}`}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                    paymentMethod === opt.value
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="rounded-xl bg-slate-900 px-5 py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300">Total a Pagar</span>
            <span className="text-2xl font-bold text-white">{fmt(totalDue)}</span>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              data-mentor-step="cashier-confirm-payment-btn"
              className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
              ) : (
                <><Receipt className="h-4 w-4" /> Confirmar Recebimento</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
