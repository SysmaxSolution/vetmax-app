'use client'

import { useState } from 'react'
import {
  X, CreditCard, Banknote, Smartphone, Building2, Receipt, Plus, Trash2, Check, Loader2, AlertCircle,
} from 'lucide-react'
import CardSelectionModal, { type CardPaymentResult } from './CardSelectionModal'

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
  onCancel:   () => void
  onConfirm:  (splits: PaymentSplit[]) => Promise<void> | void
}

export default function PaymentMethodModal({ totalDue, subject, disableSplit, onCancel, onConfirm }: Props) {
  const [splits,        setSplits]        = useState<PaymentSplit[]>([])
  const [pendingMethod, setPendingMethod] = useState<PaymentMethodKey | null>(null)
  const [pendingAmount, setPendingAmount] = useState<string>('')
  const [showCardModal, setShowCardModal] = useState<'credit'|'debit'|null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [submitting,    setSubmitting]    = useState(false)

  const totalSplit = splits.reduce((s, p) => s + p.amount, 0)
  const remaining  = Math.max(0, totalDue - totalSplit)

  function startAddingMethod(method: PaymentMethodKey) {
    setError(null)
    if (remaining <= 0.005) {
      setError('Total já alcançado. Remova um pagamento para alterar.')
      return
    }
    setPendingMethod(method)
    setPendingAmount(remaining.toFixed(2).replace('.', ','))
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
      label,
    }
    setSplits(prev => [...prev, split])
    setPendingMethod(null)
    setPendingAmount('')
    setError(null)
  }

  function handleCardConfirm(result: CardPaymentResult) {
    if (!pendingMethod || !showCardModal) return
    const parsed = parseFloat(pendingAmount.replace(',', '.'))
    const amountToCharge = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, remaining) : remaining
    if (amountToCharge <= 0) {
      setShowCardModal(null)
      setPendingMethod(null)
      setError('Sem saldo restante.')
      return
    }
    const label = `${METHOD_OPTIONS.find(o => o.key === showCardModal)?.label} · ${result.card?.label ?? result.card_acquirer}${result.installments > 1 ? ` · ${result.installments}x` : ''}`
    const split: PaymentSplit = {
      id:                 crypto.randomUUID(),
      amount:             amountToCharge,
      payment_method:     showCardModal,
      payment_card_id:    result.card?.id ?? null,
      installments:       result.installments,
      card_acquirer:      result.card_acquirer,
      card_brand:         result.card_brand,
      card_nsu:           result.card_nsu,
      card_authorization: result.card_authorization,
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
    setSubmitting(true)
    try {
      await onConfirm(splits)
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
          amount={Math.min(parseFloat(pendingAmount.replace(',', '.')) || remaining, remaining)}
          onCancel={() => { setShowCardModal(null); setPendingMethod(null) }}
          onConfirm={handleCardConfirm}
        />
      )}
    </>
  )
}
