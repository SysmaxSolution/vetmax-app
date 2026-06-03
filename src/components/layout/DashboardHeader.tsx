'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LogOut, Home, Stethoscope, TestTubes, Users, BarChart3, PawPrint,
  BedDouble, Package, Scissors, Banknote, FolderKanban, MessageCircle, MessageSquare,
  ShoppingCart, Activity, ClipboardList, DollarSign, FileBarChart2,
  Menu, X, Lock, Syringe,
} from 'lucide-react'
import type { UserRole } from '@/types'
import { useState, useEffect } from 'react'
import { ClinicSwitcher } from '@/components/layout/ClinicSwitcher'
import OmnisearchTrigger from '@/components/layout/OmnisearchTrigger'
import NotificationBell from '@/components/layout/NotificationBell'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import { updateClinicStatus } from '@/lib/actions/clinic-status'
import type { ClinicStatus } from '@/lib/actions/clinic-status'
import { setSurgeryMode } from '@/lib/actions/surgery-mode'
import { getTabTheme, getModuleFromPath, MODULE_THEME } from '@/lib/module-theme'
import { useUpgradeModal } from '@/components/upgrade/UpgradeProvider'
import type { UpgradeFeatureKey } from '@/components/upgrade/UpgradeModal'

/**
 * Módulos que, em vez de simplesmente sumirem do menu para clínicas Free,
 * aparecem como item "promovido" — cinza com Lock e "PRO", e o clique
 * abre o UpgradeModal. Mantém-se o gatilho de upsell visível no menu
 * para features estratégicas, sem poluir com todos os módulos pagos.
 *
 * Por design — qualquer moduleKey AUSENTE desse mapa segue a regra antiga
 * (some do menu se não estiver em activeModules).
 */
const PROMOTED_LOCKED_FEATURES: Record<string, UpgradeFeatureKey> = {
  hospitalization:      'hospitalization',
  surgery:              'surgery',
  triage:               'triage',
  exams:                'exams',
  financial:            'financial',
  pharmacy:             'pharmacy',
  purchases:            'purchases',
  sales:                'sales',
  whatsapp_intelligent: 'whatsapp_intelligent',
  internal_chat:        'internal_chat',
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface Tab {
  label:      string
  href:       string
  icon:       React.ComponentType<{ className: string }>
  roles:      UserRole[]
  moduleKey?: string
  id?:        string
}

const ALL_TABS: Tab[] = [
  { label: 'Recepção',     href: '/dashboard/reception',       icon: Home,          roles: ['receptionist','admin','vet','assistant'], moduleKey: 'reception'       },
  { label: 'Pacientes',    href: '/dashboard/patients',        icon: PawPrint,      roles: ['receptionist','admin','vet','assistant'], moduleKey: 'patients'        },
  { label: 'Caixa',        href: '/dashboard/cashier',         icon: Banknote,      roles: ['admin','accountant' as UserRole],         moduleKey: 'cashier',        id: 'nav-cashier' },
  { label: 'Triagem',      href: '/dashboard/triage',          icon: Users,         roles: ['assistant','admin'],                      moduleKey: 'triage'          },
  { label: 'Consultório',  href: '/dashboard/vet',             icon: Stethoscope,   roles: ['vet','admin'],                            moduleKey: 'consultation'    },
  { label: 'Exames',       href: '/dashboard/exams',           icon: TestTubes,     roles: ['assistant','vet','admin'],                moduleKey: 'exams'           },
  { label: 'Internação',   href: '/dashboard/hospitalization', icon: BedDouble,     roles: ['vet','admin','assistant'],                moduleKey: 'hospitalization' },
  { label: 'Centro Cirúrgico', href: '/dashboard/surgery',     icon: Syringe,       roles: ['vet','admin','assistant'],                moduleKey: 'surgery'         },
  { label: 'Banho e Tosa', href: '/dashboard/grooming',        icon: Scissors,      roles: ['receptionist','admin','assistant'],       moduleKey: 'grooming'        },
  { label: 'Cadastros',    href: '/dashboard/registry',        icon: FolderKanban,  roles: ['admin','accountant' as UserRole,'receptionist'], moduleKey: 'registry' },
  { label: 'Compras',      href: '/dashboard/purchases',       icon: ClipboardList, roles: ['admin'],                                  moduleKey: 'purchases'       },
  { label: 'Estoque',      href: '/dashboard/pharmacy',        icon: Package,       roles: ['admin'],                                  moduleKey: 'pharmacy'        },
  { label: 'Vendas',       href: '/dashboard/sales',           icon: ShoppingCart,  roles: ['receptionist','admin','assistant'],       moduleKey: 'sales'           },
  { label: 'Financeiro',   href: '/dashboard/financial',       icon: DollarSign,    roles: ['admin'],                                  moduleKey: 'financial'       },
  { label: 'Relatórios',   href: '/dashboard/reports',         icon: FileBarChart2, roles: ['admin'],                                  moduleKey: 'reports'         },
  { label: 'Gestão',       href: '/dashboard/management',      icon: BarChart3,     roles: ['admin']                                                                },
  { label: 'WhatsApp',     href: '/dashboard/whatsapp',        icon: MessageCircle, roles: ['receptionist','admin','vet','assistant'], moduleKey: 'whatsapp_intelligent' },
  { label: 'Chat Interno', href: '/dashboard/internal-chat',   icon: MessageSquare, roles: ['receptionist','admin','vet','assistant'], moduleKey: 'internal_chat' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  userName:       string
  clinicName:     string
  clinicId:       string
  userRole:       UserRole
  logoUrl?:       string | null
  activeModules?: string[] | null
  lowStockCount?:        number
  whatsappHandoffCount?: number
  chatUnreadCount?:      number
  userClinics?:          UserClinicInfo[]
  isSysmax?:             boolean
  clinicStatus?:         string
  isSurgeryMode?:        boolean
  /** flow_config.centro_cirurgico — exibe o item "Centro Cirúrgico" no menu. */
  centroCirurgico?:      boolean
  // PLG
  planName?:      string
  allowedRoutes?: string[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardHeader({
  userName,
  clinicName,
  clinicId,
  userRole,
  logoUrl,
  activeModules,
  lowStockCount = 0,
  whatsappHandoffCount = 0,
  chatUnreadCount = 0,
  userClinics,
  isSysmax = false,
  clinicStatus,
  isSurgeryMode = false,
  centroCirurgico = false,
  planName = 'free',
  allowedRoutes = [],
}: DashboardHeaderProps) {
  const pathname = usePathname()
  const [surgeryActive, setSurgeryActive] = useState(isSurgeryMode)
  const [savingSurgery, setSavingSurgery] = useState(false)
  const [mobileOpen,    setMobileOpen]    = useState(false)
  const [showNudge,     setShowNudge]     = useState(false)

  // Onboarding nudge: pulsa o ícone de menu no primeiro acesso
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

  function openMobileMenu() {
    setMobileOpen(true)
    setShowNudge(false)
    sessionStorage.setItem('nav-hint-seen', '1')
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  // Decisão de design (2026-05-22, requisito do PO): a exibição do menu
  // depende EXCLUSIVAMENTE de user_module_access (configurado em Gestão >
  // Usuários > Direitos de Acesso). Sem fallback de role — se o admin não
  // bloqueou explicitamente um módulo ativo da clínica para esse usuário, ele
  // vê. O array `tab.roles` é mantido na declaração como documentação do
  // default original, mas não filtra mais.
  const tabs = ALL_TABS.filter(tab => {
    // Gestão é exclusiva de admin (controle de plataforma — não faz sentido
    // delegar via user_module_access). Mantemos apenas esse caso especial.
    if (tab.href === '/dashboard/management' && userRole !== 'admin') return false
    // Centro Cirúrgico é gated pela feature flag flow_config.centro_cirurgico,
    // não por active_modules — só aparece quando a clínica o ativou.
    if (tab.href === '/dashboard/surgery') return centroCirurgico
    if (tab.moduleKey && activeModules) {
      // PROMOTED_LOCKED só "promove" itens fora do active_modules no plano FREE
      // (gatilho de upsell). Clientes Pro/Enterprise/SysMax seguem a regra
      // clássica: só vêem módulos efetivamente ativados em active_modules.
      if (planName === 'free' && !isSysmax && PROMOTED_LOCKED_FEATURES[tab.moduleKey]) return true
      return activeModules.includes(tab.moduleKey)
    }
    return true
  })

  const { open: openUpgrade } = useUpgradeModal()

  /**
   * Returns the upgrade feature key for a tab that is promoted-locked,
   * or null when the tab should just navigate normally.
   * Um tab é "promoted-locked" quando: (a) moduleKey ∈ PROMOTED_LOCKED_FEATURES
   * E (b) o módulo NÃO está em activeModules (Free real).
   */
  function promotedLockKey(tab: Tab): UpgradeFeatureKey | null {
    if (!tab.moduleKey) return null
    // Lock visual + UpgradeModal NUNCA aparece para planos pagos ou SysMax.
    if (planName !== 'free' || isSysmax) return null
    const key = PROMOTED_LOCKED_FEATURES[tab.moduleKey]
    if (!key) return null
    if (activeModules?.includes(tab.moduleKey)) return null
    return key
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  // PLG Default-Deny: tab bloqueada = plano Free + rota fora da lista branca
  const isLocked = (href: string) => {
    if (planName !== 'free' || isSysmax) return false
    return !allowedRoutes.some(r =>
      href === r || (r !== '/dashboard' && href.startsWith(r))
    )
  }

  const activeModuleKey   = getModuleFromPath(pathname)
  const activeModuleTheme = activeModuleKey ? MODULE_THEME[activeModuleKey] : null
  const hasMultipleClinics = (isSysmax && userClinics && userClinics.length >= 1) || (userClinics && userClinics.length > 1)
  const [currentStatus, setCurrentStatus] = useState<string>(clinicStatus ?? 'active')
  const [savingStatus,  setSavingStatus]  = useState(false)

  const STATUS_OPTIONS: { value: ClinicStatus; label: string; color: string }[] = [
    { value: 'active',    label: 'Ativa',     color: 'bg-green-100 text-green-700' },
    { value: 'pending',   label: 'Pendente',  color: 'bg-amber-100 text-amber-700' },
    { value: 'suspended', label: 'Bloqueada', color: 'bg-red-100 text-red-700' },
  ]

  async function handleStatusChange(newStatus: ClinicStatus) {
    setSavingStatus(true)
    const res = await updateClinicStatus(clinicId, newStatus)
    setSavingStatus(false)
    if (!res.error) setCurrentStatus(newStatus)
  }

  return (
    <>
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 print:hidden">
        {/* Brand + Clínica + Usuário */}
        <div className="mx-auto max-w-4xl px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Hambúrguer — visível apenas em mobile */}
            <button
              onClick={openMobileMenu}
              aria-label="Abrir menu de navegação"
              className={`sm:hidden flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200 text-slate-600 hover:bg-slate-100 ${
                showNudge ? 'animate-pulse ring-2 ring-blue-400 ring-offset-1 text-blue-600' : ''
              }`}
            >
              <Menu className="h-5 w-5" />
            </button>

            {hasMultipleClinics ? (
              <ClinicSwitcher
                currentClinicId={clinicId}
                clinicName={clinicName}
                clinics={userClinics}
                logoUrl={logoUrl}
              />
            ) : (
              <>
                {logoUrl ? (
                  <ImageLightbox src={logoUrl} alt={clinicName} className="h-8 w-auto max-w-[120px] object-contain rounded" />
                ) : (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                      <span className="text-sm font-bold text-white">V</span>
                    </div>
                    <div>
                      <h1 className="text-sm font-semibold text-slate-900">SysVetMax</h1>
                      <p className="text-xs text-slate-500">{clinicName}</p>
                    </div>
                  </>
                )}
                {logoUrl && <p className="text-xs text-slate-500 ml-1">{clinicName}</p>}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <OmnisearchTrigger />
            <NotificationBell clinicId={clinicId} />

            {isSysmax && (
              <select
                value={currentStatus}
                onChange={e => handleStatusChange(e.target.value as ClinicStatus)}
                disabled={savingStatus}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border-0 outline-none cursor-pointer disabled:opacity-50 ${
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
                    ? 'animate-pulse flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-md disabled:opacity-60'
                    : 'flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60'
                }
              >
                <Activity className="h-3.5 w-3.5" />
                {surgeryActive ? 'Em Cirurgia' : 'Modo Cirurgia'}
              </button>
            )}

            {isSysmax ? (
              <span className="text-sm font-semibold text-purple-700">SysMax</span>
            ) : (
              <Link href="/dashboard/profile" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Olá, <span className="font-semibold">{userName}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Navegação — oculta em mobile (substituída pelo slide-over) */}
        <div className="hidden sm:flex mx-auto max-w-4xl px-3 sm:px-6 flex-wrap items-center gap-1">
          {tabs.map((tab) => {
            const badgeCount =
              tab.href === '/dashboard/pharmacy'      ? lowStockCount        :
              tab.href === '/dashboard/whatsapp'      ? whatsappHandoffCount :
              tab.href === '/dashboard/internal-chat' ? chatUnreadCount      : 0
            const showBadge = badgeCount > 0
            const promotedKey = promotedLockKey(tab)
            const locked    = promotedKey !== null || isLocked(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                id={tab.id}
                data-testid={tab.id}
                title={locked ? `${tab.label} — disponível no Plano PRO` : undefined}
                onClick={promotedKey ? (e => { e.preventDefault(); openUpgrade(promotedKey) }) : undefined}
                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  locked
                    ? 'text-slate-400 hover:bg-slate-100/60 opacity-70'
                    : isActive(tab.href)
                      ? `${getTabTheme(tab.href).active} text-white shadow-sm`
                      : `text-slate-600 ${getTabTheme(tab.href).hover}`
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {locked && (
                  <Lock className="w-3 h-3 text-slate-400 ml-0.5 flex-shrink-0" />
                )}
                {showBadge && !locked && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })}

          <div className="flex-1" />

          <button
            onClick={async () => {
              try { await fetch('/auth/logout', { method: 'POST' }) } catch {}
              window.location.href = '/login'
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:text-slate-900 text-sm font-medium transition-all"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>

        {/* Indicador de módulo ativo */}
        <div className={`h-[3px] w-full transition-colors duration-300 ${activeModuleTheme?.active ?? 'bg-slate-200'}`} />
      </div>

      {/* ── Mobile Slide-over ──────────────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[60] bg-black/40 sm:hidden"
            onClick={closeMobileMenu}
          />

          {/* Painel lateral */}
          <div className="fixed inset-y-0 left-0 z-[70] w-[280px] bg-white shadow-2xl flex flex-col sm:hidden">
            {/* Header do painel */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                  <span className="text-xs font-bold text-white">V</span>
                </div>
                <span className="text-sm font-bold text-slate-800">Navegação</span>
              </div>
              <button
                onClick={closeMobileMenu}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lista de módulos */}
            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {tabs.map((tab) => {
                const theme      = getTabTheme(tab.href)
                const active     = isActive(tab.href)
                const promotedKey = promotedLockKey(tab)
                const locked     = promotedKey !== null || isLocked(tab.href)
                const badgeCount =
                  tab.href === '/dashboard/pharmacy'      ? lowStockCount        :
                  tab.href === '/dashboard/whatsapp'      ? whatsappHandoffCount :
                  tab.href === '/dashboard/internal-chat' ? chatUnreadCount      : 0

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    id={tab.id}
                    onClick={promotedKey
                      ? (e => { e.preventDefault(); closeMobileMenu(); openUpgrade(promotedKey) })
                      : closeMobileMenu
                    }
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      locked
                        ? 'text-slate-400 opacity-70 hover:bg-slate-50/60 font-medium'
                        : active
                          ? `${theme.active} text-white shadow-sm font-semibold`
                          : 'text-slate-600 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
                      locked ? 'bg-slate-100' : active ? 'bg-white/20' : theme.bg
                    }`}>
                      {locked
                        ? <Lock className="h-3.5 w-3.5 text-slate-400" />
                        : <tab.icon className={`h-4 w-4 ${
                            active ? 'text-white' : theme.active.replace('bg-', 'text-')
                          }`} />
                      }
                    </div>
                    <span className="flex-1">{tab.label}</span>
                    {locked && (
                      <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                        PRO
                      </span>
                    )}
                    {badgeCount > 0 && !locked && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Rodapé: nome do usuário + sair */}
            <div className="border-t border-slate-100 px-4 py-4 space-y-2">
              <p className="text-xs text-slate-400 truncate">
                Olá, <span className="font-semibold text-slate-600">{userName}</span>
              </p>
              <button
                onClick={async () => {
                  try { await fetch('/auth/logout', { method: 'POST' }) } catch {}
                  window.location.href = '/login'
                }}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
