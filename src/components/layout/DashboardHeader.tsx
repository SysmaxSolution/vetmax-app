'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Home, Stethoscope, TestTubes, Users, BarChart3, PawPrint, BedDouble, Package, Scissors, Banknote, FolderKanban, MessageCircle, ShoppingCart, Activity, ClipboardList, FileBarChart2 } from 'lucide-react'
import type { UserRole } from '@/types'
import { useState } from 'react'
import { ClinicSwitcher } from '@/components/layout/ClinicSwitcher'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import { updateClinicStatus } from '@/lib/actions/clinic-status'
import type { ClinicStatus } from '@/lib/actions/clinic-status'
import { setSurgeryMode } from '@/lib/actions/surgery-mode'
import { getTabTheme, getModuleFromPath, MODULE_THEME } from '@/lib/module-theme'

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
  { label: 'Recepção',    href: '/dashboard/reception',        icon: Home,        roles: ['receptionist','admin','vet','assistant'], moduleKey: 'reception' },
  { label: 'Caixa',       href: '/dashboard/cashier',          icon: Banknote,    roles: ['admin','accountant' as UserRole],         id: 'nav-cashier' },
  { label: 'Pacientes',   href: '/dashboard/patients',         icon: PawPrint,    roles: ['receptionist','admin','vet','assistant'] },
  { label: 'Triagem',     href: '/dashboard/triage',           icon: Users,       roles: ['assistant','admin'],                      moduleKey: 'triage' },
  { label: 'Consultório', href: '/dashboard/vet',              icon: Stethoscope, roles: ['vet','admin'],                            moduleKey: 'consultation' },
  { label: 'Exames',      href: '/dashboard/exams',            icon: TestTubes,   roles: ['assistant','vet','admin'],                moduleKey: 'exams' },
  { label: 'Internação',  href: '/dashboard/hospitalization',  icon: BedDouble,   roles: ['vet','admin','assistant'],                moduleKey: 'hospitalization' },
  { label: 'Banho e Tosa',href: '/dashboard/grooming',         icon: Scissors,    roles: ['receptionist','admin','assistant'],       moduleKey: 'grooming' },
  { label: 'Estoque',     href: '/dashboard/pharmacy',         icon: Package,     roles: ['admin'],                                  moduleKey: 'pharmacy' },
  { label: 'Vendas',      href: '/dashboard/sales',            icon: ShoppingCart,roles: ['receptionist','admin','assistant'],            moduleKey: 'sales' },
  { label: 'Cadastros',   href: '/dashboard/registry',         icon: FolderKanban,roles: ['admin','accountant' as UserRole,'receptionist'] },
  { label: 'Gestão',      href: '/dashboard/management',       icon: BarChart3,     roles: ['admin'] },
  { label: 'WhatsApp',   href: '/dashboard/whatsapp',         icon: MessageCircle,  roles: ['receptionist','admin','vet','assistant'], moduleKey: 'whatsapp_intelligent' },
  { label: 'Compras',    href: '/dashboard/purchases',        icon: ClipboardList,   roles: ['admin'],                                  moduleKey: 'purchases' },
  { label: 'Relatórios', href: '/dashboard/reports',          icon: FileBarChart2,   roles: ['admin'] },
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
  userClinics?:          UserClinicInfo[]
  isSysmax?:             boolean
  clinicStatus?:         string
  isSurgeryMode?:        boolean
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
  userClinics,
  isSysmax = false,
  clinicStatus,
  isSurgeryMode = false,
}: DashboardHeaderProps) {
  const pathname = usePathname()
  const [surgeryActive, setSurgeryActive]   = useState(isSurgeryMode)
  const [savingSurgery, setSavingSurgery]   = useState(false)

  async function handleSurgeryToggle() {
    const next = !surgeryActive
    setSurgeryActive(next)
    setSavingSurgery(true)
    const res = await setSurgeryMode(next)
    setSavingSurgery(false)
    if ('error' in res) setSurgeryActive(!next)
  }

  const tabs = ALL_TABS.filter(tab => {
    if (!tab.roles.includes(userRole)) return false
    if (tab.moduleKey && activeModules) {
      return activeModules.includes(tab.moduleKey)
    }
    return true
  })

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  const activeModuleKey = getModuleFromPath(pathname)
  const activeModuleTheme = activeModuleKey ? MODULE_THEME[activeModuleKey] : null

  const hasMultipleClinics = (isSysmax && userClinics && userClinics.length >= 1) || (userClinics && userClinics.length > 1)
  const [currentStatus, setCurrentStatus] = useState<string>(clinicStatus ?? 'active')
  const [savingStatus, setSavingStatus] = useState(false)

  const STATUS_OPTIONS: { value: ClinicStatus; label: string; color: string }[] = [
    { value: 'active',    label: 'Ativa',     color: 'bg-green-100 text-green-700' },
    { value: 'pending',   label: 'Pendente',  color: 'bg-amber-100 text-amber-700' },
    { value: 'suspended', label: 'Bloqueada', color: 'bg-red-100 text-red-700' },
  ]

  async function handleStatusChange(newStatus: ClinicStatus) {
    setSavingStatus(true)
    const res = await updateClinicStatus(clinicId, newStatus)
    setSavingStatus(false)
    if (!res.error) {
      setCurrentStatus(newStatus)
    }
  }

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-50 print:hidden">
      {/* Brand + Clínica + Usuário */}
      <div className="mx-auto max-w-4xl px-3 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
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

      {/* Navegação */}
      <div className="mx-auto max-w-4xl px-3 sm:px-6 flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const badgeCount =
            tab.href === '/dashboard/pharmacy' ? lowStockCount :
            tab.href === '/dashboard/whatsapp'  ? whatsappHandoffCount : 0
          const showBadge = badgeCount > 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              id={tab.id}
              data-testid={tab.id}
              className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive(tab.href)
                  ? `${getTabTheme(tab.href).active} text-white shadow-sm`
                  : `text-slate-600 ${getTabTheme(tab.href).hover}`
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {showBadge && (
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
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
      {/* Indicador de módulo ativo — 3px colorido na base do header */}
      <div className={`h-[3px] w-full transition-colors duration-300 ${activeModuleTheme?.active ?? 'bg-slate-200'}`} />
    </div>
  )
}
