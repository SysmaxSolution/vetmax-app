import type { PlanName, BusinessType } from '@/types'

// ── Lista branca de rotas por plano + tipo de negócio ─────────────────────────
// Default-Deny: qualquer rota fora desta lista, no plano Free, renderiza o Paywall.

export const FREE_ROUTES: Record<BusinessType, string[]> = {
  vet_clinic: [
    '/dashboard',
    '/dashboard/patients',    // Pacientes (cadastro e histórico)
    '/dashboard/reception',   // Agenda manual (appointments)
    '/dashboard/cashier',     // PDV básico
  ],
  pet_aesthetics: [
    '/dashboard',
    '/dashboard/patients',    // Pacientes
    '/dashboard/grooming',    // Banho e Tosa
    '/dashboard/cashier',     // PDV básico
  ],
}

// Sempre liberado — nunca entra no fluxo de paywall
export const ALWAYS_ALLOWED: string[] = [
  '/dashboard/profile',
  '/dashboard/settings',
]

export function isRouteAllowed(
  pathname: string,
  plan: PlanName,
  businessType: BusinessType
): boolean {
  if (plan !== 'free') return true
  if (ALWAYS_ALLOWED.some(r => pathname.startsWith(r))) return true
  const allowed = FREE_ROUTES[businessType] ?? FREE_ROUTES.vet_clinic
  return allowed.some(r =>
    pathname === r || (r !== '/dashboard' && pathname.startsWith(r + '/'))
  )
}

// ── Copy de paywall por módulo — inteligente por rota ─────────────────────────

interface PaywallCopy {
  title: string
  description: string
  feature: string
}

export const PAYWALL_COPY: Record<string, PaywallCopy> = {
  '/dashboard/financial': {
    title:       'Módulo Financeiro',
    description: 'Descubra para onde vai o seu dinheiro. DRE, fluxo de caixa, contas a pagar/receber e conciliação bancária em tempo real.',
    feature:     'Financeiro Avançado',
  },
  '/dashboard/reports': {
    title:       'Relatórios Gerenciais',
    description: 'Tome decisões com dados. Relatórios de produtividade, receitas, indicadores clínicos e exportação para Excel.',
    feature:     'Relatórios PRO',
  },
  '/dashboard/pharmacy': {
    title:       'Gestão de Estoque',
    description: 'Controle total do estoque com alertas de vencimento, validade, ponto de reposição e rastreabilidade por lote.',
    feature:     'Estoque Avançado',
  },
  '/dashboard/whatsapp': {
    title:       'WhatsApp Inteligente',
    description: 'Automatize o atendimento 24h. Bot de agendamento, lembretes automáticos e campanhas de retorno por IA.',
    feature:     'WhatsApp IA',
  },
  '/dashboard/exams': {
    title:       'Módulo de Exames',
    description: 'Solicitação digital, laudos com assinatura eletrônica e integração com laboratórios parceiros.',
    feature:     'Exames Digitais',
  },
  '/dashboard/hospitalization': {
    title:       'Internação',
    description: 'Kanban de internados com prescrição digital, evolução clínica, medições de sinais vitais e protocolo de alta médica.',
    feature:     'Internação',
  },
  '/dashboard/purchases': {
    title:       'Módulo de Compras',
    description: 'Importe NF-e de fornecedores automaticamente, gerencie pedidos e controle seu CMV com precisão.',
    feature:     'Compras e NF-e',
  },
  '/dashboard/management': {
    title:       'Gestão Avançada',
    description: 'Painel executivo com metas, desempenho por profissional, controle de acesso por função e auditoria de ações.',
    feature:     'Gestão PRO',
  },
  '/dashboard/triage': {
    title:       'Triagem Clínica',
    description: 'Fluxo de triagem com registro de sinais vitais por voz, anamnese guiada e integração com o consultório.',
    feature:     'Triagem Digital',
  },
  '/dashboard/vet': {
    title:       'Consultório Digital',
    description: 'Prontuário SOAP completo, prescrições com assinatura digital, encaminhamentos e receituário azul integrado.',
    feature:     'Consultório PRO',
  },
  '/dashboard/sales': {
    title:       'Vendas (PDV Completo)',
    description: 'PDV com catálogo de produtos e serviços, integração com estoque e emissão de NFS-e.',
    feature:     'PDV Completo',
  },
  '/dashboard/registry': {
    title:       'Cadastros Avançados',
    description: 'Cadastros de tutores, animais, fornecedores, funcionários e tabelas de preços personalizadas.',
    feature:     'Cadastros PRO',
  },
}

export function getPaywallCopy(pathname: string): PaywallCopy {
  if (PAYWALL_COPY[pathname]) return PAYWALL_COPY[pathname]
  const key = Object.keys(PAYWALL_COPY).find(k => pathname.startsWith(k + '/'))
  return key
    ? PAYWALL_COPY[key]
    : {
        title:       'Módulo Premium',
        description: 'Este módulo está disponível a partir do plano PRO.',
        feature:     'Módulo Premium',
      }
}
