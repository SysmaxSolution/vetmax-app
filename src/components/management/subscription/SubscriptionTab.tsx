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
import SpecializedQuoteModal from './SpecializedQuoteModal'
import SubscriptionLeadsPanel from './SubscriptionLeadsPanel'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MODULE_LABELS_PT: Record<string, string> = {
  reception: 'Recepção', patients: 'Pacientes', consultation: 'Consultório',
  cashier: 'Caixa', management: 'Gestão', grooming: 'Banho e Tosa',
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  free:        { label: 'Free',          cls: 'bg-slate-100 text-slate-700' },
  starter:     { label: 'Starter',       cls: 'bg-teal-100 text-teal-700' },
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

// Estado de cobrança da Fase 2 (lifecycle_state) — tem prioridade sobre o
// status legado quando exige atenção (pending/atraso/suspensão/renovação).
const LIFECYCLE_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Aguardando pagamento', cls: 'bg-amber-100 text-amber-700' },
  past_due:  { label: 'Em atraso',            cls: 'bg-amber-100 text-amber-700' },
  grace:     { label: 'Em carência',          cls: 'bg-amber-100 text-amber-700' },
  suspended: { label: 'Suspensa',             cls: 'bg-red-100 text-red-700' },
  expiring:  { label: 'Renovação próxima',    cls: 'bg-sky-100 text-sky-700' },
  expired:   { label: 'Expirada',             cls: 'bg-red-100 text-red-700' },
}

interface Props {
  overview: SubscriptionOverview
  isSysmax?: boolean
}

export default function SubscriptionTab({ overview, isSysmax = false }: Props) {
  const router = useRouter()
  const { subscription, contractedKeys, catalog, config, businessType } = overview

  const planName = subscription?.plan_name ?? 'free'
  const isStarter   = planName === 'starter'
  const isPremium   = planName === 'premium'
  const isEnterprise = planName === 'enterprise'
  const isSpecialized = planName === 'specialized'

  const starterBundle  = catalog.filter(c => c.included_in_plan === 'starter')
  const premiumBundle  = catalog.filter(c => c.included_in_plan === 'premium')
  const enterpriseLines = catalog.filter(c => c.included_in_plan === 'enterprise')
  const enterpriseAddonsAvailable = enterpriseLines.filter(c => c.is_available)

  // Pré-seleciona os addons já contratados APENAS para quem já é Premium
  // (proteção de reassinatura — não derrubar contratos ao atualizar). Para os
  // demais planos o configurador abre zerado: o card deve mostrar a base, não
  // um total inflado pelos módulos do grandfathering (specialized/legado).
  const [selectedAddons, setSelectedAddons] = useState<string[]>(
    planName === 'premium'
      ? contractedKeys.filter(k => enterpriseLines.some(c => c.module_key === k))
      : []
  )
  // Add-on NFS-e do Starter (re-packaging 0408): único avulso do Starter.
  const billingAddon = catalog.find(c => c.module_key === 'billing_nfse')
  const [starterNfse, setStarterNfse] = useState<boolean>(
    planName === 'starter' && contractedKeys.includes('billing_nfse')
  )
  const starterAddonKeys = starterNfse && billingAddon ? ['billing_nfse'] : []
  const [cycle, setCycle] = useState<BillingCycle>(
    (subscription?.billing_cycle as BillingCycle | null) ?? 'monthly'
  )
  const [checkoutPlan, setCheckoutPlan]   = useState<'starter' | 'premium' | 'enterprise' | null>(null)
  const [showQuote, setShowQuote]         = useState(false)
  const [showDowngrade, setShowDowngrade] = useState(false)
  const [downgrading, setDowngrading]     = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const pricingInput = {
    starterBase: config.starter_base_price,
    premiumBase: config.premium_base_price,
    enterpriseBase: config.enterprise_base_price,
    annualDiscountPercent: config.annual_discount_percent,
    catalog,
  }
  const starterTotals = useMemo(
    () => computePlanPrice({ ...pricingInput, plan: 'starter', addonKeys: starterAddonKeys, cycle }),
    [config, catalog, starterNfse, cycle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const premiumTotals = useMemo(
    () => computePlanPrice({ ...pricingInput, plan: 'premium', addonKeys: selectedAddons, cycle }),
    [config, catalog, selectedAddons, cycle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const enterpriseTotals = useMemo(
    () => computePlanPrice({ ...pricingInput, plan: 'enterprise', addonKeys: [], cycle }),
    [config, catalog, cycle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const checkoutTotals = checkoutPlan === 'enterprise'
    ? enterpriseTotals
    : checkoutPlan === 'starter'
      ? starterTotals
      : premiumTotals

  const freeLabels = (FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic)
    .map(k => MODULE_LABELS_PT[k] ?? k)

  // ── Configurador do Especializado ──────────────────────────────────────
  // O cliente monta a combinação desejada (pré-carregada com o bundle do
  // Premium) e vê a estimativa em tempo real ANTES de acionar o comercial.
  // A estimativa é a soma dos preços individuais — o valor final é negociado.
  const specializedSelectable = catalog.filter(c => c.is_available)
  const [specializedKeys, setSpecializedKeys] = useState<string[]>(
    premiumBundle.filter(c => c.is_available).map(c => c.module_key)
  )
  const specializedEstimate = specializedSelectable
    .filter(c => specializedKeys.includes(c.module_key))
    .reduce((sum, c) => sum + Number(c.monthly_price), 0)

  function toggleSpecialized(key: string) {
    setSpecializedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const specializedModuleLabels = specializedSelectable
    .filter(c => specializedKeys.includes(c.module_key))
    .map(c => c.label)

  function toggleAddon(key: string) {
    setSelectedAddons(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function handleCheckoutConfirm(payment: DummyPaymentPayload) {
    if (!checkoutPlan) return
    const result = await subscribeToPlan({
      plan: checkoutPlan,
      addonKeys: checkoutPlan === 'premium'
        ? selectedAddons
        : checkoutPlan === 'starter'
          ? starterAddonKeys
          : [],
      cycle,
      payment,
    })
    if ('error' in result) throw new Error(result.error)
    const planLabel = checkoutPlan === 'enterprise' ? 'Enterprise' : 'Premium'
    const methodLabel = payment.method === 'card' ? 'no cartão' : 'via PIX'
    setCheckoutPlan(null)
    if (result.checkout?.invoiceUrl) {
      // PIX/cartão: abre a fatura hospedada do Asaas para o pagamento. Os
      // módulos liberam só na confirmação (webhook PAYMENT_CONFIRMED).
      window.open(result.checkout.invoiceUrl, '_blank', 'noopener,noreferrer')
      setToast({
        type: 'success',
        message: `Cobrança ${methodLabel} do plano ${planLabel} gerada! Finalize o pagamento na aba aberta — a liberação dos módulos é automática após a confirmação.`,
      })
    } else {
      setToast({
        type: 'success',
        message: `Assinatura ${planLabel} registrada! Aguardando a confirmação do pagamento ${methodLabel} para liberar os módulos.`,
      })
    }
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
      : isStarter
        ? config.starter_base_price
        : 0

  const planBadge   = PLAN_BADGE[planName] ?? PLAN_BADGE.free
  const lifecycle   = subscription?.lifecycle_state ?? null
  const statusBadge = (lifecycle && lifecycle !== 'active' && LIFECYCLE_BADGE[lifecycle])
    ? LIFECYCLE_BADGE[lifecycle]
    : STATUS_BADGE[subscription?.status ?? 'active'] ?? STATUS_BADGE.active

  function quotaLine(plan: 'free' | 'starter' | 'premium' | 'enterprise') {
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

      {/* ── Cards comparativos (5 tiers) ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
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
          {(isStarter || isPremium || isEnterprise) && (
            <button
              onClick={() => setShowDowngrade(true)}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:border-red-200 hover:text-red-600 transition-colors"
            >
              Voltar para o Free
            </button>
          )}
        </div>

        {/* Starter */}
        <div className={`rounded-2xl border-2 bg-white p-5 shadow-sm relative ${isStarter ? 'border-teal-500' : 'border-teal-200'}`}>
          {isStarter && (
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
              Plano atual
            </span>
          )}
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-500" />
            <h3 className="text-sm font-bold text-slate-900">Starter</h3>
          </div>
          {cycle === 'yearly' ? (
            <>
              <p className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
                {fmt(starterTotals.yearlyDiscounted)}<span className="text-sm font-medium text-slate-400">/ano no PIX</span>
              </p>
              <p className="mt-0.5 text-xs text-emerald-700 font-medium">
                equivale a {fmt(starterTotals.yearlyDiscounted / 12)}/mês · economize {fmt(starterTotals.yearlyTotal - starterTotals.yearlyDiscounted)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
                {fmt(starterTotals.monthlyTotal)}<span className="text-sm font-medium text-slate-400">/mês</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Prontuário por voz IA + núcleo completo</p>
            </>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Todo o Free, mais:
            </p>
            <ul className="space-y-1.5">
              {starterBundle.map(mod => (
                <li key={mod.module_key} className="flex items-center gap-2 text-sm text-slate-600" title={mod.description}>
                  <Check className="h-3.5 w-3.5 text-teal-500 shrink-0" /> {mod.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Users className="h-3 w-3" /> {quotaLine('starter')}
            </p>
          </div>

          {/* Add-on NFS-e: opcional, +R$49/mês — oculto p/ premium/enterprise (já incluso lá) */}
          {!isPremium && !isEnterprise && !isSpecialized && billingAddon && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-teal-100 bg-teal-50/40 p-2.5">
              <input
                type="checkbox"
                checked={starterNfse}
                onChange={e => setStarterNfse(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span className="text-[11px] leading-snug text-slate-600">
                <b className="text-slate-800">+ NFS-e (Faturamento)</b> — emissão automática de nota fiscal.
                <span className="font-semibold text-teal-700"> +{fmt(Number(billingAddon.monthly_price))}/mês</span>
              </span>
            </label>
          )}

          {!isSpecialized && (
            <button
              onClick={() => setCheckoutPlan('starter')}
              disabled={isPremium || isEnterprise}
              title={isPremium || isEnterprise ? 'Seu plano atual já inclui tudo do Starter' : undefined}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="h-4 w-4" />
              {isStarter ? 'Atualizar Assinatura' : `Assinar Starter — ${fmt(starterTotals.effectiveTotal)}${cycle === 'yearly' ? '/ano no PIX' : '/mês'}`}
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
            {fmt(config.premium_base_price)}<span className="text-sm font-medium text-slate-400">/mês</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {selectedAddons.length > 0 ? 'Base do plano — total com adicionais abaixo' : 'Adicione módulos avulsos à sua escolha'}
          </p>

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
                <Plus className="h-3 w-3" /> Adicionais — preço por módulo
              </p>
              <ModulePicker
                catalog={enterpriseAddonsAvailable}
                selectedKeys={selectedAddons}
                businessType={businessType}
                onToggle={toggleAddon}
              />

              {/* Total da configuração (base + adicionais marcados) */}
              <div className="mt-3 rounded-lg bg-indigo-50/70 border border-indigo-100 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    Total{selectedAddons.length > 0 && ` (${selectedAddons.length} adiciona${selectedAddons.length === 1 ? 'l' : 'is'})`}
                  </span>
                  <span className="font-bold text-indigo-700 tabular-nums">
                    {cycle === 'yearly'
                      ? `${fmt(premiumTotals.yearlyDiscounted)}/ano no PIX`
                      : `${fmt(premiumTotals.monthlyTotal)}/mês`}
                  </span>
                </div>
                {cycle === 'yearly' && (
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    equivale a {fmt(premiumTotals.yearlyDiscounted / 12)}/mês · economize {fmt(premiumTotals.yearlyTotal - premiumTotals.yearlyDiscounted)}
                  </p>
                )}
              </div>

              {/* Upsell: configuração ficou mais cara que o Enterprise inteiro */}
              {premiumTotals.monthlyTotal >= enterpriseTotals.monthlyTotal && (
                <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                  Com esses adicionais, o <span className="font-semibold">Enterprise ({fmt(enterpriseTotals.monthlyTotal)}/mês)</span> sai
                  mais em conta e inclui todos os módulos, usuários e documentos ilimitados.
                </p>
              )}
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
              {isPremium ? 'Atualizar Assinatura' : `Assinar Premium — ${fmt(premiumTotals.effectiveTotal)}${cycle === 'yearly' ? '/ano no PIX' : '/mês'}`}
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
          {cycle === 'yearly' ? (
            <>
              <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
                {fmt(enterpriseTotals.yearlyDiscounted)}<span className="text-sm font-medium text-slate-400">/ano no PIX</span>
              </p>
              <p className="mt-0.5 text-xs text-emerald-700 font-medium">
                equivale a {fmt(enterpriseTotals.yearlyDiscounted / 12)}/mês · economize {fmt(enterpriseTotals.yearlyTotal - enterpriseTotals.yearlyDiscounted)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
                {fmt(enterpriseTotals.monthlyTotal)}<span className="text-sm font-medium text-slate-400">/mês</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Todos os módulos inclusos</p>
            </>
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
            Monte a combinação ideal e negocie o valor final com nosso time comercial.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Onboarding e suporte dedicados</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" /> Multi-unidades e migração de dados</li>
          </ul>

          {/* Configurador: pré-carregado com o bundle do Premium; o cliente
              ajusta e a estimativa acompanha em tempo real. */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Monte seu plano:
            </p>
            <div className="max-h-64 overflow-y-auto pr-1">
              <ModulePicker
                catalog={specializedSelectable}
                selectedKeys={specializedKeys}
                businessType={businessType}
                onToggle={toggleSpecialized}
              />
            </div>
            <div className="mt-3 rounded-lg bg-violet-50/70 border border-violet-100 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  Estimativa ({specializedKeys.length} módulo{specializedKeys.length === 1 ? '' : 's'})
                </span>
                <span className="font-bold text-violet-700 tabular-nums">{fmt(specializedEstimate)}/mês</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Referência pela tabela — o valor final é definido em contrato.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowQuote(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Sob consulta — falar com vendas
          </button>
        </div>
      </div>

      {/* ── Painel de pricing + leads (SysMax) ──────────────────────────── */}
      {isSysmax && (
        <>
          <PricingAdminPanel
            catalog={catalog}
            config={config}
            onToast={(type, message) => setToast({ type, message })}
          />
          <SubscriptionLeadsPanel onToast={(type, message) => setToast({ type, message })} />
        </>
      )}

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      {checkoutPlan && (
        <CheckoutDummyModal
          plan={checkoutPlan}
          basePrice={
            checkoutPlan === 'enterprise' ? config.enterprise_base_price
            : checkoutPlan === 'starter'  ? config.starter_base_price
            : config.premium_base_price
          }
          selectedModules={checkoutPlan === 'premium'
            ? enterpriseLines.filter(c => selectedAddons.includes(c.module_key))
            : checkoutPlan === 'starter' && billingAddon
              ? catalog.filter(c => starterAddonKeys.includes(c.module_key))
              : []}
          cycle={cycle}
          totals={checkoutTotals}
          onCancel={() => setCheckoutPlan(null)}
          onConfirm={handleCheckoutConfirm}
        />
      )}

      {showQuote && (
        <SpecializedQuoteModal
          moduleLabels={specializedModuleLabels}
          moduleKeys={specializedKeys}
          estimate={specializedEstimate}
          onCancel={() => setShowQuote(false)}
          onSubmitted={() => {
            setShowQuote(false)
            setToast({ type: 'success', message: 'Solicitação enviada! Nosso time comercial entra em contato em breve.' })
          }}
          onError={(message) => setToast({ type: 'error', message })}
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
              2 usuários e 3 documentos. Os dados não são apagados — voltam a ficar
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
