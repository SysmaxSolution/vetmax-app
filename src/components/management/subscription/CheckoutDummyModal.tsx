'use client'

// Checkout da assinatura (Fase 2 — gateway Asaas real).
// PIX e CARTÃO usam a FATURA HOSPEDADA do Asaas: ao confirmar, o servidor cria
// a cobrança e devolve a invoiceUrl, que abrimos em nova aba. O cliente paga
// (QR PIX ou cartão) na página segura do Asaas — o PAN nunca toca nosso app
// (PCI-safe / LGPD). O total exibido é recalculado no servidor; este modal é
// só display + escolha do método + aceite dos termos.

import { useState } from 'react'
import { X, CreditCard, Smartphone, Loader2, ShieldCheck } from 'lucide-react'
import type { BillingCycle, SubscriptionModuleCatalogRow } from '@/types'
import type { PriceTotals } from '@/lib/subscription/pricing'
import type { DummyPaymentPayload } from '@/lib/subscription/types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  plan:           'starter' | 'premium' | 'enterprise' | 'specialized'
  basePrice:      number
  /** Addons selecionados (sempre vazio no Enterprise/Starter — bundle inclui tudo). */
  selectedModules: SubscriptionModuleCatalogRow[]
  cycle:          BillingCycle
  totals:         PriceTotals
  onCancel:       () => void
  onConfirm:      (payment: DummyPaymentPayload) => Promise<void>
}

const PLAN_LABEL: Record<'starter' | 'premium' | 'enterprise' | 'specialized', string> = {
  starter: 'Starter',
  premium: 'Premium',
  enterprise: 'Enterprise',
  specialized: 'Especializado',
}

export default function CheckoutDummyModal({ plan, basePrice, selectedModules, cycle, totals, onCancel, onConfirm }: Props) {
  // PIX é o destaque (manchete): default em qualquer ciclo. Cartão é a opção
  // secundária — sem enquadrar como "multa por cartão".
  const [method, setMethod]         = useState<'card' | 'pix'>('pix')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Total a cobrar conforme método + ciclo: mensal igual; anual PIX 20% off,
  // anual cartão 10% off (D1). Espelha chargeValueFor do servidor.
  const shownTotal = cycle === 'yearly'
    ? (method === 'card' ? totals.yearlyDiscountedCard : totals.yearlyDiscounted)
    : totals.monthlyTotal
  const shownSaving = cycle === 'yearly' ? totals.yearlyTotal - shownTotal : 0

  async function handleConfirm() {
    setError(null)
    if (!termsAccepted) {
      setError('Você precisa aceitar os Termos de Uso para continuar.')
      return
    }
    setSubmitting(true)
    try {
      // Nenhum dado de cartão sai do navegador: o cliente paga na fatura
      // hospedada do Asaas (PCI-safe). Enviamos só o método + aceite.
      await onConfirm({ method, terms_accepted: true })
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
              Ciclo {cycle === 'yearly' ? 'anual' : 'mensal'}
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
                {cycle === 'yearly'
                  ? `Total anual no ${method === 'card' ? 'cartão' : 'PIX'} (com desconto)`
                  : 'Total mensal'}
              </span>
              <span className="text-indigo-700 tabular-nums">{fmt(shownTotal)}</span>
            </div>
            {cycle === 'yearly' && (
              <p className="text-[11px] text-emerald-700">
                Economia de {fmt(shownSaving)} em relação ao mensal
                {method === 'card' && ' · pague no PIX para economizar ainda mais'}.
              </p>
            )}
          </div>

          {/* Método — PIX em destaque (manchete), cartão como alternativa */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Como você prefere pagar?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMethod('pix')}
                className={`relative flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  method === 'pix' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Smartphone className="h-4 w-4" /> PIX
                <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide">
                  {cycle === 'yearly' ? 'Melhor preço' : 'Recomendado'}
                </span>
              </button>
              <button
                onClick={() => setMethod('card')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  method === 'card' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <CreditCard className="h-4 w-4" /> Cartão
              </button>
            </div>
          </div>

          {method === 'card' ? (
            <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-center">
              <CreditCard className="mx-auto h-6 w-6 text-indigo-500" />
              <p className="mt-1 text-sm font-medium text-indigo-800">Pagamento no cartão</p>
              <p className="text-xs text-indigo-700">
                Ao confirmar, abrimos a fatura segura do Asaas para você inserir os dados
                do cartão. {cycle === 'yearly'
                  ? 'É uma cobrança única que dá direito a 12 meses; renova automaticamente no próximo ano.'
                  : 'A mensalidade é cobrada automaticamente todo mês no mesmo cartão.'}
              </p>
              <p className="mt-1.5 text-[11px] text-indigo-500">
                Os dados do cartão são processados pelo Asaas — nunca passam pelo SysVetMax.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 text-center">
              <Smartphone className="mx-auto h-6 w-6 text-emerald-500" />
              <p className="mt-1 text-sm font-medium text-emerald-800">Pagamento via PIX</p>
              <p className="text-xs text-emerald-700">
                Ao confirmar, geramos a cobrança e abrimos a fatura com o QR Code para
                você pagar. A confirmação do pagamento é automática.
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
