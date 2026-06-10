'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  FileText, Shield, Building2, Users, Settings, LayoutGrid, Palette, Activity, Lock, CreditCard,
} from 'lucide-react'
import { MANAGEMENT_TAB_BLOCKED_ON_FREE } from '@/config/access-matrix'

const TABS = [
  { label: 'Modelos',           href: '/dashboard/management',                      icon: FileText,   exact: true,  tab: 'templates' },
  { label: 'Convênios',         href: '/dashboard/management?tab=convenios',        icon: Shield,     exact: false, tab: 'convenios' },
  { label: 'Clínica',           href: '/dashboard/management?tab=clinica',          icon: Building2,  exact: false, tab: 'clinica' },
  { label: 'Usuários',          href: '/dashboard/management?tab=usuarios',         icon: Users,      exact: false, tab: 'usuarios' },
  { label: 'Configurações',     href: '/dashboard/management?tab=configuracoes',    icon: Settings,   exact: false, tab: 'configuracoes' },
  { label: 'Assinatura',        href: '/dashboard/management?tab=assinatura',       icon: CreditCard, exact: false, tab: 'assinatura' },
  { label: 'Aparência',         href: '/dashboard/management?tab=aparencia',        icon: Palette,    exact: false, tab: 'aparencia' },
  { label: 'Monitoramento',     href: '/dashboard/management?tab=monitoramento',    icon: Activity,   exact: false, tab: 'monitoramento' },
  { label: 'Painel do Diretor', href: '/dashboard/management/kanban',               icon: LayoutGrid, exact: false, tab: 'kanban', kanban: true },
]

interface Props {
  showMonitoramento?: boolean
  planName?:          string
  /** SaaS Fase 1 — rollout restrito (Vet Teste): exibe a aba Assinatura. */
  showAssinatura?:    boolean
}

export default function ManagementNav({ showMonitoramento = false, planName = 'specialized', showAssinatura = false }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const currentTab   = searchParams.get('tab')
  const isFreePlan   = planName === 'free'

  function isActive(tab: typeof TABS[number]) {
    if (tab.kanban) return pathname.startsWith('/dashboard/management/kanban')
    if (tab.exact)  return pathname === '/dashboard/management' && !currentTab
    return pathname === '/dashboard/management' && currentTab === tab.tab
  }

  function isLocked(tab: typeof TABS[number]) {
    return isFreePlan && MANAGEMENT_TAB_BLOCKED_ON_FREE.includes(tab.tab)
  }

  const visibleTabs = TABS.filter(tab => {
    if (tab.tab === 'monitoramento') return showMonitoramento
    if (tab.tab === 'assinatura')    return showAssinatura
    return true
  })

  return (
    <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm flex-wrap">
      {visibleTabs.map(tab => {
        const active = isActive(tab)
        const locked = isLocked(tab)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={locked ? 'Disponível no Plano PRO — clique para saber mais' : tab.label}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            } ${tab.kanban ? 'text-violet-700 bg-violet-50 hover:bg-violet-100' : ''} ${tab.kanban && active ? 'bg-slate-900 text-white' : ''} ${
              locked && !active ? 'opacity-60' : ''
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {locked && <Lock className="w-3 h-3 text-amber-500" />}
          </Link>
        )
      })}
    </div>
  )
}
