'use client'

import { useState } from 'react'
import { BarChart3, Users, DollarSign, TrendingUp, PieChart, MessageCircle, ClipboardList, PawPrint, Settings } from 'lucide-react'
import PetFrequencyReport from './PetFrequencyReport'
import ProfessionalProductivityReport from './ProfessionalProductivityReport'
import FinancialReport from './FinancialReport'
import DREReport from './DREReport'
import CurvaABCReport from './CurvaABCReport'
import WhatsAppReport from './WhatsAppReport'
import OperationalReport from './OperationalReport'
import ReportsSettings from './ReportsSettings'
import type { ReportsEnabled } from '@/lib/actions/reports-g13'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportCategory {
  key:        keyof ReportsEnabled | 'settings'
  label:      string
  icon:       React.ComponentType<{ className: string }>
  description: string
  component?: React.ReactNode
}

interface Props {
  initialEnabled: ReportsEnabled
}

// ─── Sidebar item ─────────────────────────────────────────────────────────────

function SidebarItem({
  cat,
  active,
  onClick,
}: {
  cat: ReportCategory
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
        active
          ? 'bg-violet-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
      }`}
    >
      <cat.icon className="w-4 h-4 flex-shrink-0" />
      <span>{cat.label}</span>
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsWorkspace({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState<ReportsEnabled>(initialEnabled)
  const [activeKey, setActiveKey] = useState<string>('pet_frequency')

  const ALL_CATEGORIES: ReportCategory[] = [
    {
      key:         'pet_frequency',
      label:       'Periodicidade por Pet',
      icon:        PawPrint,
      description: 'Frequência de visitas por animal, com filtros por espécie e raça.',
      component:   <PetFrequencyReport />,
    },
    {
      key:         'productivity',
      label:       'Produtividade por Profissional',
      icon:        Users,
      description: 'Consultas, exames e receitas por MV no período.',
      component:   <ProfessionalProductivityReport />,
    },
    {
      key:         'financial',
      label:       'Financeiro',
      icon:        DollarSign,
      description: 'A receber, a pagar, recebido, pago e resultado do período.',
      component:   <FinancialReport />,
    },
    {
      key:         'dre',
      label:       'DRE',
      icon:        TrendingUp,
      description: 'Demonstração do Resultado do Exercício com exportação para PDF.',
      component:   <DREReport />,
    },
    {
      key:         'curva_abc',
      label:       'Curva ABC',
      icon:        PieChart,
      description: 'Classificação de produtos e serviços por participação na receita.',
      component:   <CurvaABCReport />,
    },
    {
      key:         'whatsapp',
      label:       'WhatsApp',
      icon:        MessageCircle,
      description: 'Campanhas enviadas, taxa de resposta e conversões.',
      component:   <WhatsAppReport />,
    },
    {
      key:         'operational',
      label:       'Operacional',
      icon:        ClipboardList,
      description: 'Agendamentos, internações e banho e tosa por período.',
      component:   <OperationalReport />,
    },
    {
      key:         'settings',
      label:       'Configurações',
      icon:        Settings,
      description: 'Ativar ou desativar tipos de relatório visíveis neste módulo.',
    },
  ]

  // Filter visible categories (always show Settings)
  const visibleCategories = ALL_CATEGORIES.filter(cat => {
    if (cat.key === 'settings') return true
    return enabled[cat.key as keyof ReportsEnabled]
  })

  const activeCategory = visibleCategories.find(c => c.key === activeKey)
    ?? visibleCategories[0]

  // Ensure activeKey is always valid
  const safeActiveKey = activeCategory?.key ?? 'settings'

  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-120px)]">
      {/* Sidebar — lateral em desktop, chips horizontais em mobile */}
      <aside className="w-full lg:w-56 lg:flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Relatórios</p>
            <p className="text-[10px] text-slate-400">G-13</p>
          </div>
        </div>

        {/* Mobile: chips horizontais; Desktop: lista vertical */}
        <div className="flex flex-wrap gap-2 lg:hidden">
          {visibleCategories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveKey(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                safeActiveKey === cat.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              <cat.icon className="w-3 h-3 flex-shrink-0" />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-col lg:space-y-1">
          {visibleCategories.map(cat => (
            <SidebarItem
              key={cat.key}
              cat={cat}
              active={safeActiveKey === cat.key}
              onClick={() => setActiveKey(cat.key)}
            />
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {activeCategory && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                  <activeCategory.icon className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-800">{activeCategory.label}</h1>
                  <p className="text-xs text-slate-500">{activeCategory.description}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {activeCategory.key === 'settings' ? (
                <ReportsSettings
                  enabled={enabled}
                  onSave={setEnabled}
                />
              ) : (
                activeCategory.component
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
