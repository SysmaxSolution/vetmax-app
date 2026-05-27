'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Plus, X, Check, Loader2 } from 'lucide-react'
import {
  listPaymentCards,
  createPaymentCard,
  type PaymentCard,
  type CardType,
} from '@/lib/actions/payment-cards'

export interface CardPaymentResult {
  card:           PaymentCard | null
  installments:   number
  card_acquirer:  string
  card_brand:     string | null
  card_nsu:       string
  card_authorization: string
}

interface Props {
  /** Limita os cartões exibidos. 'credit' mostra apenas credito; 'debit' apenas debito. */
  paymentMethod: 'credit' | 'debit'
  amount:        number
  onCancel:      () => void
  onConfirm:     (result: CardPaymentResult) => void
}

const COMMON_ACQUIRERS = ['Cielo', 'Stone', 'Rede', 'GetNet', 'PagSeguro', 'SafraPay', 'Mercado Pago']
const COMMON_BRANDS    = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'Amex']

export default function CardSelectionModal({ paymentMethod, amount, onCancel, onConfirm }: Props) {
  const [cards,          setCards]          = useState<PaymentCard[]>([])
  const [loading,        setLoading]        = useState(true)
  const [selectedCard,   setSelectedCard]   = useState<PaymentCard | null>(null)
  const [installments,   setInstallments]   = useState(1)
  const [nsu,            setNsu]            = useState('')
  const [authorization,  setAuthorization]  = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const [showRegister,   setShowRegister]   = useState(false)
  const [submitting,     setSubmitting]     = useState(false)

  // Form: novo cartão
  const [newLabel,    setNewLabel]    = useState('')
  const [newAcquirer, setNewAcquirer] = useState('')
  const [newBrand,    setNewBrand]    = useState('')
  const [newFee,      setNewFee]      = useState('0')
  const [newDays,     setNewDays]     = useState('1')
  const [newMaxInst,  setNewMaxInst]  = useState(paymentMethod === 'credit' ? '12' : '1')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await listPaymentCards({ card_type: paymentMethod, only_active: true })
      setLoading(false)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setCards(res)
      if (res.length === 0) setShowRegister(true)
      else setSelectedCard(res[0])
    }
    void load()
  }, [paymentMethod])

  async function handleRegister() {
    setError(null)
    if (!newLabel.trim() || !newAcquirer.trim()) {
      setError('Apelido e administradora são obrigatórios.')
      return
    }
    setSubmitting(true)
    const res = await createPaymentCard({
      label:            newLabel,
      acquirer:         newAcquirer,
      card_type:        paymentMethod as CardType,
      brand:            newBrand || null,
      fee_percent:      parseFloat(newFee.replace(',', '.')) || 0,
      settlement_days:  parseInt(newDays) || 1,
      max_installments: parseInt(newMaxInst) || 1,
    })
    if ('error' in res) {
      setSubmitting(false)
      setError(res.error)
      return
    }
    const listRes = await listPaymentCards({ card_type: paymentMethod, only_active: true })
    setSubmitting(false)
    if (!('error' in listRes)) {
      setCards(listRes)
      const created = listRes.find(c => c.id === res.id) ?? null
      if (created) setSelectedCard(created)
      setShowRegister(false)
    }
  }

  function handleConfirm() {
    setError(null)
    if (!selectedCard) { setError('Selecione um cartão.'); return }
    if (!nsu.trim()) { setError('Informe o NSU.'); return }
    if (!authorization.trim()) { setError('Informe o número de liberação.'); return }
    if (paymentMethod === 'credit' && installments > selectedCard.max_installments) {
      setError(`Este cartão aceita no máximo ${selectedCard.max_installments}x.`)
      return
    }
    onConfirm({
      card:               selectedCard,
      installments,
      card_acquirer:      selectedCard.acquirer,
      card_brand:         selectedCard.brand,
      card_nsu:           nsu.trim(),
      card_authorization: authorization.trim(),
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
                {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · selecione o cartão e informe os dados
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando cartões...
            </div>
          ) : showRegister ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Cadastrar novo cartão</h3>
                {cards.length > 0 && (
                  <button
                    onClick={() => setShowRegister(false)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Voltar para lista
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Apelido <span className="text-rose-500">*</span></label>
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder='Ex.: "Cielo Mesa 1"'
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Administradora <span className="text-rose-500">*</span></label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_ACQUIRERS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setNewAcquirer(a)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                        newAcquirer === a
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <input
                  value={newAcquirer}
                  onChange={e => setNewAcquirer(e.target.value)}
                  placeholder="Ou digite outra"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Bandeira</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_BRANDS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setNewBrand(b)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                        newBrand === b
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Taxa (%)</label>
                  <input
                    value={newFee}
                    onChange={e => setNewFee(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Repasse (D+)</label>
                  <input
                    value={newDays}
                    onChange={e => setNewDays(e.target.value)}
                    inputMode="numeric"
                    placeholder="1"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                {paymentMethod === 'credit' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Máx. parc.</label>
                    <input
                      value={newMaxInst}
                      onChange={e => setNewMaxInst(e.target.value)}
                      inputMode="numeric"
                      placeholder="12"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRegister}
                disabled={submitting}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Cadastrar e usar
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600">Selecione o cartão</p>
                <div className="space-y-1.5">
                  {cards.map(c => {
                    const active = selectedCard?.id === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCard(c)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all ${
                          active
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                          <p className="text-[11px] text-slate-500">
                            {c.acquirer}{c.brand ? ` · ${c.brand}` : ''} · Taxa {c.fee_percent}% · D+{c.settlement_days}
                          </p>
                        </div>
                        {active && <Check className="h-4 w-4 text-indigo-600 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50 py-2 text-xs font-semibold text-indigo-700"
                >
                  <Plus className="h-3 w-3" /> Cadastrar novo cartão
                </button>
              </div>

              {paymentMethod === 'credit' && selectedCard && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Parcelas</label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {Array.from({ length: selectedCard.max_installments }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>
                        {n}x {n > 1 ? `de ${(amount / n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}` : 'à vista'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">NSU <span className="text-rose-500">*</span></label>
                  <input
                    value={nsu}
                    onChange={e => setNsu(e.target.value.replace(/\s/g, ''))}
                    placeholder="Ex: 123456789"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Liberação <span className="text-rose-500">*</span></label>
                  <input
                    value={authorization}
                    onChange={e => setAuthorization(e.target.value.replace(/\s/g, ''))}
                    placeholder="Ex: 987654"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</div>
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
          {!showRegister && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedCard}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" /> Confirmar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
