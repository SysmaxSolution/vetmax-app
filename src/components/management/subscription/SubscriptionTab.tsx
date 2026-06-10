'use client'

// Aba Assinatura (Gestão) — SaaS Fase 1.5 (4 tiers).
// Cards Free / Premium R$99 (bundle + addons R$79,90) / Enterprise R$299
// (tudo incluso, destaque) / Especializado (sob medida). Total em tempo real
// com a mesma computePlanPrice do servidor. Checkout dummy (Fase sem gateway).
// Para SysMax, exibe o painel de pricing editável (PricingAdminPanel).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeCheck, Check, CreditCard, Crown, Loader2, MessageCircle, Sparkles,
  AlertTriangle, Users, FileText, Plus,
} from 'lucide-react'
import { Toast } from '@/components/ui/toast'
import { FREE_MODULES } from '@/config/access-matrix'
import { computePlanPrice } from '@/lib/subscription/pricing'
import { PLAN_LIMITS } from '@/lib/subscription/plan-limits'
import { subscribeToPlan, downgradeToFree } from '@/lib/actions/subscription'
import type { SubscriptionOverview, DummyPaymentPayload } from '@/lib/subscription/types'
import type { BillingCycle } from '@/types'
import ModulePicker from './ModulePicker'
import CheckoutDummyModal from './CheckoutDummyModal'
import PricingAdminPanel from './PricingAdminPanel'

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
  enterprise:  { label: 'Enterprise',    cls: 'bg-amber-100 text-amber-700' },
  specialized: { label: 'Especializado', cls: 'bg-violet-100 text-violet-700' },
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Ativa',     cls: 'bg-emerald-100 text-emerald-700' },
  trialing:  { label: 'Em teste',  cls: 'bg-sky-100 text-sky-700' },
  past_due:  { label: 'Em atraso', cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
}

interface Props {
  overview: SubscriptionOverview
  isSysmax?: boolean
}

export default function SubscriptionTab({ overview, isSysmax = false }: Props) {
  const router = useRouter()
  const { subscription, contractedKeys, catalog, config, businessType } = overview

  const planName = subscription?.plan_name ?? 'free'
  const isPremium = planName === 'premium'
  const isEnterprise = planName === 'enterprise'
  const isSpecialized = planName === 'specialized'

  const premiumBundle = catalog.filter(c => c.included_in_plan === 'premium')
  const enterpriseLines = catalog.filter(c => c.included_in_plan === 'enterprise')
  const enterpriseAddonsAvailable = enterpriseLines.filter(c => c.is_available)

  // Crítico: pré-seleciona os addons já contratados (ex.: surgery_advanced da
  // Vet Teste) para não derrubá-los numa reassinatura.
  const [selectedAddons, setSelectedAddons] = useState<string[]>(
    contractedKeys.filter(k => enterpriseLines.some(c => c.module_key === k))
  )
  const [cycle, setCycle] = useState<BillingCycle>(
    (subscription?.billing_cycle as BillingCycle | null) ?? 'monthly'
  )
  const [checkoutPlan, setCheckoutPlan]   = useState<'premium' | 'enterprise' | null>(null)
  const [showDowngrade, setShowDowngrade] = useState(false)
  const [downgrading, setDowngrading]     = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const pricingInput = {
    premiumBase: config.premium_base_price,
    enterpriseBase: config.enterprise_base_price,
    annualDiscountPercent: config.annual_discount_percent,
    catalog,
  }
  const premiumTotals = useMemo(
    () => computePlanPrice({ ...pricingInput, plan: 'premium', addonKeys: selectedAddons, cycle }),
    [config, catalog, selectedAddons, cycle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const enterpriseTotals = useMemo(
    () => computePlanPrice({ ...pricingInput, plan: 'enterprise', addonKeys: [], cycle }),
    [config, catalog, cycle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const checkoutTotals = checkoutPlan === 'enterprise' ? enterpriseTotals : premiumTotals

  const freeLabels = (FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
    .map(k => MODULE_LABELS_PT[k] ?? k)

  const salesWhatsapp = process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? '5516997023340'
  const whatsappUrl = `https://wa.me/${salesWhatsapp}?text=${encodeURIComponent(
    'Olá! Tenho interesse no Plano Especializado do SysVetMax e gostaria de falar com um consultor.'
  )}`

  const addonPrice = enterpriseAddonsAvailable[0]?.monthly_price ?? 79.9

  function toggleAddon(key: string) {
    setSelectedAddons(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function handleCheckoutConfirm(payment: DummyPaymentPayload) {
    if (!checkoutPlan) return
    const result = await subscribeToPlan({
      plan: checkoutPlan,
      addonKeys: checkoutPlan === 'premium' ? selectedAddons : [],
      cycle,
      payment,
    })
    if ('error' in result) throw new Error(result.error)
    setCheckoutPlan(null)
    setToast({
      type: 'success',
      message: `Assinatura ${checkoutPlan === 'enterprise' ? 'Enterprise' : 'Premium'} ativada! Os módulos já estão liberados.`,
    })
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
    setSelectedAddons([])
    setToast({ type: 'success', message: 'Plano alterado para Free.' })
    router.refresh()
  }

  // Mensalidade corrente (independe da seleção em edição)
  const currentMonthly = isEnterprise
    ? config.enterprise_base_price
    : isPremium
      ? computePlanPrice({
          ...pricingInput, plan: 'premium', cycle: 'monthly',
          addonKeys: contractedKeys.filter(k => enterpriseLines.some(c => c.module_key === k)),
        }).monthlyTotal
      : 0

  const planBadge   = PLAN_BADGE[planName] ?? PLAN_BADGE.free
  const statusBadge = STATUS_BADGE[subscription?.status ?? 'active'] ?? STATUS_BADGE.active

  function quotaLine(plan: 'free' | 'premium' | 'enterprise') {
    const l = PLAN_LIMITS[plan]
    const users = l.users >= 999 ? 'Usuários ilimitados' : `${l.users} usuários`
    const docs = l.documents >= 999 ? 'documentos ilimitados' : `${l.documents} documentos personalizados`
    return `${users} · ${docs}`
  }

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
          ) : isPremium || isEnterprise ? (
            <p>
              Mensalidade de <span className="font-semibold text-slate-800">{fmt(currentMonthly)}</span>
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

      {/* ── Cards comparativos (4 tiers) ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
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
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Users className="h-3 w-3" /> {quotaLine('free')}
          </p>
          {(isPremium || isEnterprise) && (
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
          {isPremium && (
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
              Plano atual
            </span>
          )}
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900">Premium</h3>
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo-700 tabular-nums">
            {fmt(premiumTotals.monthlyTotal)}<span className="text-sm font-medium text-slate-400">/mês</span>
          </p>
          {cycle === 'yearly' ? (
            <p className="mt-0.5 text-xs text-emerald-700 font-medium">
              {fmt(premiumTotals.yearlyDiscounted)}/ano no PIX — economize {fmt(premiumTotals.yearlyTotal - premiumTotals.yearlyDiscounted)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              Base {fmt(config.premium_base_price)} + adicionais escolhidos
            </p>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Todo o Free, mais:
            </p>
            <ul className="space-y-1.5">
              {premiumBundle.map(mod => (
                <li key={mod.module_key} className="flex items-center gap-2 text-sm text-slate-600" title={mod.description}>
                  <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> {mod.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <FileText className="h-3 w-3" /> {quotaLine('premium')}
            </p>
          </div>

          {!isSpecialized && !isEnterprise && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <Plus className="h-3 w-3" /> Adicionais — {fmt(addonPrice)}/mês cada
              </p>
              <ModulePicker
                catalog={enterpriseAddonsAvailable}
                selectedKeys={selectedAddons}
                businessType={businessType}
                onToggle={toggleAddon}
              />
            </div>
          )}

          {!isSpecialized && (
            <button
              onClick={() => setCheckoutPlan('premium')}
              disabled={isEnterprise}
              title={isEnterprise ? 'Seu plano atual já inclui tudo do Premium' : undefined}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="h-4 w-4" />
              {isPremium ? 'Atualizar Assinatura' : 'Assinar Premium'}
            </button>
          )}
        </div>

        {/* Enterprise — destaque */}
        <div className={`rounded-2xl border-2 bg-gradient-to-b from-amber-50/70 to-white p-5 shadow-lg relative ${isEnterprise ? 'border-amber-500' : 'border-amber-300'}`}>
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
            {isEnterprise ? 'Plano atual' : 'Mais completo'}
          </span>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Enterprise</h3>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {fmt(enterpriseTotals.monthlyTotal)}<span className="text-sm font-medium text-slate-400">/mês</span>
          </p>
          {cycle === 'yearly' ? (
            <p className="mt-0.5 text-xs text-emerald-700 font-medium">
              {fmt(enterpriseTotals.yearlyDiscounted)}/ano no PIX — economize {fmt(enterpriseTotals.yearlyTotal - enterpriseTotals.yearlyDiscounted)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Todos os módulos inclusos</p>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Todo o Premium, mais:
            </p>
            <ul className="space-y-1.5">
              {enterpriseLines.map(mod => (
                <li key={mod.module_key} className="flex items-center gap-2 text-sm text-slate-600" title={mod.description}>
                  <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  {mod.label}
                  {!mod.is_available && (
                    <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">em breve</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Users className="h-3 w-3" /> {quotaLine('enterprise')}
            </p>
          </div>

          {!isSpecialized && (
            <button
              onClick={() => setCheckoutPlan('enterprise')}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
            >
              <Crown className="h-4 w-4" />
              {isEnterprise ? 'Atualizar Assinatura' : 'Assinar Enterprise'}
            </button>
          )}
        </div>

        {/* Especializado */}
        <div className={`rounded-2xl border bg-gradient-to-b from-violet-50/60 to-white p-5 shadow-sm ${isSpecialized ? 'border-violet-400 ring-1 ring-violet-300' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-violet-500" />
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

      {/* ── Painel de pricing (SysMax) ──────────────────────────────────── */}
      {isSysmax && (
        <PricingAdminPanel
          catalog={catalog}
          config={config}
          onToast={(type, message) => setToast({ type, message })}
        />
      )}

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      {checkoutPlan && (
        <CheckoutDummyModal
          plan={checkoutPlan}
          basePrice={checkoutPlan === 'enterprise' ? config.enterprise_base_price : config.premium_base_price}
          selectedModules={checkoutPlan === 'premium'
            ? enterpriseLines.filter(c => selectedAddons.includes(c.module_key))
            : []}
          cycle={cycle}
          totals={checkoutTotals}
          onCancel={() => setCheckoutPlan(null)}
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
              Os módulos do plano serão desativados imediatamente e os limites voltam a
              3 usuários e 3 documentos. Os dados não são apagados — voltam a ficar
              disponíveis se você reativar a assinatura.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowDowngrade(false)}
                disabled={downgrading}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Manter plano
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
