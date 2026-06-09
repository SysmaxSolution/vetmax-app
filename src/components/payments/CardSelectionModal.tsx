'use client'

import { useEffect, useState } from 'react'
import { CreditCard, X, Check, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import {
  listPaymentCards,
  type PaymentCard,
} from '@/lib/actions/payment-cards'

export interface CardPaymentResult {
  card:               PaymentCard
  amount:             number
  installments:       number
  card_acquirer:      string
  card_brand:         string | null
  card_nsu:           string
  card_authorization: string
  transaction_date:   string
}

interface Props {
  paymentMethod:     'credit' | 'debit'
  /** Saldo máximo permitido para este split (default = saldo restante). */
  maxAmount:         number
  /** Valor sugerido inicial. */
  suggestedAmount:   number
  onCancel:          () => void
  onConfirm:         (result: CardPaymentResult) => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CardSelectionModal({
  paymentMethod, maxAmount, suggestedAmount, onCancel, onConfirm,
}: Props) {
  const [cards,         setCards]         = useState<PaymentCard[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selectedCard,  setSelectedCard]  = useState<PaymentCard | null>(null)
  const [amount,        setAmount]        = useState(suggestedAmount.toFixed(2).replace('.', ','))
  const [installments,  setInstallments]  = useState(1)
  const [nsu,           setNsu]           = useState('')
  const [authorization, setAuthorization] = useState('')
  const [txnDate,       setTxnDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await listPaymentCards({ card_type: paymentMethod, only_active: true })
      setLoading(false)
      if ('error' in res) { setError(res.error); return }
      setCards(res)
      if (res.length === 1) setSelectedCard(res[0])
    }
    void load()
  }, [paymentMethod])

  function handleConfirm() {
    setError(null)
    if (!selectedCard) { setError('Selecione um cartão.'); return }

    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Informe um valor válido.')
      return
    }
    if (parsedAmount > maxAmount + 0.005) {
      setError(`Valor não pode exceder o saldo restante (${fmt(maxAmount)}).`)
      return
    }

    if (selectedCard.requires_nsu) {
      if (!nsu.trim())           { setError('Informe o NSU.'); return }
      if (!authorization.trim()) { setError('Informe o número de liberação.'); return }
    }
    if (!txnDate)              { setError('Informe a data da transação.'); return }
    if (txnDate > new Date().toISOString().slice(0, 10)) {
      setError('Data da transação não pode ser futura.')
      return
    }

    if (paymentMethod === 'credit' && installments > selectedCard.max_installments) {
      setError(`Este cartão aceita no máximo ${selectedCard.max_installments}x.`)
      return
    }

    onConfirm({
      card:               selectedCard,
      amount:             parsedAmount,
      installments,
      card_acquirer:      selectedCard.acquirer || selectedCard.label,
      card_brand:         selectedCard.brand,
      card_nsu:           nsu.trim(),
      card_authorization: authorization.trim(),
      transaction_date:   txnDate,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/65 p-3 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-4">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Cartão {paymentMethod === 'credit' ? 'de Crédito' : 'de Débito'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Saldo restante {fmt(maxAmount)} · informe os dados da transação
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando cartões...
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 text-center">
              <p className="text-sm font-semibold text-amber-900">
                Nenhum cartão {paymentMethod === 'credit' ? 'de crédito' : 'de débito'} cadastrado
              </p>
              <p className="text-xs text-amber-800">
                Cadastre as maquininhas/cartões em Financeiro &gt; Cadastros &gt; Cartões antes de receber
                pagamentos por cartão.
              </p>
              <Link
                href="/dashboard/financial?tab=cadastros&sub=cartoes"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 px-4 py-2 text-xs font-semibold text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir cadastro de cartões
              </Link>
            </div>
          ) : (
            <>
              {/* Cartão */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Cartão <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedCard?.id ?? ''}
                  onChange={e => {
                    const c = cards.find(x => x.id === e.target.value)
                    if (c) {
                      setSelectedCard(c)
                      // Reset parcelas se o novo cartão tiver menos max_installments
                      setInstallments(prev => Math.min(prev, c.max_installments))
                    } else {
                      setSelectedCard(null)
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Selecione um cartão...</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {c.acquirer ? ` · ${c.acquirer}` : ''}
                      {c.brand ? ` · ${c.brand}` : ''}
                      {` · Taxa ${c.fee_percent}% · D+${c.settlement_days}`}
                    </option>
                  ))}
                </select>
                {selectedCard && (
                  <p className="mt-1.5 text-[11px] text-indigo-700">
                    Aceita até <strong>{selectedCard.max_installments}x</strong> · repasse em <strong>D+{selectedCard.settlement_days}</strong> · taxa <strong>{selectedCard.fee_percent}%</strong>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Valor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Valor <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-500 font-semibold">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder={maxAmount.toFixed(2).replace('.', ',')}
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmount(maxAmount.toFixed(2).replace('.', ','))}
                    className="mt-1 text-[10px] text-indigo-600 hover:underline"
                  >
                    Usar saldo restante
                  </button>
                </div>

                {/* Data da Transação */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Data da Transação <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={e => setTxnDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Parcelas (apenas crédito) */}
              {paymentMethod === 'credit' && selectedCard && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Quantidade de Parcelas
                  </label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {Array.from({ length: selectedCard.max_installments }, (_, i) => i + 1).map(n => {
                      const parsedAmount = parseFloat(amount.replace(',', '.')) || 0
                      return (
                        <option key={n} value={n}>
                          {n}x
                          {n > 1 && parsedAmount > 0
                            ? ` de ${fmt(parsedAmount / n)}`
                            : parsedAmount > 0 ? ' à vista' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* NSU + Liberação — obrigatórios apenas quando credit_cards.requires_nsu=true */}
              {selectedCard && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      NSU {selectedCard.requires_nsu
                        ? <span className="text-rose-500">*</span>
                        : <span className="text-slate-400 font-normal">(opcional)</span>}
                    </label>
                    <input
                      value={nsu}
                      onChange={e => setNsu(e.target.value.replace(/\s/g, ''))}
                      placeholder={selectedCard.requires_nsu ? 'Ex: 123456789 ou A1B2C3' : 'Opcional'}
                      inputMode="text"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Número de Liberação {selectedCard.requires_nsu
                        ? <span className="text-rose-500">*</span>
                        : <span className="text-slate-400 font-normal">(opcional)</span>}
                    </label>
                    <input
                      value={authorization}
                      onChange={e => setAuthorization(e.target.value.replace(/\s/g, ''))}
                      placeholder={selectedCard.requires_nsu ? 'Ex: 987654 ou AB1234' : 'Opcional'}
                      inputMode="text"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              )}

              <Link
                href="/dashboard/financial?tab=cadastros&sub=cartoes"
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Gerenciar cartões cadastrados
              </Link>
            </>
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
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={cards.length === 0 || !selectedCard}
            className="flex-[2] rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" /> Confirmar Cartão
          </button>
        </div>
      </div>
    </div>
  )
}
