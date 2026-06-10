'use client'

// Aba Assinatura (Gestão) — Monetização SaaS Fase 1.
// Cards comparativos Free / Premium (a la carte) / Especializado, com total
// em tempo real (mesma computePremiumPrice do servidor) e checkout dummy.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeCheck, Check, CreditCard, Crown, Loader2, MessageCircle, Sparkles, AlertTriangle,
} from 'lucide-react'
import { Toast } from '@/components/ui/toast'
import { FREE_MODULES } from '@/config/access-matrix'
import { computePremiumPrice } from '@/lib/subscription/pricing'
import { subscribeToPremium, downgradeToFree } from '@/lib/actions/subscription'
import type { SubscriptionOverview, DummyPaymentPayload } from '@/lib/subscription/types'
import ModulePicker from './ModulePicker'
import CheckoutDummyModal from './CheckoutDummyModal'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MODULE_LABELS_PT: Record<string, string> = {
  reception: 'Recepção', patients: 'Pacientes', consultation: 'Consultório',
  cashier: 'Caixa', management: 'Gestão', grooming: 'Banho e Tosa',
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  free:        { label: 'Free',          cls: 'bg-slate-100 text-slate-700' },
  premium:     { label: 'Premium',       cls: 'bg-indigo-100 text-indigo-700' },
  specialized: { label: 'Especializado', cls: 'bg-violet-100 text-violet-700' },
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Ativa',        cls: 'bg-emerald-100 text-emerald-700' },
  trialing:  { label: 'Em teste',     cls: 'bg-sky-100 text-sky-700' },
  past_due:  { label: 'Em atraso',    cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelada',    cls: 'bg-red-100 text-red-700' },
}

interface Props {
  overview: SubscriptionOverview
}

export default function SubscriptionTab({ overview }: Props) {
  const router = useRouter()
  const { subscription, contractedKeys, catalog, config, businessType } = overview

  const planName = subscription?.plan_name ?? 'free'
  const isPremium = planName === 'premium'
  const isSpecialized = planName === 'specialized'

  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    contractedKeys.filter(k => catalog.some(c => c.module_key === k))
  )
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(
    (subscription?.billing_cycle as 'monthly' | 'yearly' | null) ?? 'monthly'
  )
  const [showCheckout, setShowCheckout]   = useState(false)
  const [showDowngrade, setShowDowngrade] = useState(false)
  const [downgrading, setDowngrading]     = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const totals = useMemo(
    () => computePremiumPrice({
      basePrice: config.premium_base_price,
      annualDiscountPercent: config.annual_discount_percent,
      catalog,
      selectedKeys,
      cycle,
    }),
    [config, catalog, selectedKeys, cycle]
  )

  const freeLabels = (FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
    .map(k => MODULE_LABELS_PT[k] ?? k)

  const salesWhatsapp = process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? '5516997023340'
  const whatsappUrl = `https://wa.me/${salesWhatsapp}?text=${encodeURIComponent(
    'Olá! Tenho interesse no Plano Especializado do SysVetMax e gostaria de falar com um consultor.'
  )}`

  function toggleModule(key: string) {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function handleCheckoutConfirm(payment: DummyPaymentPayload) {
    const result = await subscribeToPremium({ moduleKeys: selectedKeys, cycle, payment })
    if ('error' in result) throw new Error(result.error)
    setShowCheckout(false)
    setToast({ type: 'success', message: 'Assinatura Premium ativada! Os módulos já estão liberados.' })
    router.refresh()
  }

  async function handleDowngrade() {
    setDowngrading(true)
    const result = await downgradeToFree()
    setDowngrading(false)
    setShowDowngrade(false)
    if ('error' in result) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setSelectedKeys([])
    setToast({ type: 'success', message: 'Plano alterado para Free.' })
    router.refresh()
  }

  const planBadge   = PLAN_BADGE[planName] ?? PLAN_BADGE.free
  const statusBadge = STATUS_BADGE[subscription?.status ?? 'active'] ?? STATUS_BADGE.active
  const contractedLabels = catalog
    .filter(c => contractedKeys.includes(c.module_key))
    .map(c => c.label)

  return (
    <div className="space-y-5">
      {/* ── Plano atual ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Plano atual</h2>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${planBadge.cls}`}>
            {planBadge.label}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          {subscription?.billing_cycle && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {subscription.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}
            </span>
          )}
        </div>
        <div className="mt-2 text-sm text-slate-600">
          {isSpecialized ? (
            <p>
              Contrato comercial sob medida{subscription?.custom_price != null && (
                <> — <span className="font-semibold text-slate-800">{fmt(Number(subscription.custom_price))}/mês</span></>
              )}. Gerenciado pelo time SysMax.
            </p>
          ) : isPremium ? (
            <p>
              Mensalidade de <span className="font-semibold text-slate-800">{fmt(totalsForCurrent(config, catalog, contractedKeys))}</span>
              {contractedLabels.length > 0 && <> — módulos: {contractedLabels.join(', ')}</>}
              {subscription?.current_period_end && (
                <> · válida até {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}</>
              )}
            </p>
          ) : (
            <p>Acesso gratuito ao núcleo do sistema: {freeLabels.join(', ')}.</p>
          )}
        </div>
      </div>

      {/* ── Toggle de ciclo ─────────────────────────────────────────────── */}
      {!isSpecialized && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCycle('monthly')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              cycle === 'monthly' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setCycle('yearly')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              cycle === 'yearly' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            Anual no PIX
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              −{Number(config.annual_discount_percent).toFixed(0)}%
            </span>
          </button>
        </div>
      )}

      {/* ── Cards comparativos ──────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3 items-start">
        {/* Free */}
        <div className={`rounded-2xl border bg-white p-5 shadow-sm ${planName === 'free' ? 'border-slate-400 ring-1 ring-slate-300' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Free</h3>
            {planName === 'free' && (
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Plano atual</span>
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">R$ 0<span className="text-sm font-medium text-slate-400">/mês</span></p>
          <p className="mt-1 text-xs text-slate-500">O essencial para começar a operar.</p>
          <ul className="mt-4 space-y-1.5">
            {freeLabels.map(label => (
              <li key={label} className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> {label}
              </li>
            ))}
          </ul>
          {isPremium && (
            <button
              onClick={() => setShowDowngrade(true)}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:border-red-200 hover:text-red-600 transition-colors"
            >
              Voltar para o Free
            </button>
          )}
        </div>

        {/* Premium */}
        <div className={`rounded-2xl border-2 bg-white p-5 shadow-md relative ${isPremium ? 'border-indigo-500' : 'border-indigo-300'}`}>
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
            {isPremium ? 'Plano atual' : 'Mais popular'}
          </span>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900">Premium</h3>
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo-700 tabular-nums">
            {fmt(totals.monthlyTotal)}<span className="text-sm font-medium text-slate-400">/mês</span>
          </p>
          {cycle === 'yearly' ? (
            <p className="mt-0.5 text-xs text-emerald-700 font-medium">
              {fmt(totals.yearlyDiscounted)}/ano no PIX — economize {fmt(totals.yearlyTotal - totals.yearlyDiscounted)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              Base {fmt(config.premium_base_price)} + módulos escolhidos
            </p>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Todo o plano Free, mais:
            </p>
            {isSpecialized ? (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500">
                Seu plano é gerenciado pelo nosso time comercial — fale com seu consultor para ajustar módulos.
              </div>
            ) : (
              <ModulePicker
                catalog={catalog}
                selectedKeys={selectedKeys}
                businessType={businessType}
                onToggle={toggleModule}
              />
            )}
          </div>

          {!isSpecialized && (
            <button
              onClick={() => setShowCheckout(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              {isPremium ? 'Atualizar Assinatura' : 'Assinar Agora'}
            </button>
          )}
        </div>

        {/* Especializado */}
        <div className={`rounded-2xl border bg-gradient-to-b from-violet-50/60 to-white p-5 shadow-sm ${isSpecialized ? 'border-violet-400 ring-1 ring-violet-300' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-bold text-slate-900">Especializado</h3>
            </div>
            {isSpecialized && (
              <span className="text-[10px] font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">Plano atual</span>
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {isSpecialized && subscription?.custom_price != null
              ? <>{fmt(Number(subscription.custom_price))}<span className="text-sm font-medium text-slate-400">/mês</span></>
              : 'Sob medida'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Módulos, limites e valores definidos em contrato com nosso time comercial.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Combinação livre de módulos</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Valor negociado em contrato</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Onboarding e suporte dedicados</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Multi-unidades e migração de dados</li>
          </ul>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com Especialista
          </a>
        </div>
      </div>

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      {showCheckout && (
        <CheckoutDummyModal
          basePrice={config.premium_base_price}
          selectedModules={catalog.filter(c => selectedKeys.includes(c.module_key))}
          cycle={cycle}
          totals={totals}
          onCancel={() => setShowCheckout(false)}
          onConfirm={handleCheckoutConfirm}
        />
      )}

      {showDowngrade && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-semibold text-slate-900">Voltar para o Free?</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Os módulos contratados serão desativados imediatamente e a equipe perderá acesso a eles.
              Os dados não são apagados — voltam a ficar disponíveis se você reativar a assinatura.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowDowngrade(false)}
                disabled={downgrading}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Manter Premium
              </button>
              <button
                onClick={handleDowngrade}
                disabled={downgrading}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {downgrading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  )
}

// Mensalidade corrente de um premium já contratado (independe da seleção em edição).
function totalsForCurrent(
  config: { premium_base_price: number },
  catalog: Array<{ module_key: string; monthly_price: number }>,
  contractedKeys: string[]
): number {
  const sum = catalog
    .filter(c => contractedKeys.includes(c.module_key))
    .reduce((s, c) => s + Number(c.monthly_price), 0)
  return Math.round((Number(config.premium_base_price) + sum) * 100) / 100
}
