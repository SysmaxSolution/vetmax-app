'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Receipt, AlertCircle, Gift, Plus, Search, Trash2 } from 'lucide-react'
import {
  getInvoiceWithItems, processSplitPayment, processPayment, markInvoiceAsCourtesy,
  addItemToInvoice, removeItemFromInvoice,
  type InvoiceWithDetails,
} from '@/lib/actions/billing'
import { searchSalesProducts, type StockProduct } from '@/lib/actions/sales'
import InsuranceExportPanel from '@/components/reception/InsuranceExportPanel'
import CheckoutInsurancePreviewClient from '@/components/financial/CheckoutInsurancePreviewClient'
import InvoiceDuplicatasList from '@/components/financial/InvoiceDuplicatasList'
import PaymentMethodModal, { type PaymentSplit } from '@/components/payments/PaymentMethodModal'
import { computeCheckoutTotals } from '@/lib/checkout-totals'
import { getConsultationCopayInterestPreview, type CopayInterestPreview } from '@/lib/actions/insurance-checkout'
import NfseTutorGate from '@/components/billing/NfseTutorGate'
import { clinicEmitsNfse } from '@/lib/actions/billing-documents'
import { emitNfseForConsultation } from '@/lib/actions/nfse'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  consultation: 'Consulta',
  medication:   'Medicação',
  exam:         'Exame',
  other:        'Outro',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  invoiceId: string
  /**
   * Épico B — C4 (04/06): visão compacta para o operador — esconde os dados
   * administrativos do convênio (repasse, desconto da clínica, economia).
   * O operador vê itens, valor a cobrar e taxa; "Dados do convênio" são da
   * conferência do admin.
   */
  operatorView?: boolean
  onClose:   () => void
  onSuccess: (petName: string, total: number) => void
}

export default function CheckoutModal({ invoiceId, operatorView = false, onClose, onSuccess }: Props) {
  const [invoice,      setInvoice]      = useState<InvoiceWithDetails | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const [discountType,  setDiscountType]  = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('')
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({})
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [confirmCourtesy, setConfirmCourtesy]   = useState(false)
  const [submittingCourtesy, setSubmittingCourtesy] = useState(false)
  // Pergunta de NFS-e pós-pagamento (Faturamento Fase 3) — só quando a clínica
  // emite nota e a fatura tem consulta vinculada.
  const [nfsePrompt, setNfsePrompt] = useState<{ consultationId: string; petName: string; total: number } | null>(null)
  const [emittingNfse, setEmittingNfse] = useState(false)
  const [nfseResult, setNfseResult] = useState<string | null>(null)

  async function handleConfirmCourtesy() {
    if (!invoice || submittingCourtesy) return
    setSubmittingCourtesy(true)
    setError(null)
    // Desconto digitado no modal (o que zerou o total) é persistido na fatura
    const res = await markInvoiceAsCourtesy(
      invoice.id,
      'Procedimento sem cobrança (regra de negócio da clínica)',
      discountValue + (insuranceSplit?.clinic_discount ?? 0),
    )
    setSubmittingCourtesy(false)
    if ('error' in res) { setError(res.error); return }
    setConfirmCourtesy(false)
    onSuccess(invoice.patient.name, 0)
  }
  const [insuranceSplit, setInsuranceSplit] = useState<{
    charge_now:        number
    receivable:        number
    deferred_provider: number
    clinic_discount:   number
    procedure_pattern: string
  } | null>(null)
  const [waitingItems, setWaitingItems] = useState<Array<{ description: string; remaining: number }>>([])
  const [waitingAck,   setWaitingAck]   = useState(false)
  // Épico A (04/06): taxa adm. sobre coparticipação paga no cartão — carregada
  // quando a cobertura é aplicada; o PaymentMethodModal exibe e aplica.
  const [copayInterestPreview, setCopayInterestPreview] = useState<CopayInterestPreview | null>(null)

  // Épico B — C1 (04/06): itens avulsos adicionados no recebimento.
  // Rastreia (invoice_item_id → stock_item_id) para devolver estoque na remoção.
  const [showAddItem,   setShowAddItem]   = useState(false)
  const [itemQuery,     setItemQuery]     = useState('')
  const [itemResults,   setItemResults]   = useState<StockProduct[]>([])
  const [itemSearching, setItemSearching] = useState(false)
  const [addedItems,    setAddedItems]    = useState<Record<string, string>>({})
  const [addingItem,    setAddingItem]    = useState(false)
  const itemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleItemQueryChange(q: string) {
    setItemQuery(q)
    if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current)
    if (q.trim().length < 2) { setItemResults([]); return }
    itemSearchTimer.current = setTimeout(async () => {
      setItemSearching(true)
      const r = await searchSalesProducts(q)
      setItemSearching(false)
      setItemResults(r)
    }, 250)
  }

  async function handleAddItem(p: StockProduct) {
    if (!invoice || addingItem) return
    setAddingItem(true)
    setError(null)
    const res = await addItemToInvoice(invoice.id, p.id, 1)
    setAddingItem(false)
    if ('error' in res) { setError(res.error); return }
    setAddedItems(prev => ({ ...prev, [res.invoice_item_id]: p.id }))
    setItemQuery('')
    setItemResults([])
    const refreshed = await getInvoiceWithItems(invoice.id)
    if (!('error' in refreshed)) setInvoice(refreshed)
  }

  async function handleRemoveAddedItem(invoiceItemId: string) {
    if (!invoice) return
    setError(null)
    const res = await removeItemFromInvoice(invoiceItemId, addedItems[invoiceItemId] ?? null)
    if ('error' in res) { setError(res.error); return }
    setAddedItems(prev => {
      const next = { ...prev }
      delete next[invoiceItemId]
      return next
    })
    const refreshed = await getInvoiceWithItems(invoice.id)
    if (!('error' in refreshed)) setInvoice(refreshed)
  }

  useEffect(() => {
    getInvoiceWithItems(invoiceId)
      .then(res => {
        if ('error' in res) { setError(res.error); return }
        setInvoice(res)
      })
      // HF6 (05/06): rejeição deixava "Carregando fatura..." preso
      .catch(() => setError('Falha ao carregar a fatura. Feche e tente novamente.'))
      .finally(() => setLoading(false))
  }, [invoiceId])

  // Carrega a prévia da taxa quando a cobertura é aplicada (juros incide só
  // sobre a coparticipação — sem cobertura, não há copart nem taxa).
  useEffect(() => {
    if (!insuranceSplit || !invoice?.consultation_id) { setCopayInterestPreview(null); return }
    let cancelled = false
    getConsultationCopayInterestPreview(invoice.consultation_id).then(res => {
      if (cancelled || 'error' in res) return
      setCopayInterestPreview(res.interest_full > 0 ? res : null)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceSplit, invoice?.consultation_id])

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

  const itemsSubtotal = invoice.items.reduce((sum, item) => {
    const raw = editingPrices[item.id]
    const price = raw !== undefined
      ? (parseFloat(raw.replace(',', '.')) || 0)
      : item.unit_price
    return sum + Math.max(0, price) * item.quantity
  }, 0)
  // Fallback: quando invoice_items está vazio ou zerado mas a invoice tem subtotal
  // (cenário comum em invoices legadas ou geradas antes do refator
  // consultation_services), usamos o subtotal/total da própria invoice.
  const invoiceSubtotalFallback = Number(invoice.subtotal ?? 0) > 0
    ? Number(invoice.subtotal)
    : Number(invoice.total_amount ?? 0) + Number(invoice.discount ?? 0)
  const dynamicSubtotal = itemsSubtotal > 0.005 ? itemsSubtotal : invoiceSubtotalFallback

  const discountValue = (() => {
    const raw = parseFloat(discountInput.replace(',', '.')) || 0
    if (discountType === 'percent') {
      return Math.min(dynamicSubtotal, (dynamicSubtotal * raw) / 100)
    }
    return Math.min(dynamicSubtotal, raw)
  })()

  const existingPaid     = invoice.paid_amount ?? 0
  const existingDiscount = invoice.discount    ?? 0
  const insuranceAlreadyApplied = existingDiscount > 0.01 && existingPaid > 0
  // Fix B2: com cobertura aplicada, o caixa cobra apenas a coparticipação
  // (charge_now). O repasse (A Receber Petlove) e a parcela que a Petlove
  // cobra no cartão do tutor saem do "Total a Pagar" agora — ficam como
  // pending petlove_open, baixado pela remessa fechada.
  const { totalDue } = computeCheckoutTotals({
    subtotal:         dynamicSubtotal,
    existingDiscount,
    existingPaid,
    manualDiscount:   discountValue,
    insuranceSplit,
  })

  async function openPaymentFlow() {
    if (!invoice) return
    setError(null)
    // Se tem ajuste de preços, persiste antes de abrir o pagamento (já mexe na fatura).
    if (Object.keys(editingPrices).length > 0) {
      // Usa o processPayment legado só para gravar overrides (com amount_received=0).
      // Aqui chamamos apenas para acertar item_prices; a baixa real será feita no
      // novo fluxo de split. Como o processPayment já cria entries paid, usamos
      // um caminho mais simples: chamamos a versão antiga só quando NÃO há split,
      // mas para ajuste de preços antes do split fica complexo. Solução simples:
      // delegamos a re-precificação para o servidor em uma chamada que aplica
      // apenas item_prices, e mantemos paid_amount em 0 (substitui o fluxo legado).
      const itemOverrides = Object.entries(editingPrices)
        .map(([id, raw]) => ({ id, unit_price: Math.max(0, parseFloat(raw.replace(',', '.')) || 0) }))
        .filter(o => {
          const orig = invoice.items.find(it => it.id === o.id)
          return orig && o.unit_price !== orig.unit_price
        })
      if (itemOverrides.length > 0) {
        // Re-precifica via processPayment com amount_received=0 (não baixa, só atualiza)
        const res = await processPayment(invoice.id, {
          payment_method:  'cash',
          discount:        discountValue,
          item_prices:     itemOverrides,
          amount_received: 0,
        })
        if ('error' in res) {
          setError(res.error)
          return
        }
        // Recarrega a fatura
        const refreshed = await getInvoiceWithItems(invoice.id)
        if (!('error' in refreshed)) setInvoice(refreshed)
        setEditingPrices({})
        // O desconto manual já foi persistido na invoice pelo processPayment
        // acima (vira existingDiscount no recálculo) — limpa o input para
        // não subtrair/enviar em dobro.
        setDiscountInput('')
      }
    }
    setShowPaymentModal(true)
  }

  async function handlePaymentConfirm(splits: PaymentSplit[], extras?: { copay_interest: number }) {
    if (!invoice) return
    setError(null)
    const res = await processSplitPayment(
      invoice.id,
      splits.map(s => ({
        amount:             s.amount,
        payment_method:     s.payment_method,
        payment_card_id:    s.payment_card_id,
        installments:       s.installments,
        card_acquirer:      s.card_acquirer,
        card_brand:         s.card_brand,
        card_nsu:           s.card_nsu,
        card_authorization: s.card_authorization,
        transaction_date:   s.transaction_date,
      })),
      {
        // Desconto manual digitado + desconto contábil do convênio — ambos
        // reduzem o total da invoice antes da baixa.
        discount: discountValue + (insuranceSplit?.clinic_discount ?? 0),
        ...(insuranceSplit ? {
          insurance_split: {
            receivable_amount: insuranceSplit.receivable + insuranceSplit.deferred_provider,
            receivable_source: 'petlove_open' as const,
            clinic_discount:   insuranceSplit.clinic_discount,
            procedure_pattern: insuranceSplit.procedure_pattern,
          },
        } : {}),
        // Épico A: taxa adm. líquida calculada no modal (cartão sobre copart)
        ...(extras && extras.copay_interest > 0 && copayInterestPreview ? {
          copay_interest: {
            total:   extras.copay_interest,
            percent: copayInterestPreview.percent,
            items:   copayInterestPreview.items.map(i => ({
              consultation_service_id: i.consultation_service_id,
              interest:                i.interest,
            })),
          },
        } : {}),
      }
    )
    if ('error' in res) { setError(res.error); throw new Error(res.error) }
    const totalReceived = splits.reduce((s, p) => s + p.amount, 0)
    setShowPaymentModal(false)

    // Pergunta de NFS-e: só quando a clínica emite nota e há consulta vinculada.
    if (invoice.consultation_id) {
      const emits = await clinicEmitsNfse()
      if (emits.emits) {
        setNfsePrompt({ consultationId: invoice.consultation_id, petName: invoice.patient.name, total: totalReceived })
        return // finaliza após a decisão do operador
      }
    }
    onSuccess(invoice.patient.name, totalReceived)
  }

  async function handleEmitNfse() {
    if (!nfsePrompt) return
    setEmittingNfse(true)
    setNfseResult(null)
    const res = await emitNfseForConsultation(nfsePrompt.consultationId)
    setEmittingNfse(false)
    if ('error' in res) { setNfseResult('Erro: ' + res.error); return }
    const { petName, total } = nfsePrompt
    setNfsePrompt(null)
    onSuccess(petName, total)
  }

  function handleSkipNfse() {
    if (!nfsePrompt) return
    const { petName, total } = nfsePrompt
    setNfsePrompt(null)
    onSuccess(petName, total)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[90vh]">

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
                {invoice.items.length === 0 && invoiceSubtotalFallback > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-white gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-blue-100 text-blue-700">
                        Consulta
                      </span>
                      <span className="text-sm text-slate-700 truncate">Serviços da consulta</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 px-2">
                      {fmt(invoiceSubtotalFallback)}
                    </span>
                  </div>
                )}
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
                        {/* Épico B — C1: item avulso adicionado nesta sessão pode ser removido */}
                        {addedItems[item.id] !== undefined && (
                          <button
                            onClick={() => handleRemoveAddedItem(item.id)}
                            className="rounded p-1 text-rose-400 hover:bg-rose-50"
                            title="Remover item avulso (devolve o estoque)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-500">Subtotal</span>
                  <span className="text-sm font-semibold text-slate-700">{fmt(dynamicSubtotal)}</span>
                </div>
              </div>

              {/* Épico B — C1 (04/06): adicionar item avulso ao recebimento
                  ("o tutor quer levar um petisco na saída"). Sempre particular. */}
              {(invoice.status === 'pending' || invoice.status === 'paid_partial') && (
                <div className="mt-2">
                  {!showAddItem ? (
                    <button
                      type="button"
                      onClick={() => setShowAddItem(true)}
                      data-mentor-step="cashier-add-item-btn"
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 hover:bg-teal-50 py-2 text-xs font-semibold text-teal-700"
                    >
                      <Plus className="h-3 w-3" /> Adicionar item avulso
                    </button>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={itemQuery}
                        onChange={e => handleItemQueryChange(e.target.value)}
                        placeholder="Buscar produto/serviço para adicionar..."
                        className="w-full pl-8 pr-8 py-2 rounded-xl border border-teal-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => { setShowAddItem(false); setItemQuery(''); setItemResults([]) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {(itemSearching || itemResults.length > 0) && itemQuery.trim().length >= 2 && (
                        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                          {itemSearching ? (
                            <div className="px-3 py-2.5 text-xs text-slate-400 flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                            </div>
                          ) : itemResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              disabled={addingItem}
                              onClick={() => handleAddItem(p)}
                              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-teal-50 transition-colors disabled:opacity-50"
                            >
                              <span className="text-sm text-slate-700 truncate">{p.name}</span>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0 ml-3">{fmt(p.unit_price)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(invoice.paid_amount ?? 0) > 0 && (
              <InvoiceDuplicatasList
                invoiceId={invoice.id}
                totalAmount={invoice.total_amount}
                paidAmount={invoice.paid_amount ?? 0}
              />
            )}

            <InsuranceExportPanel
              patientId={invoice.patient_id}
              consultationId={invoice.consultation_id}
              patientName={invoice.patient.name}
              tutorName={invoice.tutor.name}
              items={invoice.items}
            />

            {invoice.consultation_id && (
              <CheckoutInsurancePreviewClient
                consultationId={invoice.consultation_id}
                patientName={invoice.patient.name}
                tutorName={invoice.tutor.name}
                compact={operatorView}
                alreadyApplied={insuranceAlreadyApplied}
                onWaitingDetected={items => { setWaitingItems(items); setWaitingAck(false) }}
                onApplyInsurance={(split) => {
                  if (split) {
                    setInsuranceSplit({
                      charge_now:        split.charge_now,
                      receivable:        split.receivable,
                      deferred_provider: split.deferred_provider,
                      clinic_discount:   split.clinic_discount,
                      procedure_pattern: split.procedure_pattern,
                    })
                  } else {
                    setInsuranceSplit(null)
                  }
                }}
              />
            )}

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

            <div className="rounded-xl bg-slate-900 px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total a Pagar</span>
              <span className="text-xl font-bold text-white">{fmt(totalDue)}</span>
            </div>

            {insuranceSplit && (
              <div className="text-[11px] px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800">
                Cobertura Petlove pronta para aplicar · desconto contábil de <strong>{fmt(insuranceSplit.clinic_discount)}</strong> · repasse de <strong>{fmt(insuranceSplit.receivable)}</strong> ficará como A Receber.
              </div>
            )}

            <NfseTutorGate tutorId={invoice.tutor_id} />

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              {totalDue <= 0.005 ? (
                <button
                  onClick={() => setConfirmCourtesy(true)}
                  data-mentor-step="cashier-courtesy-btn"
                  title="Esta fatura está zerada — pode ser baixada como cortesia."
                  className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Gift className="h-4 w-4" /> Baixar como cortesia
                </button>
              ) : (
                <button
                  onClick={openPaymentFlow}
                  data-mentor-step="cashier-open-payment-modal-btn"
                  className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Receipt className="h-4 w-4" /> Receber
                </button>
              )}
            </div>
          </div>
        </div>

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
                    Esta consulta tem {waitingItems.length > 1 ? 'itens' : 'item'} ainda em carência no plano do tutor.
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

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => setWaitingAck(true)}
                  className="rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  Cobrar particular cheio (sem convênio)
                </button>
                <button
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Aguardar liberação · fechar caixa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <PaymentMethodModal
          totalDue={totalDue}
          subject={`${invoice.patient.name} · ${invoice.tutor.name}`}
          copayInterest={insuranceSplit && copayInterestPreview ? {
            copay_total:   copayInterestPreview.copay_total,
            interest_full: copayInterestPreview.interest_full,
            percent:       copayInterestPreview.percent,
          } : null}
          onCancel={() => setShowPaymentModal(false)}
          onConfirm={handlePaymentConfirm}
        />
      )}

      {confirmCourtesy && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => !submittingCourtesy && setConfirmCourtesy(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                <Gift className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirmar cortesia</h3>
                <p className="text-xs text-slate-500">Esta fatura está zerada</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              O atendimento de <strong>{invoice.patient.name}</strong> não tem valor a cobrar. Deseja baixar como <strong>cortesia</strong>?
              A fatura será marcada como liquidada e sai da fila do caixa.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmCourtesy(false)}
                disabled={submittingCourtesy}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCourtesy}
                disabled={submittingCourtesy}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingCourtesy ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando…</> : <>Sim, é cortesia</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pergunta de NFS-e pós-pagamento (Faturamento Fase 3) */}
      {nfsePrompt && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Emitir Nota Fiscal de Serviço?</h3>
                <p className="text-xs text-slate-500">Pagamento de {invoice.patient.name} recebido</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Deseja emitir a <strong>NFS-e</strong> deste atendimento agora? A nota será gerada com base nos
              serviços cobrados e enviada ao provedor (Focus NFe).
            </p>
            {nfseResult && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{nfseResult}</div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSkipNfse}
                disabled={emittingNfse}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Agora não
              </button>
              <button
                onClick={handleEmitNfse}
                disabled={emittingNfse}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {emittingNfse ? <><Loader2 className="h-4 w-4 animate-spin" /> Emitindo…</> : <>Emitir NFS-e</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
