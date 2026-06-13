'use client'

// Checkout estrutural da Fase 1 (SEM gateway — aguardando CNPJ/conta).
// Os inputs simulam o fluxo real; ao confirmar, envia payload dummy
// (apenas last4/brand do cartão + aceite dos termos). O total exibido é
// recalculado no servidor — este modal é só display + coleta de aceite.

import { useState } from 'react'
import { X, CreditCard, Smartphone, Loader2, ShieldCheck } from 'lucide-react'
import type { BillingCycle, SubscriptionModuleCatalogRow } from '@/types'
import type { PriceTotals } from '@/lib/subscription/pricing'
import type { DummyPaymentPayload } from '@/lib/subscription/types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  plan:           'premium' | 'enterprise'
  basePrice:      number
  /** Addons selecionados (sempre vazio no Enterprise — bundle inclui tudo). */
  selectedModules: SubscriptionModuleCatalogRow[]
  cycle:          BillingCycle
  totals:         PriceTotals
  onCancel:       () => void
  onConfirm:      (payment: DummyPaymentPayload) => Promise<void>
}

const PLAN_LABEL: Record<'premium' | 'enterprise', string> = {
  premium: 'Premium',
  enterprise: 'Enterprise',
}

export default function CheckoutDummyModal({ plan, basePrice, selectedModules, cycle, totals, onCancel, onConfirm }: Props) {
  const [method, setMethod]         = useState<'card' | 'pix'>(cycle === 'yearly' ? 'pix' : 'card')
  const [holder, setHolder]         = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry]         = useState('')
  const [cvv, setCvv]               = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    if (!termsAccepted) {
      setError('Você precisa aceitar os Termos de Uso para continuar.')
      return
    }
    if (method === 'card') {
      const digits = cardNumber.replace(/\D/g, '')
      if (!holder.trim() || digits.length < 13) {
        setError('Preencha o nome impresso e o número do cartão.')
        return
      }
    }
    setSubmitting(true)
    try {
      const digits = cardNumber.replace(/\D/g, '')
      await onConfirm({
        method,
        // NUNCA enviar o número completo — apenas last4 (LGPD / Fase 1 dummy)
        card: method === 'card'
          ? { holder: holder.trim(), last4: digits.slice(-4), brand: 'simulado' }
          : undefined,
        terms_accepted: true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao processar a assinatura.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Assinar Plano {PLAN_LABEL[plan]}</h3>
            <p className="text-xs text-slate-500">
              Ciclo {cycle === 'yearly' ? 'anual (PIX com desconto)' : 'mensal'}
            </p>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Resumo */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">
                Plano base{plan === 'enterprise' && ' — todos os módulos inclusos'}
              </span>
              <span className="font-medium text-slate-800 tabular-nums">{fmt(basePrice)}/mês</span>
            </div>
            {selectedModules.map(m => (
              <div key={m.module_key} className="flex justify-between text-sm">
                <span className="text-slate-600">{m.label}</span>
                <span className="font-medium text-slate-800 tabular-nums">+ {fmt(m.monthly_price)}/mês</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-semibold">
              <span className="text-slate-800">
                {cycle === 'yearly' ? 'Total anual (com desconto)' : 'Total mensal'}
              </span>
              <span className="text-indigo-700 tabular-nums">{fmt(totals.effectiveTotal)}</span>
            </div>
            {cycle === 'yearly' && (
              <p className="text-[11px] text-emerald-700">
                Economia de {fmt(totals.yearlyTotal - totals.yearlyDiscounted)} em relação ao mensal.
              </p>
            )}
          </div>

          {/* Método */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod('card')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                method === 'card' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <CreditCard className="h-4 w-4" /> Cartão
            </button>
            <button
              onClick={() => setMethod('pix')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                method === 'pix' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <Smartphone className="h-4 w-4" /> PIX
            </button>
          </div>

          {method === 'card' ? (
            <div className="space-y-2">
              <input
                value={holder}
                onChange={e => setHolder(e.target.value)}
                placeholder="Nome impresso no cartão"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <input
                value={cardNumber}
                onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 19))}
                placeholder="Número do cartão"
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 tabular-nums"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={expiry}
                  onChange={e => setExpiry(e.target.value.replace(/[^\d/]/g, '').slice(0, 5))}
                  placeholder="MM/AA"
                  inputMode="numeric"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 tabular-nums"
                />
                <input
                  value={cvv}
                  onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="CVV"
                  inputMode="numeric"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 tabular-nums"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Ambiente de pré-lançamento: nenhuma cobrança será efetuada e os dados do cartão não são armazenados.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 text-center">
              <Smartphone className="mx-auto h-6 w-6 text-emerald-500" />
              <p className="mt-1 text-sm font-medium text-emerald-800">Pagamento via PIX</p>
              <p className="text-xs text-emerald-700">
                O QR Code de pagamento será disponibilizado em breve — nenhuma cobrança será efetuada agora.
              </p>
            </div>
          )}

          {/* Termos de Assinatura */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <span className="text-xs text-slate-600">
              Li e aceito os{' '}
              <a
                href="/termos-assinatura"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
              >
                Termos de Assinatura e Pagamento
              </a>
              {' '}do SysVetMax, incluindo a política de renovação automática e não-reembolso de período fruído.
            </span>
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Confirmar Assinatura
          </button>
        </div>
      </div>
    </div>
  )
}
