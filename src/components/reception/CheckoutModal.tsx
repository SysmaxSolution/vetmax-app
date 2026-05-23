'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CreditCard, Banknote, Smartphone, Receipt, AlertCircle } from 'lucide-react'
import { getInvoiceWithItems, processPayment, type InvoiceWithDetails, type PaymentMethod } from '@/lib/actions/billing'
import InsuranceExportPanel from '@/components/reception/InsuranceExportPanel'
import CheckoutInsurancePreviewClient from '@/components/financial/CheckoutInsurancePreviewClient'
import InvoiceDuplicatasList from '@/components/financial/InvoiceDuplicatasList'
import CardPaymentDetailsModal from './CardPaymentDetailsModal'

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
  /**
   * Split de convênio aplicado pelo botão "Aplicar cobertura no caixa".
   * Quando ativo, o caixa cobra só charge_now do tutor; o resto vira entry
   * pending de A Receber Petlove + desconto contábil.
   */
  const [insuranceSplit, setInsuranceSplit] = useState<{
    charge_now:        number
    receivable:        number
    clinic_discount:   number
    procedure_pattern: string
  } | null>(null)
  /** Valor que efetivamente entrará no caixa AGORA — editável pelo usuário. */
  const [amountReceivedInput, setAmountReceivedInput] = useState('')
  /** Itens da consulta que estão em carência — mostra modal antes do checkout. */
  const [waitingItems, setWaitingItems]   = useState<Array<{ description: string; remaining: number }>>([])
  const [waitingAck,   setWaitingAck]     = useState(false)
  /** Detalhes do cartão (administradora, NSU, autorização) — obrigatório quando método é credit/debit. */
  const [cardDetails,  setCardDetails]    = useState<{ acquirer: string; nsu: string; authorization: string } | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)

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

  // Estado pré-existente da invoice (paid_amount + discount já gravados).
  // Importante quando o caixa reabre uma invoice paid_partial — o Total a
  // Pagar deve ser o SALDO restante, não o cheio.
  const existingPaid     = invoice.paid_amount ?? 0
  const existingDiscount = invoice.discount    ?? 0
  // Detecta se a cobertura do convênio JÁ foi aplicada (há discount > 0 na
  // invoice). Nesse caso, o split do CheckoutInsurancePreviewClient não
  // precisa ser re-aplicado — apenas mostrado.
  const insuranceAlreadyApplied = existingDiscount > 0.01 && existingPaid > 0

  // Novo desconto desta operação (insurance_split desta sessão OU manual)
  const insuranceDiscountThisOp = insuranceSplit?.clinic_discount ?? 0

  // Subtotal real (com ajustes de preços feitos pelo caixa)
  // O total da invoice já reflete subtotal - existingDiscount; quando o
  // usuário aplica cobertura nova OU desconto novo, somamos ao discount.
  const totalAmount = Math.max(0, dynamicSubtotal - existingDiscount - discountValue - insuranceDiscountThisOp)
  const totalDue    = Math.max(0, totalAmount - existingPaid)

  const amountReceived = (() => {
    const raw = amountReceivedInput.trim()
    if (raw === '') return totalDue
    const parsed = parseFloat(raw.replace(',', '.'))
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, totalDue)) : totalDue
  })()
  const restante = Math.max(0, totalDue - amountReceived)

  async function handleConfirm(overrideCardDetails?: { acquirer: string; nsu: string; authorization: string }) {
    if (!invoice) return

    const effectiveCardDetails = overrideCardDetails ?? cardDetails

    // Cartão (crédito/débito) exige dados de conciliação antes de prosseguir.
    const requiresCard = paymentMethod === 'credit' || paymentMethod === 'debit'
    if (requiresCard && !effectiveCardDetails) {
      setShowCardModal(true)
      return
    }

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
      amount_received: amountReceived,
      insurance_split: insuranceSplit ? {
        receivable_amount: insuranceSplit.receivable,
        receivable_source: 'petlove_open',
        clinic_discount:   insuranceSplit.clinic_discount,
        procedure_pattern: insuranceSplit.procedure_pattern,
      } : undefined,
      card_details: requiresCard && effectiveCardDetails ? effectiveCardDetails : undefined,
    })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess(invoice.patient.name, amountReceived)
  }

  // Limpa os dados de cartão quando o usuário troca o método de pagamento
  useEffect(() => {
    if (paymentMethod !== 'credit' && paymentMethod !== 'debit') setCardDetails(null)
  }, [paymentMethod])

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

          {/* Faixa de aviso quando invoice já tem baixas (paid_partial) */}
          {existingPaid > 0.01 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs">
              <p className="font-semibold text-emerald-900">
                Fatura com baixa parcial · {fmt(existingPaid)} já recebido
                {existingDiscount > 0 && ` · ${fmt(existingDiscount)} de desconto aplicado`}
              </p>
              <p className="text-emerald-700 mt-0.5">
                Saldo a receber: <strong>{fmt(totalDue)}</strong>
                {insuranceAlreadyApplied && ' · aguardando repasse Petlove'}
              </p>
            </div>
          )}

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

          {/* Duplicatas — histórico de baixas + saldo restante + estorno */}
          {(invoice.paid_amount ?? 0) > 0 && (
            <InvoiceDuplicatasList
              invoiceId={invoice.id}
              totalAmount={invoice.total_amount}
              paidAmount={invoice.paid_amount ?? 0}
            />
          )}

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
            <CheckoutInsurancePreviewClient
              consultationId={invoice.consultation_id}
              patientName={invoice.patient.name}
              tutorName={invoice.tutor.name}
              alreadyApplied={insuranceAlreadyApplied}
              onWaitingDetected={items => { setWaitingItems(items); setWaitingAck(false) }}
              onApplyInsurance={(split) => {
                if (split) {
                  setInsuranceSplit({
                    charge_now:        split.charge_now,
                    receivable:        split.receivable,
                    clinic_discount:   split.clinic_discount,
                    procedure_pattern: split.procedure_pattern,
                  })
                  setAmountReceivedInput(split.charge_now.toFixed(2).replace('.', ','))
                } else {
                  setInsuranceSplit(null)
                  setAmountReceivedInput('')
                }
              }}
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

          {/* Total devido (após descontos) */}
          <div className="rounded-xl bg-slate-900 px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total a Pagar</span>
            <span className="text-xl font-bold text-white">{fmt(totalDue)}</span>
          </div>

          {/* Quanto receber AGORA — permite baixa parcial */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Quanto vai receber agora?
            </label>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-slate-500 font-semibold">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountReceivedInput}
                onChange={e => setAmountReceivedInput(e.target.value)}
                placeholder={totalDue.toFixed(2).replace('.', ',')}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              />
              <button
                type="button"
                onClick={() => setAmountReceivedInput('')}
                className="text-[11px] text-slate-500 hover:text-slate-700 underline whitespace-nowrap"
              >
                = total
              </button>
            </div>
            {restante > 0.005 && (
              <div className="mt-2 text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                Saldo restante:{' '}
                <strong className="tabular-nums">{fmt(restante)}</strong>
                {insuranceSplit ? (
                  <> · será lançado como <strong>A Receber Petlove</strong> e baixado quando a remessa fechada chegar.</>
                ) : (
                  <> · ficará pendente para baixa futura.</>
                )}
              </div>
            )}
            {insuranceSplit && (
              <div className="mt-2 text-[11px] px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800">
                Cobertura Petlove aplicada · desconto contábil de <strong>{fmt(insuranceSplit.clinic_discount)}</strong> · repasse de <strong>{fmt(insuranceSplit.receivable)}</strong> ficará como A Receber.
              </div>
            )}
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
              onClick={() => handleConfirm()}
              disabled={submitting || (amountReceived <= 0.005 && !insuranceSplit)}
              data-mentor-step="cashier-confirm-payment-btn"
              title={amountReceived <= 0.005 && !insuranceSplit ? 'Informe um valor maior que zero para receber, ou aplique a cobertura do convênio.' : undefined}
              className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Modal de aviso de carência — bloqueia o checkout até o usuário decidir */}
      {waitingItems.length > 0 && !waitingAck && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Procedimento em carência</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Esta consulta tem item{waitingItems.length > 1 ? 'ns' : ''} ainda em carência no plano do tutor.
                </p>
              </div>
            </div>

            <ul className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1 text-xs">
              {waitingItems.map(it => (
                <li key={it.description} className="flex items-center justify-between text-amber-900">
                  <span className="truncate">{it.description}</span>
                  <span className="font-semibold flex-shrink-0">faltam {it.remaining}d</span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-slate-600">
              Pelo plano, o convênio só cobre após a carência. Como deseja proceder?
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { setWaitingAck(true) /* continua o fluxo: pode aplicar cobertura ou cobrar cheio */ }}
                className="rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                Cobrar particular cheio (sem convênio)
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Aguardar liberação · fechar caixa
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center pt-1">
              Se a clínica decidir cobrar particular, o tutor não terá o benefício do plano nesta consulta.
            </p>
          </div>
        </div>
      )}

      {showCardModal && (paymentMethod === 'credit' || paymentMethod === 'debit') && (
        <CardPaymentDetailsModal
          paymentMethod={paymentMethod}
          amount={amountReceived}
          onCancel={() => setShowCardModal(false)}
          onConfirm={(details) => {
            setCardDetails(details)
            setShowCardModal(false)
            void handleConfirm(details)
          }}
        />
      )}
    </div>
  )
}
