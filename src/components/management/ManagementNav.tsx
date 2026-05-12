'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  FileText, BarChart3, Shield, Building2, Users, Settings, LayoutGrid, Palette, Activity,
} from 'lucide-react'

const TABS = [
  { label: 'Modelos',           href: '/dashboard/management',                      icon: FileText,   exact: true },
  { label: 'Tabela de Preços',  href: '/dashboard/management?tab=catalogo',         icon: BarChart3,  exact: false, tab: 'catalogo' },
  { label: 'Convênios',         href: '/dashboard/management?tab=convenios',        icon: Shield,     exact: false, tab: 'convenios' },
  { label: 'Clínica',           href: '/dashboard/management?tab=clinica',          icon: Building2,  exact: false, tab: 'clinica' },
  { label: 'Usuários',          href: '/dashboard/management?tab=usuarios',         icon: Users,      exact: false, tab: 'usuarios' },
  { label: 'Configurações',     href: '/dashboard/management?tab=configuracoes',    icon: Settings,   exact: false, tab: 'configuracoes' },
  { label: 'Aparência',         href: '/dashboard/management?tab=aparencia',        icon: Palette,    exact: false, tab: 'aparencia' },
  { label: 'Monitoramento',     href: '/dashboard/management?tab=monitoramento',    icon: Activity,   exact: false, tab: 'monitoramento' },
  { label: 'Painel do Diretor', href: '/dashboard/management/kanban',               icon: LayoutGrid, exact: false, kanban: true },
]

export default function ManagementNav({ showMonitoramento = false }: { showMonitoramento?: boolean }) {
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const currentTab  = searchParams.get('tab')

  function isActive(tab: typeof TABS[number]) {
    if (tab.kanban) return pathname.startsWith('/dashboard/management/kanban')
    if (tab.exact)  return pathname === '/dashboard/management' && !currentTab
    return pathname === '/dashboard/management' && currentTab === tab.tab
  }

  const visibleTabs = TABS.filter(tab => tab.tab !== 'monitoramento' || showMonitoramento)

  return (
    <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm flex-wrap">
      {visibleTabs.map(tab => {
        const active = isActive(tab)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            } ${tab.kanban ? 'text-violet-700 bg-violet-50 hover:bg-violet-100' : ''} ${tab.kanban && active ? 'bg-slate-900 text-white' : ''}`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
