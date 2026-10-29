'use client'

import { useState } from 'react'
import { BarChart3, Users, DollarSign, TrendingUp, PieChart, MessageCircle, ClipboardList, PawPrint, Percent, ShieldAlert, CalendarClock, LineChart, Layers, Boxes, LayoutDashboard, Sparkles, Barcode, FlaskConical, FileText } from 'lucide-react'
import BoletoMovementReport from '@/components/financial/BoletoMovementReport'
import PetFrequencyReport from './PetFrequencyReport'
import BIDashboard from './BIDashboard'
import SmartReportBuilder from './SmartReportBuilder'
import ControlledBookReport from './ControlledBookReport'
import ExamRejectionsReport from './ExamRejectionsReport'
import AgingReport from './AgingReport'
import ClientStatementReport from './ClientStatementReport'
import CashflowProjectionReport from './CashflowProjectionReport'
import RevenueBreakdownReport from './RevenueBreakdownReport'
import StockPositionReport from './StockPositionReport'
import ClientsReport from './ClientsReport'
import DREByCompanyReport from './DREByCompanyReport'
import ProfessionalProductivityReport from './ProfessionalProductivityReport'
import FinancialReport from './FinancialReport'
import DREReport from './DREReport'
import CurvaABCReport from './CurvaABCReport'
import WhatsAppReport from './WhatsAppReport'
import OperationalReport from './OperationalReport'
import CommissionsReport from './CommissionsReport'
import type { ReportsEnabled } from '@/lib/actions/reports-g13'
import { useUsaBoleto } from '@/components/providers/ClinicConfigProvider'
import { isReportVisible } from '@/lib/reports/visibility'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleKey = 'painel' | 'financeiro' | 'clinico' | 'operacional' | 'estoque' | 'comercial' | 'regulatorio'
const MODULE_ORDER: { key: ModuleKey; label: string }[] = [
  { key: 'painel', label: 'Painel' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'clinico', label: 'Clínico' },
  { key: 'operacional', label: 'Operacional' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'regulatorio', label: 'Regulatório' },
]

interface ReportCategory {
  key:        keyof ReportsEnabled | 'commissions' | 'controlled' | 'aging' | 'cashflow' | 'revenue' | 'stock_position' | 'clients' | 'dre_company' | 'dashboard' | 'smart' | 'boleto_movement' | 'exam_rejections' | 'client_statement'
  label:      string
  icon:       React.ComponentType<{ className: string }>
  description: string
  component?: React.ReactNode
}

// Módulo de cada relatório (para agrupar a navegação por módulo).
const CATEGORY_MODULE: Record<string, ModuleKey> = {
  dashboard: 'painel', smart: 'painel',
  financial: 'financeiro', dre: 'financeiro', curva_abc: 'financeiro', commissions: 'financeiro',
  cashflow: 'financeiro', revenue: 'financeiro', dre_company: 'financeiro', aging: 'financeiro', boleto_movement: 'financeiro',
  pet_frequency: 'clinico', productivity: 'clinico',
  operational: 'operacional', stock_position: 'estoque',
  whatsapp: 'comercial', clients: 'comercial', controlled: 'regulatorio',
  exam_rejections: 'operacional',
  client_statement: 'financeiro',
}

interface Props {
  initialEnabled: ReportsEnabled
  /** flow_config.usa_fluxo_rejeicao_exame — liga o relatorio de nao realizados. */
  usesExamRejection?: boolean
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

export default function ReportsWorkspace({ initialEnabled, usesExamRejection = false }: Props) {
  const [enabled, setEnabled] = useState<ReportsEnabled>(initialEnabled)
  // O extrato de boletos acompanha a rotina de Boletos (flow_config.usa_boleto).
  const usaBoleto = useUsaBoleto()
  const [activeKey, setActiveKey] = useState<string>('dashboard')

  const ALL_CATEGORIES: ReportCategory[] = [
    {
      key:         'dashboard',
      label:       'Painel (BI)',
      icon:        LayoutDashboard,
      description: 'Visão geral em gráficos: faturamento, recebimentos, a receber, categorias, aging e top clientes.',
      component:   <BIDashboard />,
    },
    {
      key:         'smart',
      label:       'Relatório Inteligente (IA)',
      icon:        Sparkles,
      description: 'Descreva em português o relatório que precisa — a IA interpreta e o sistema calcula (a IA nunca gera número).',
      component:   <SmartReportBuilder />,
    },
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
      key:         'commissions',
      label:       'Comissões',
      icon:        Percent,
      description: 'Comissões pagas e pendentes por profissional, com filtros por status e período.',
      component:   <CommissionsReport />,
    },
    {
      key:         'cashflow',
      label:       'Fluxo de Caixa',
      icon:        LineChart,
      description: 'Realizado × projetado por mês, com entradas, saídas e saldo acumulado.',
      component:   <CashflowProjectionReport />,
    },
    {
      key:         'revenue',
      label:       'Faturamento por Dimensão',
      icon:        Layers,
      description: 'Receita reconhecida agrupada por categoria, forma de pagamento, empresa (CNPJ) ou mês, com participação (%).',
      component:   <RevenueBreakdownReport />,
    },
    {
      key:         'dre_company',
      label:       'DRE por CNPJ',
      icon:        TrendingUp,
      description: 'Resultado por empresa faturante (receita, deduções, despesas e resultado) + consolidado do grupo.',
      component:   <DREByCompanyReport />,
    },
    {
      key:         'clients',
      label:       'Clientes (Novos × Recorrentes)',
      icon:        Users,
      description: 'Novos vs recorrentes, ticket médio e faturamento por cliente no período.',
      component:   <ClientsReport />,
    },
    {
      key:         'client_statement',
      label:       'Extrato do Cliente',
      icon:        FileText,
      description: 'Pago × em aberto de um tutor, clinica parceira ou protetor no periodo, com o operador que deu baixa, quebra por empresa faturante e PDF para entregar ou enviar.',
      component:   <ClientStatementReport />,
    },
    {
      key:         'stock_position',
      label:       'Posição de Estoque',
      icon:        Boxes,
      description: 'Ruptura (abaixo do mínimo), validade próxima e valor imobilizado, com filtro por situação.',
      component:   <StockPositionReport />,
    },
    {
      key:         'aging',
      label:       'Aging (A Receber/Pagar)',
      icon:        CalendarClock,
      description: 'Títulos pendentes por faixa de atraso (a vencer / 0–30 / 31–60 / 61–90 / 90+), com drill-down sintético → analítico por cliente/fornecedor.',
      component:   <AgingReport />,
    },
    {
      key:         'boleto_movement',
      label:       'Movimentação de Boletos',
      icon:        Barcode,
      description: 'Trilha completa dos boletos: emissão, 2ª via, envios, consultas, instruções, retornos do banco, pagamentos e baixas — com quem fez e quando.',
      component:   <BoletoMovementReport />,
    },
    {
      key:         'controlled',
      label:       'Livro de Controlados',
      icon:        ShieldAlert,
      description: 'Razão por substância (humano × veterinário) — entradas, saídas, perdas e saldo. Retroativo e impressão para a Vigilância (Portaria 344/1998).',
      component:   <ControlledBookReport />,
    },
    // Só existe para clínicas com o Fluxo de Rejeição de Exame ligado.
    ...(usesExamRejection ? [{
      key:         'exam_rejections' as const,
      label:       'Exames Não Realizados',
      icon:        FlaskConical,
      description: 'Exames não realizados e refeitos, com o motivo de cada um, o cliente e o valor que não foi cobrado. Complementa o boleto, que cobra só os realizados.',
      component:   <ExamRejectionsReport />,
    }] : []),
  ]

  // Tarefa 0 — o ALWAYS_ON foi REMOVIDO. Ele forçava 12 relatórios ignorando o
  // reports_enabled que já existia por clínica, e como as chaves nem estavam em
  // ReportsEnabled o admin não conseguia desligá-los. Agora todo relatório
  // obedece à configuração (Gestão > Configurações > Relatórios).
  // A única regra extra: relatório que pertence a uma ROTINA some junto com a
  // rotina — não faz sentido esconder a aba Boletos e manter o extrato dela.
  const visibleCategories = ALL_CATEGORIES.filter(cat =>
    isReportVisible(cat.key as string, enabled as unknown as Record<string, boolean | undefined>, {
      usaBoleto, usesExamRejection,
    }),
  )

  const activeCategory = visibleCategories.find(c => c.key === activeKey)
    ?? visibleCategories[0]

  // Agrupa por módulo (na ordem de MODULE_ORDER), omitindo módulos sem itens.
  const grouped = MODULE_ORDER
    .map(m => ({ ...m, cats: visibleCategories.filter(c => (CATEGORY_MODULE[c.key] ?? 'painel') === m.key) }))
    .filter(g => g.cats.length > 0)

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

        {/* Mobile: chips por módulo; Desktop: lista vertical com seções de módulo */}
        <div className="lg:hidden space-y-2">
          {grouped.map(g => (
            <div key={g.key}>
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.cats.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveKey(cat.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      safeActiveKey === cat.key ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                    }`}
                  >
                    <cat.icon className="w-3 h-3 flex-shrink-0" />
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block lg:space-y-3">
          {grouped.map(g => (
            <div key={g.key}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
              <div className="flex flex-col space-y-1">
                {g.cats.map(cat => (
                  <SidebarItem key={cat.key} cat={cat} active={safeActiveKey === cat.key} onClick={() => setActiveKey(cat.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto animate-enter">
        {activeCategory && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                  <activeCategory.icon className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900">{activeCategory.label}</h1>
                  <p className="text-xs text-slate-500">{activeCategory.description}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {activeCategory.component}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
