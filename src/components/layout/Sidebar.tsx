'use client'

/**
 * Sidebar — navegação vertical do shell único (Design System 2026 v7).
 *
 * Desktop (≥ lg): fixa à esquerda, 264px, fundo petrol escuro (teal-950).
 * Colapsável para 76px (só ícones) — persistido em localStorage.
 * Mobile (< lg): vira drawer deslizante controlado pelo hambúrguer da Topbar.
 *
 * A cor do módulo (module-theme.ts) continua sendo o wayfinding: o item
 * ativo ganha uma barra de 3px à esquerda na cor do módulo.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft, ChevronsRight, Lock, LogOut, X } from 'lucide-react'
import type { UserRole } from '@/types'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import { ClinicSwitcher } from '@/components/layout/ClinicSwitcher'
import { getTabTheme } from '@/lib/module-theme'
import { useUpgradeModal } from '@/components/upgrade/UpgradeProvider'
import {
  getNavBadgeCount, getPromotedLockKey, getVisibleNavLinks, isRouteLocked,
  type NavBadgeCounts, type NavContext,
} from '@/lib/nav-links'

export const SIDEBAR_WIDTH_EXPANDED  = 264
export const SIDEBAR_WIDTH_COLLAPSED = 76

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador',
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Farmacêutico',
  accountant:   'Contador',
  pending:      'Aguardando aprovação',
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SidebarProps {
  // Identidade
  clinicName:   string
  clinicId:     string
  logoUrl:      string | null
  userClinics?: UserClinicInfo[]
  userName:     string
  userRole:     UserRole
  isSysmax:     boolean
  // Navegação
  navContext:   NavContext
  badgeCounts:  NavBadgeCounts
  // Estado do shell (controlado pelo DashboardShell)
  collapsed:        boolean
  /** Anima a largura só depois da hidratação (evita flash animado no load). */
  animateWidth:     boolean
  onToggleCollapse: () => void
  mobileOpen:       boolean
  onCloseMobile:    () => void
}

// ─── Conteúdo compartilhado (aside desktop + drawer mobile) ──────────────────

function SidebarContent({
  clinicName, clinicId, logoUrl, userClinics, userName, userRole, isSysmax,
  navContext, badgeCounts, collapsed, onNavigate,
}: Omit<SidebarProps, 'animateWidth' | 'onToggleCollapse' | 'mobileOpen' | 'onCloseMobile'> & {
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { open: openUpgrade } = useUpgradeModal()

  const links = getVisibleNavLinks(navContext)
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  const hasMultipleClinics =
    (isSysmax && userClinics && userClinics.length >= 1) ||
    (userClinics && userClinics.length > 1)

  const clinicInitial = clinicName.charAt(0).toUpperCase() || 'V'

  return (
    <>
      {/* ── Topo: identidade da clínica ─────────────────────────────────── */}
      <div className={`flex items-center gap-2.5 border-b border-white/10 py-4 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {hasMultipleClinics && !collapsed ? (
          <ClinicSwitcher
            currentClinicId={clinicId}
            clinicName={clinicName}
            clinics={userClinics!}
            logoUrl={logoUrl}
            variant="dark"
          />
        ) : (
          <>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={clinicName}
                className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 shadow-sm">
                <span className="text-sm font-bold text-white">{clinicInitial}</span>
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{clinicName}</p>
                <p className="text-[11px] text-slate-400">SysVetMax</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Navegação de módulos ────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Módulos
          </p>
        )}
        <ul className="space-y-0.5">
          {links.map(link => {
            const theme       = getTabTheme(link.href)
            const active      = isActive(link.href)
            const promotedKey = getPromotedLockKey(link, navContext)
            const locked      = promotedKey !== null || isRouteLocked(link.href, navContext)
            const badgeCount  = locked ? 0 : getNavBadgeCount(link.href, badgeCounts)
            const Icon        = link.icon

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  id={link.id}
                  data-testid={link.id}
                  title={collapsed
                    ? (locked ? `${link.label} — disponível no Plano Premium` : link.label)
                    : (locked ? `${link.label} — disponível no Plano Premium` : undefined)}
                  onClick={promotedKey
                    ? (e => { e.preventDefault(); onNavigate?.(); openUpgrade(promotedKey) })
                    : onNavigate}
                  className={`relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors duration-150 ease-swift ${
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                  } ${
                    locked
                      ? 'text-slate-500 hover:bg-white/5 hover:text-slate-400'
                      : active
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {/* Barra de módulo — wayfinding na cor do módulo */}
                  {active && (
                    <span
                      aria-hidden
                      className={`absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${theme.active}`}
                    />
                  )}
                  <span className="relative shrink-0">
                    <Icon className="h-[18px] w-[18px]" />
                    {/* Colapsada: badge vira ponto no canto do ícone */}
                    {collapsed && badgeCount > 0 && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-teal-950" />
                    )}
                    {collapsed && locked && (
                      <Lock className="absolute -right-1.5 -top-1.5 h-3 w-3 text-slate-500" />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{link.label}</span>
                      {locked && (
                        <span className="flex items-center gap-1">
                          <Lock className="h-3 w-3 text-slate-500" />
                          <span className="rounded-full bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                            PRO
                          </span>
                        </span>
                      )}
                      {badgeCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ── Rodapé: usuário + sair ──────────────────────────────────────── */}
      <div className={`border-t border-white/10 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {isSysmax ? (
          <div className={`flex items-center gap-2.5 rounded-lg py-2 ${collapsed ? 'justify-center px-0' : 'px-3'}`} title="Sysmax Solutions">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
              S
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">SysMax</p>
                <p className="truncate text-[11px] text-slate-400">Superadmin</p>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/dashboard/profile"
            onClick={onNavigate}
            title={collapsed ? userName : 'Meu perfil'}
            className={`flex items-center gap-2.5 rounded-lg py-2 transition-colors duration-150 ease-swift hover:bg-white/5 ${collapsed ? 'justify-center px-0' : 'px-3'}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
              {(userName.charAt(0) || 'U').toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{userName}</p>
                <p className="truncate text-[11px] text-slate-400">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>
            )}
          </Link>
        )}

        <button
          onClick={async () => {
            try { await fetch('/auth/logout', { method: 'POST' }) } catch {}
            window.location.href = '/login'
          }}
          title="Sair"
          className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg py-2 text-sm font-medium text-slate-400 transition-colors duration-150 ease-swift hover:bg-red-500/10 hover:text-red-300 ${collapsed ? 'justify-center px-0' : 'px-3'}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  )
}

// ─── Sidebar (aside desktop fixa + drawer mobile) ────────────────────────────

export default function Sidebar(props: SidebarProps) {
  const { collapsed, animateWidth, onToggleCollapse, mobileOpen, onCloseMobile, ...content } = props

  return (
    <>
      {/* Desktop ≥ lg — fixa à esquerda. A largura é dirigida pela CSS var
          --sidebar-w setada no wrapper do DashboardShell (única fonte da
          largura para aside + padding do conteúdo). */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col bg-teal-950 text-slate-300 lg:flex print:hidden ${
          animateWidth ? 'transition-[width] duration-200 ease-swift' : ''
        }`}
        aria-label="Navegação principal"
      >
        <SidebarContent {...content} collapsed={collapsed} />

        {/* Alternador de colapso — rodapé da sidebar */}
        <div className={`border-t border-white/10 py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`flex w-full items-center gap-2.5 rounded-lg py-2 text-xs font-medium text-slate-500 transition-colors duration-150 ease-swift hover:bg-white/5 hover:text-white ${collapsed ? 'justify-center px-0' : 'px-3'}`}
          >
            {collapsed
              ? <ChevronsRight className="h-4 w-4 shrink-0" />
              : <><ChevronsLeft className="h-4 w-4 shrink-0" /><span>Recolher</span></>}
          </button>
        </div>
      </aside>

      {/* Mobile < lg — drawer deslizante */}
      {mobileOpen && (
        <div className="lg:hidden print:hidden">
          <div
            className="fixed inset-0 z-[60] bg-black/40 animate-fade"
            onClick={onCloseMobile}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-[70] flex w-[280px] flex-col bg-teal-950 text-slate-300 shadow-2xl animate-slide-in-left">
            <button
              onClick={onCloseMobile}
              aria-label="Fechar menu"
              className="absolute right-2 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 ease-swift hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent {...content} collapsed={false} onNavigate={onCloseMobile} />
          </div>
        </div>
      )}
    </>
  )
}
