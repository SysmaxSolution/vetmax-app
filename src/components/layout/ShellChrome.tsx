'use client'

/**
 * ShellChrome — o chrome interativo do shell único: Sidebar petrol fixa +
 * Topbar glass + wrapper de conteúdo. Client component porque guarda o
 * estado de colapso (localStorage) e do drawer mobile.
 *
 * O DashboardShell (server) o envolve com os providers globais — por isso
 * o menu consegue abrir o UpgradeModal nos itens promovidos "PRO".
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, CreditCard, Menu } from 'lucide-react'
import type { UserRole } from '@/types'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import { updateClinicStatus, type ClinicStatus } from '@/lib/actions/clinic-status'
import { setSurgeryMode } from '@/lib/actions/surgery-mode'
import { getModuleFromPath, MODULE_THEME } from '@/lib/module-theme'
import { NAV_LINKS, type NavContext, type NavBadgeCounts } from '@/lib/nav-links'
import Sidebar from '@/components/layout/Sidebar'
import OmnisearchTrigger from '@/components/layout/OmnisearchTrigger'
import NotificationBell from '@/components/layout/NotificationBell'
import { SysmaxFooter } from '@/components/ui/SysmaxFooter'

const SIDEBAR_COLLAPSED_KEY = 'vetmax_sidebar_collapsed'

// ─── Topbar ───────────────────────────────────────────────────────────────────

interface TopbarProps {
  clinicId:              string
  clinicName:            string
  userRole:              UserRole
  isSysmax:              boolean
  clinicStatus:          string
  isSurgeryMode:         boolean
  subscriptionUiEnabled: boolean
  onOpenMobileMenu:      () => void
}

const STATUS_OPTIONS: { value: ClinicStatus; label: string; color: string }[] = [
  { value: 'active',    label: 'Ativa',     color: 'bg-green-100 text-green-700' },
  { value: 'pending',   label: 'Pendente',  color: 'bg-amber-100 text-amber-700' },
  { value: 'suspended', label: 'Bloqueada', color: 'bg-red-100 text-red-700' },
]

/** Título da página derivado da rota (label do item de navegação). */
function getPageTitle(pathname: string): string {
  const link = NAV_LINKS.find(l => pathname.startsWith(l.href))
  if (link) return link.label
  if (pathname.startsWith('/dashboard/profile')) return 'Meu Perfil'
  return 'Início'
}

function Topbar({
  clinicId, clinicName, userRole, isSysmax, clinicStatus, isSurgeryMode,
  subscriptionUiEnabled, onOpenMobileMenu,
}: TopbarProps) {
  const pathname = usePathname()
  const [surgeryActive, setSurgeryActive] = useState(isSurgeryMode)
  const [savingSurgery, setSavingSurgery] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<string>(clinicStatus ?? 'active')
  const [savingStatus,  setSavingStatus]  = useState(false)
  const [showNudge,     setShowNudge]     = useState(false)

  // Onboarding nudge: pulsa o hambúrguer no primeiro acesso (mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!sessionStorage.getItem('nav-hint-seen')) {
      setShowNudge(true)
      const t = setTimeout(() => setShowNudge(false), 5000)
      return () => clearTimeout(t)
    }
  }, [])

  async function handleSurgeryToggle() {
    const next = !surgeryActive
    setSurgeryActive(next)
    setSavingSurgery(true)
    const res = await setSurgeryMode(next)
    setSavingSurgery(false)
    if ('error' in res) setSurgeryActive(!next)
  }

  async function handleStatusChange(newStatus: ClinicStatus) {
    setSavingStatus(true)
    const res = await updateClinicStatus(clinicId, newStatus)
    setSavingStatus(false)
    if (!res.error) setCurrentStatus(newStatus)
  }

  const moduleKey   = getModuleFromPath(pathname)
  const moduleTheme = moduleKey ? MODULE_THEME[moduleKey] : null
  const pageTitle   = getPageTitle(pathname)

  return (
    // Glass: o blur vive num pseudo-elemento — backdrop-filter no próprio
    // container viraria containing block e prenderia os overlays fixed
    // renderizados aqui dentro (OmnisearchPalette, dropdown do sino).
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 print:hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {/* Hambúrguer — só mobile */}
        <button
          onClick={() => {
            onOpenMobileMenu()
            setShowNudge(false)
            sessionStorage.setItem('nav-hint-seen', '1')
          }}
          aria-label="Abrir menu de navegação"
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors duration-150 ease-swift hover:bg-slate-100 lg:hidden ${
            showNudge ? 'animate-pulse text-teal-600 ring-2 ring-teal-400 ring-offset-1' : ''
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Contexto da página: eyebrow (cor do módulo) + título */}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[10px] font-semibold uppercase tracking-wider ${moduleTheme?.text ?? 'text-slate-400'}`}>
            {clinicName}
          </p>
          <h1 className="truncate text-base font-bold leading-tight tracking-tight text-slate-900">
            {pageTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* SaaS Fase 1 — auto-atendimento PLG (rollout via flow_config) */}
          {subscriptionUiEnabled && userRole === 'admin' && (
            <Link
              href="/dashboard/management?tab=assinatura"
              className="hidden items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 sm:flex"
              title="Ver plano e assinatura da clínica"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Meu Plano
            </Link>
          )}

          <OmnisearchTrigger />
          <NotificationBell clinicId={clinicId} />

          {isSysmax && (
            <select
              value={currentStatus}
              onChange={e => handleStatusChange(e.target.value as ClinicStatus)}
              disabled={savingStatus}
              className={`cursor-pointer rounded-lg border-0 px-2.5 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${
                STATUS_OPTIONS.find(s => s.value === currentStatus)?.color ?? 'bg-slate-100 text-slate-600'
              }`}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          {userRole === 'vet' && (
            <button
              onClick={handleSurgeryToggle}
              disabled={savingSurgery}
              title={surgeryActive ? 'Sair do Modo Cirurgia' : 'Ativar Modo Cirurgia'}
              className={
                surgeryActive
                  ? 'flex animate-pulse items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-md disabled:opacity-60'
                  : 'flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60'
              }
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{surgeryActive ? 'Em Cirurgia' : 'Modo Cirurgia'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Chrome ───────────────────────────────────────────────────────────────────

export interface ShellChromeProps {
  userName:              string
  clinicName:            string
  clinicId:              string
  userRole:              UserRole
  logoUrl:               string | null
  activeModules:         string[] | null
  lowStockCount:         number
  whatsappHandoffCount:  number
  chatUnreadCount:       number
  userClinics?:          UserClinicInfo[]
  isSysmax:              boolean
  clinicStatus:          string
  isSurgeryMode:         boolean
  planName:              string
  allowedRoutes:         string[]
  centroCirurgico:       boolean
  pdvUnified:            boolean
  subscriptionUiEnabled: boolean
  children:              React.ReactNode
}

export default function ShellChrome({
  userName, clinicName, clinicId, userRole, logoUrl, activeModules,
  lowStockCount, whatsappHandoffCount, chatUnreadCount, userClinics,
  isSysmax, clinicStatus, isSurgeryMode, planName, allowedRoutes,
  centroCirurgico, pdvUnified, subscriptionUiEnabled, children,
}: ShellChromeProps) {
  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Largura só anima depois da hidratação — evita "abrir animando" quando o
  // localStorage diz colapsada (SSR renderiza expandida).
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
    // Próximo frame: o estado colapsado já foi aplicado sem transição.
    const raf = requestAnimationFrame(() => setHydrated(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  const navContext: NavContext = useMemo(() => ({
    userRole, activeModules, planName, allowedRoutes,
    isSysmax, centroCirurgico, pdvUnified,
  }), [userRole, activeModules, planName, allowedRoutes, isSysmax, centroCirurgico, pdvUnified])

  const badgeCounts: NavBadgeCounts = useMemo(() => ({
    lowStockCount, whatsappHandoffCount, chatUnreadCount,
  }), [lowStockCount, whatsappHandoffCount, chatUnreadCount])

  return (
    // --sidebar-w é a ÚNICA fonte da largura: dirige o aside fixo e o
    // padding do conteúdo sem re-renderizar a subárvore de children.
    <div
      className="min-h-screen bg-slate-50"
      style={{ '--sidebar-w': collapsed ? '76px' : '264px' } as React.CSSProperties}
      data-sidebar-collapsed={collapsed ? '' : undefined}
    >
      <Sidebar
        clinicName={clinicName}
        clinicId={clinicId}
        logoUrl={logoUrl}
        userClinics={userClinics}
        userName={userName}
        userRole={userRole}
        isSysmax={isSysmax}
        navContext={navContext}
        badgeCounts={badgeCounts}
        collapsed={collapsed}
        animateWidth={hydrated}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={`flex min-h-screen flex-col lg:pl-[var(--sidebar-w)] print:lg:pl-0 ${hydrated ? 'transition-[padding] duration-200 ease-swift' : ''}`}>
        <Topbar
          clinicId={clinicId}
          clinicName={clinicName}
          userRole={userRole}
          isSysmax={isSysmax}
          clinicStatus={clinicStatus}
          isSurgeryMode={isSurgeryMode}
          subscriptionUiEnabled={subscriptionUiEnabled}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1">
          {children}
        </main>
        <SysmaxFooter />
      </div>
    </div>
  )
}
