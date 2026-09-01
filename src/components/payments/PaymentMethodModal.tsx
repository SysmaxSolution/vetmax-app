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
  /** Valor COBRADO nesta forma (cartão: já inclui a taxa adm., se houver). */
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
  /**
   * Taxa adm. sobre coparticipação embutida no amount (Épico A). 0 para
   * formas sem taxa. Uso interno do modal — o parent recebe o total via
   * extras.copay_interest.
   */
  interest_included?:  number
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
  /** Crédito/adiantamento disponível do tutor (Sprint Animais 1.6). Exibido no topo. */
  creditBalance?: number
  /** Permite lançar a sobra como crédito do tutor (só onde há tutor vinculado). */
  allowCredit?: boolean
  onCancel:   () => void
  onConfirm:  (splits: PaymentSplit[], extras?: { copay_interest?: number; overpayment?: { amount: number; as: 'change' | 'credit' } }) => Promise<void> | void
}

export default function PaymentMethodModal({ totalDue, subject, disableSplit, copayInterest, creditBalance, allowCredit, onCancel, onConfirm }: Props) {
  const [splits,        setSplits]        = useState<PaymentSplit[]>([])
  const [pendingMethod, setPendingMethod] = useState<PaymentMethodKey | null>(null)
  const [pendingAmount, setPendingAmount] = useState<string>('')
  const [showCardModal, setShowCardModal] = useState<'credit'|'debit'|null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [submitting,    setSubmitting]    = useState(false)
  // Sprint Animais 1.6: sobra de dinheiro (pagou a mais) → troco OU crédito.
  const [overpaid,      setOverpaid]      = useState(0)
  const [changeChoice,  setChangeChoice]  = useState<'change' | 'credit'>('change')
  // Desconto sobre a taxa adm. — informado ANTES de passar o cartão (~30:48)
  const [interestDiscount, setInterestDiscount] = useState<string>('')

  // Cada split de cartão guarda a taxa embutida; o saldo é controlado pela
  // BASE (amount − taxa), nunca pelo valor cobrado.
  const baseOf      = (s: PaymentSplit) => s.amount - (s.interest_included ?? 0)
  const totalBase   = splits.reduce((s, p) => s + baseOf(p), 0)
  const remaining   = Math.max(0, Math.round((totalDue - totalBase) * 100) / 100)
  const totalInterest = Math.round(splits.reduce((s, p) => s + (p.interest_included ?? 0), 0) * 100) / 100
  const totalCharged  = Math.round(splits.reduce((s, p) => s + p.amount, 0) * 100) / 100

  const hasInterestConfig = !!copayInterest && copayInterest.interest_full > 0

  // ── Plano do cartão (HF 05/06): a taxa aparece AO SELECIONAR o cartão,
  //    ANTES de passar na maquininha — o operador já cobra o valor certo. ──
  const planGross = hasInterestConfig
    ? proportionalCardInterest(copayInterest!.interest_full, totalDue, remaining)
    : 0
  const planDiscount = Math.min(planGross, Math.max(0, parseFloat(interestDiscount.replace(',', '.')) || 0))
  const planNet      = Math.round((planGross - planDiscount) * 100) / 100
  const planCharge   = Math.round((remaining + planNet) * 100) / 100
  /** Pré-painel de taxa visível (método cartão escolhido + taxa configurada). */
  const showCardPlan = (pendingMethod === 'credit' || pendingMethod === 'debit') && hasInterestConfig && !showCardModal

  function startAddingMethod(method: PaymentMethodKey) {
    setError(null)
    if (remaining <= 0.005) {
      setError('Total já alcançado. Remova um pagamento para alterar.')
      return
    }
    setPendingMethod(method)
    setPendingAmount(remaining.toFixed(2).replace('.', ','))
    if (method === 'credit' || method === 'debit') {
      // Com taxa configurada, mostra o plano (taxa + desconto + total a
      // passar) ANTES de abrir o cartão. Sem taxa, abre direto.
      if (hasInterestConfig) {
        setInterestDiscount('')
        return
      }
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

    // Dinheiro recebido a mais → sobra (troco ou crédito). Só p/ dinheiro.
    if (pendingMethod === 'cash' && parsed > remaining + 0.005) {
      setOverpaid(Math.round((parsed - remaining) * 100) / 100)
      setChangeChoice('change')
    }

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

    // Com taxa: o valor cobrado na maquininha = base + taxa. Se o operador
    // alterou o valor no modal do cartão (pagamento parcial), a taxa é
    // recalculada proporcionalmente (Q1).
    let amountCharged: number
    let interestIncluded = 0
    if (hasInterestConfig && planCharge > 0) {
      amountCharged = Math.min(result.amount, planCharge)
      if (Math.abs(amountCharged - planCharge) < 0.01) {
        interestIncluded = planNet
      } else {
        const ratio = amountCharged / planCharge
        const base  = Math.round(remaining * ratio * 100) / 100
        interestIncluded = Math.round((amountCharged - base) * 100) / 100
      }
    } else {
      amountCharged = Math.min(result.amount, remaining)
    }
    if (amountCharged <= 0) {
      setShowCardModal(null)
      setPendingMethod(null)
      setError('Sem saldo restante.')
      return
    }

    const label = `${METHOD_OPTIONS.find(o => o.key === showCardModal)?.label} · ${result.card.label}${result.installments > 1 ? ` · ${result.installments}x` : ''}`
    const split: PaymentSplit = {
      id:                 crypto.randomUUID(),
      amount:             amountCharged,
      payment_method:     showCardModal,
      payment_card_id:    result.card.id,
      installments:       result.installments,
      card_acquirer:      result.card_acquirer,
      card_brand:         result.card_brand,
      card_nsu:           result.card_nsu,
      card_authorization: result.card_authorization,
      transaction_date:   result.transaction_date,
      label,
      interest_included:  interestIncluded,
    }
    setSplits(prev => [...prev, split])
    setShowCardModal(null)
    setPendingMethod(null)
    setPendingAmount('')
    setInterestDiscount('')
    setError(null)
  }

  function removeSplit(id: string) {
    setSplits(prev => prev.filter(s => s.id !== id))
    setOverpaid(0)   // sobra depende dos pagamentos; recalcula ao refazer
  }

  async function handleConfirm() {
    setError(null)
    if (splits.length === 0) { setError('Adicione ao menos um pagamento.'); return }
    if (totalBase < totalDue - 0.005) {
      setError(`Saldo restante de ${fmt(remaining)} — adicione outro pagamento ou ajuste o total.`)
      return
    }

    // HF 05/06: a taxa já foi embutida no valor do cartão NO MOMENTO da
    // seleção (o operador passou o valor certo na maquininha) — nada a
    // inflar aqui; só repassamos o total da taxa para o servidor.
    setSubmitting(true)
    try {
      const extras: { copay_interest?: number; overpayment?: { amount: number; as: 'change' | 'credit' } } = {}
      if (totalInterest > 0) extras.copay_interest = totalInterest
      if (overpaid > 0.005) extras.overpayment = { amount: overpaid, as: changeChoice }
      await onConfirm(splits, Object.keys(extras).length ? extras : undefined)
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

            {/* Crédito/adiantamento do tutor (Sprint Animais 1.6) */}
            {creditBalance != null && creditBalance > 0.005 && (
              <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                <span className="text-lg">💳</span>
                <span>Este tutor possui <strong>{fmt(creditBalance)}</strong> de crédito/adiantamento disponível.</span>
              </div>
            )}

            {/* Sobra (pagou a mais em dinheiro) → troco ou crédito */}
            {overpaid > 0.005 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
                <p className="text-sm text-slate-700 mb-2">Recebido a mais: <strong className="text-indigo-700">{fmt(overpaid)}</strong> — o que fazer com a sobra?</p>
                {allowCredit ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setChangeChoice('change')}
                      className={`rounded-lg border-2 py-2 text-xs font-semibold transition-all ${changeChoice === 'change' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                      Dar troco ({fmt(overpaid)})
                    </button>
                    <button type="button" onClick={() => setChangeChoice('credit')}
                      className={`rounded-lg border-2 py-2 text-xs font-semibold transition-all ${changeChoice === 'credit' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                      Lançar como crédito
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 font-semibold">Troco a devolver: {fmt(overpaid)}</p>
                )}
              </div>
            )}

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
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt(s.amount)}</p>
                      {(s.interest_included ?? 0) > 0 && (
                        <p className="text-[10px] text-indigo-600 tabular-nums">inclui {fmt(s.interest_included!)} de taxa</p>
                      )}
                    </div>
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

            {/* HF 05/06: plano da Taxa Adm Cartão — aparece AO SELECIONAR o
                cartão, ANTES de passar na maquininha. O operador vê o valor
                exato a cobrar (base + taxa − desconto) e só então escolhe o
                cartão. */}
            {showCardPlan && (
              <div className="rounded-xl border-2 border-indigo-400 bg-indigo-50/60 px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-indigo-900">
                    {METHOD_OPTIONS.find(m => m.key === pendingMethod)?.label} — confira antes de passar
                  </p>
                  <button
                    onClick={() => { setPendingMethod(null); setInterestDiscount('') }}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-sm font-semibold text-indigo-900 tabular-nums">
                  Coparticipação Petlove: {fmt(remaining)}
                  {' '}<span className="text-indigo-700">(+ {fmt(planGross)} Taxa Adm Cartão ({copayInterest!.percent}%))</span>
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 flex-shrink-0">Desconto na taxa (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={interestDiscount}
                    onChange={e => setInterestDiscount(e.target.value)}
                    placeholder="0,00"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:border-indigo-500"
                  />
                  {planDiscount > 0 && (
                    <span className="text-[11px] text-emerald-700 font-semibold">− {fmt(planDiscount)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg bg-indigo-600 px-3 py-2.5">
                  <span className="text-xs font-bold text-white uppercase tracking-wide">Passar na maquininha</span>
                  <span className="text-xl font-bold text-white tabular-nums">{fmt(planCharge)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCardModal(pendingMethod as 'credit' | 'debit')}
                  data-mentor-step="payment-card-plan-continue-btn"
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" /> Selecionar cartão e cobrar {fmt(planCharge)}
                </button>
                <p className="text-[10px] text-indigo-600">
                  A taxa incide só sobre a coparticipação paga no cartão. O repasse Petlove não muda.
                </p>
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

            {/* Aviso antecipado: existe taxa configurada e nenhum cartão usado */}
            {hasInterestConfig && totalInterest === 0 && remaining > 0.005 && !showCardPlan && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-[11px] text-indigo-800 flex items-start gap-2">
                <Percent className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Pagamento no <strong>cartão</strong> adiciona a Taxa Adm Cartão ({copayInterest!.percent}%)
                  sobre a coparticipação: até <strong>{fmt(copayInterest!.interest_full)}</strong>.
                  Dinheiro/PIX não cobram taxa.
                </span>
              </div>
            )}

            {/* Resumo informativo após o cartão lançado (taxa já embutida) */}
            {totalInterest > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-indigo-800">
                  <span>Taxa Adm Cartão incluída nos pagamentos</span>
                  <span className="font-bold tabular-nums">{fmt(totalInterest)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-indigo-200 pt-1.5">
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Total final cobrado</span>
                  <span className="text-lg font-bold text-indigo-900 tabular-nums">{fmt(totalCharged)}</span>
                </div>
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
          // HF 05/06: com taxa configurada, o valor sugerido/máximo é o TOTAL
          // a passar na maquininha (base + taxa − desconto) definido no plano.
          maxAmount={hasInterestConfig ? planCharge : remaining}
          suggestedAmount={hasInterestConfig
            ? planCharge
            : Math.min(parseFloat(pendingAmount.replace(',', '.')) || remaining, remaining)}
          onCancel={() => { setShowCardModal(null); setPendingMethod(null) }}
          onConfirm={handleCardConfirm}
        />
      )}
    </>
  )
}
