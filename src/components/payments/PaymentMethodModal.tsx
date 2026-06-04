'use client'

import { useState } from 'react'
import {
  X, CreditCard, Banknote, Smartphone, Building2, Receipt, Plus, Trash2, Check, Loader2, AlertCircle, Percent,
} from 'lucide-react'
import CardSelectionModal, { type CardPaymentResult } from './CardSelectionModal'
import { proportionalCardInterest } from '@/lib/copay-interest'

export type PaymentMethodKey = 'pix' | 'credit' | 'debit' | 'cash' | 'voucher' | 'convenio' | 'transfer' | 'other'

export interface PaymentSplit {
  id:                  string
  amount:              number
  payment_method:      PaymentMethodKey
  payment_card_id:     string | null
  installments:        number
  card_acquirer:       string | null
  card_brand:          string | null
  card_nsu:            string | null
  card_authorization:  string | null
  transaction_date:    string | null
  label:               string
}

interface MethodOption {
  key:   PaymentMethodKey
  label: string
  icon:  React.ComponentType<{ className?: string }>
  color: string
}

const METHOD_OPTIONS: MethodOption[] = [
  { key: 'pix',      label: 'PIX',            icon: Smartphone,  color: 'emerald' },
  { key: 'credit',   label: 'Cartão Crédito', icon: CreditCard,  color: 'indigo'  },
  { key: 'debit',    label: 'Cartão Débito',  icon: CreditCard,  color: 'cyan'    },
  { key: 'cash',     label: 'Dinheiro',       icon: Banknote,    color: 'amber'   },
  { key: 'transfer', label: 'Transferência',  icon: Building2,   color: 'sky'     },
  { key: 'voucher',  label: 'Vale',           icon: Receipt,     color: 'slate'   },
]

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  /** Valor total a receber. */
  totalDue:   number
  /** Texto identificador (ex.: nome do pet). */
  subject?:   string
  /** Bloqueia múltiplos splits (caso queira força um único método). */
  disableSplit?: boolean
  /**
   * Épico A (04/06): taxa adm. sobre a coparticipação Petlove quando paga no
   * cartão. Presente apenas quando a cobertura foi aplicada e há % cadastrado
   * no serviço. Dinheiro/PIX nunca cobram; split misto é proporcional (Q1).
   */
  copayInterest?: {
    copay_total:   number
    interest_full: number
    percent:       number
  } | null
  onCancel:   () => void
  onConfirm:  (splits: PaymentSplit[], extras?: { copay_interest: number }) => Promise<void> | void
}

export default function PaymentMethodModal({ totalDue, subject, disableSplit, copayInterest, onCancel, onConfirm }: Props) {
  const [splits,        setSplits]        = useState<PaymentSplit[]>([])
  const [pendingMethod, setPendingMethod] = useState<PaymentMethodKey | null>(null)
  const [pendingAmount, setPendingAmount] = useState<string>('')
  const [showCardModal, setShowCardModal] = useState<'credit'|'debit'|null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [submitting,    setSubmitting]    = useState(false)
  // Desconto sobre a taxa adm. (pedido explícito ~30:48: "exibir o valor, o
  // valor de juros e o campo de desconto após informar a forma de pagamento")
  const [interestDiscount, setInterestDiscount] = useState<string>('')

  const totalSplit = splits.reduce((s, p) => s + p.amount, 0)
  const remaining  = Math.max(0, totalDue - totalSplit)

  // ── Taxa adm. sobre coparticipação (só quando há split de CARTÃO) ─────────
  const hasInterestConfig = !!copayInterest && copayInterest.interest_full > 0
  const cardSplits   = splits.filter(s => s.payment_method === 'credit' || s.payment_method === 'debit')
  const cardBase     = cardSplits.reduce((s, p) => s + p.amount, 0)
  const grossInterest = hasInterestConfig
    ? proportionalCardInterest(copayInterest!.interest_full, totalDue, cardBase)
    : 0
  const interestDiscountValue = Math.min(grossInterest, Math.max(0, parseFloat(interestDiscount.replace(',', '.')) || 0))
  const netInterest = Math.round((grossInterest - interestDiscountValue) * 100) / 100

  function startAddingMethod(method: PaymentMethodKey) {
    setError(null)
    if (remaining <= 0.005) {
      setError('Total já alcançado. Remova um pagamento para alterar.')
      return
    }
    setPendingMethod(method)
    setPendingAmount(remaining.toFixed(2).replace('.', ','))
    // Para cartão crédito/débito, o próprio CardSelectionModal coleta valor,
    // NSU, liberação, data e parcelas — abrimos direto.
    if (method === 'credit' || method === 'debit') {
      setShowCardModal(method)
    }
  }

  function addNonCardSplit() {
    if (!pendingMethod) return
    const parsed = parseFloat(pendingAmount.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Informe um valor válido para esta forma.')
      return
    }
    const clipped = Math.min(parsed, remaining + (splits.find(p => p.payment_method === pendingMethod)?.amount ?? 0))
    if (clipped <= 0) { setError('Sem saldo restante.'); return }

    const label = METHOD_OPTIONS.find(o => o.key === pendingMethod)?.label ?? pendingMethod
    const split: PaymentSplit = {
      id:                 crypto.randomUUID(),
      amount:             Math.min(parsed, remaining),
      payment_method:     pendingMethod,
      payment_card_id:    null,
      installments:       1,
      card_acquirer:      null,
      card_brand:         null,
      card_nsu:           null,
      card_authorization: null,
      transaction_date:   null,
      label,
    }
    setSplits(prev => [...prev, split])
    setPendingMethod(null)
    setPendingAmount('')
    setError(null)
  }

  function handleCardConfirm(result: CardPaymentResult) {
    if (!showCardModal) return
    const amountToCharge = Math.min(result.amount, remaining)
    if (amountToCharge <= 0) {
      setShowCardModal(null)
      setPendingMethod(null)
      setError('Sem saldo restante.')
      return
    }
    const label = `${METHOD_OPTIONS.find(o => o.key === showCardModal)?.label} · ${result.card.label}${result.installments > 1 ? ` · ${result.installments}x` : ''}`
    const split: PaymentSplit = {
      id:                 crypto.randomUUID(),
      amount:             amountToCharge,
      payment_method:     showCardModal,
      payment_card_id:    result.card.id,
      installments:       result.installments,
      card_acquirer:      result.card_acquirer,
      card_brand:         result.card_brand,
      card_nsu:           result.card_nsu,
      card_authorization: result.card_authorization,
      transaction_date:   result.transaction_date,
      label,
    }
    setSplits(prev => [...prev, split])
    setShowCardModal(null)
    setPendingMethod(null)
    setPendingAmount('')
    setError(null)
  }

  function removeSplit(id: string) {
    setSplits(prev => prev.filter(s => s.id !== id))
  }

  async function handleConfirm() {
    setError(null)
    if (splits.length === 0) { setError('Adicione ao menos um pagamento.'); return }
    if (totalSplit < totalDue - 0.005) {
      setError(`Saldo restante de ${fmt(remaining)} — adicione outro pagamento ou ajuste o total.`)
      return
    }

    // Épico A: infla os splits de cartão com a taxa adm. líquida — o valor
    // cobrado na maquininha é base + taxa. Último cartão absorve arredondamento.
    let finalSplits = splits
    if (netInterest > 0 && cardSplits.length > 0 && cardBase > 0) {
      let allocated = 0
      const lastCardId = cardSplits[cardSplits.length - 1].id
      finalSplits = splits.map(s => {
        if (s.payment_method !== 'credit' && s.payment_method !== 'debit') return s
        const share = s.id === lastCardId
          ? Math.round((netInterest - allocated) * 100) / 100
          : Math.round(netInterest * (s.amount / cardBase) * 100) / 100
        allocated = Math.round((allocated + share) * 100) / 100
        return { ...s, amount: Math.round((s.amount + share) * 100) / 100 }
      })
    }

    setSubmitting(true)
    try {
      await onConfirm(finalSplits, netInterest > 0 ? { copay_interest: netInterest } : undefined)
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Falha ao processar.')
    }
  }

  const allowAddMore = !disableSplit || splits.length === 0

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-3 overflow-y-auto"
        onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      >
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">

          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-teal-50/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Receber Pagamento</h2>
                <p className="text-[11px] text-slate-500">
                  {subject ?? 'Pagamento'} · escolha a forma{disableSplit ? '' : ' (pode dividir em várias)'}
                </p>
              </div>
            </div>
            <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-900 text-white px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-300 font-semibold">Total a receber</p>
                <p className="text-xl font-bold tabular-nums">{fmt(totalDue)}</p>
              </div>
              <div className={`rounded-xl px-4 py-3 ${remaining < 0.01 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                <p className="text-[10px] uppercase tracking-wide font-semibold">{remaining < 0.01 ? 'Quitado' : 'Restante'}</p>
                <p className="text-xl font-bold tabular-nums">{fmt(remaining)}</p>
              </div>
            </div>

            {splits.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pagamentos aplicados</p>
                {splits.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 bg-white">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.label}</p>
                      {s.card_nsu && (
                        <p className="text-[10px] text-slate-400 font-mono truncate">NSU {s.card_nsu}{s.card_authorization ? ` · Lib ${s.card_authorization}` : ''}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt(s.amount)}</p>
                    <button
                      type="button"
                      onClick={() => removeSplit(s.id)}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                      title="Remover este pagamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {pendingMethod && pendingMethod !== 'credit' && pendingMethod !== 'debit' && (
              <div className="rounded-xl border-2 border-teal-400 bg-teal-50/40 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    {METHOD_OPTIONS.find(m => m.key === pendingMethod)?.label}
                  </p>
                  <button onClick={() => { setPendingMethod(null); setPendingAmount('') }} className="text-xs text-slate-500 hover:underline">
                    Cancelar
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500 font-semibold">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={pendingAmount}
                    onChange={e => setPendingAmount(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold tabular-nums focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={addNonCardSplit}
                    className="rounded-lg bg-teal-600 hover:bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )}

            {allowAddMore && remaining > 0.005 && !pendingMethod && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  {splits.length === 0 ? 'Escolha a forma de pagamento' : 'Adicionar mais um pagamento'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {METHOD_OPTIONS.map(o => {
                    const Icon = o.icon
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => startAddingMethod(o.key)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:border-teal-400 hover:bg-teal-50 transition-all"
                      >
                        <Icon className="h-5 w-5" />
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Épico A (04/06): taxa adm. sobre coparticipação — cálculo
                transparente para o operador conferir de cabeça */}
            {hasInterestConfig && cardSplits.length === 0 && remaining > 0.005 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-[11px] text-indigo-800 flex items-start gap-2">
                <Percent className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Pagamento no <strong>cartão</strong> adiciona a Taxa Adm Cartão ({copayInterest!.percent}%)
                  sobre a coparticipação: até <strong>{fmt(copayInterest!.interest_full)}</strong>.
                  Dinheiro/PIX não cobram taxa.
                </span>
              </div>
            )}

            {hasInterestConfig && grossInterest > 0 && (
              <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50/60 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-indigo-900 tabular-nums">
                  Coparticipação Petlove: {fmt(copayInterest!.copay_total)}
                  {' '}<span className="text-indigo-700">(+ {fmt(grossInterest)} Taxa Adm Cartão ({copayInterest!.percent}%))</span>
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 flex-shrink-0">Desconto na taxa (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={interestDiscount}
                    onChange={e => setInterestDiscount(e.target.value)}
                    placeholder="0,00"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:border-indigo-500"
                  />
                  {interestDiscountValue > 0 && (
                    <span className="text-[11px] text-emerald-700 font-semibold">− {fmt(interestDiscountValue)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-indigo-200 pt-2">
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Total final (com taxa)</span>
                  <span className="text-lg font-bold text-indigo-900 tabular-nums">{fmt(totalDue + netInterest)}</span>
                </div>
                <p className="text-[10px] text-indigo-600">
                  A taxa é somada apenas ao valor passado no cartão{cardSplits.length > 1 ? ' (proporcional entre os cartões)' : ''}. O repasse Petlove não muda.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || splits.length === 0 || remaining > 0.005}
              className="flex-[2] rounded-xl bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                : <><Check className="h-4 w-4" /> Confirmar Recebimento</>}
            </button>
          </div>
        </div>
      </div>

      {showCardModal && (
        <CardSelectionModal
          paymentMethod={showCardModal}
          maxAmount={remaining}
          suggestedAmount={Math.min(parseFloat(pendingAmount.replace(',', '.')) || remaining, remaining)}
          onCancel={() => { setShowCardModal(null); setPendingMethod(null) }}
          onConfirm={handleCardConfirm}
        />
      )}
    </>
  )
}
