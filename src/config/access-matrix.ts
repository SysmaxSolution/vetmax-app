import type { PlanName, BusinessType } from '@/types'

// ── Lista branca de rotas por plano + tipo de negócio ─────────────────────────
// Default-Deny: qualquer rota fora desta lista, no plano Free, renderiza o Paywall.

export const FREE_ROUTES: Record<BusinessType, string[]> = {
  vet_clinic: [
    '/dashboard',
    '/dashboard/patients',    // Pacientes
    '/dashboard/reception',   // Recepção
    '/dashboard/cashier',     // Caixa
    '/dashboard/vet',         // Consultório
    '/dashboard/management',  // Gestão (com tabs restritas — ver MANAGEMENT_TAB_BLOCKED_ON_FREE)
  ],
  pet_aesthetics: [
    '/dashboard',
    '/dashboard/patients',    // Pacientes
    '/dashboard/reception',   // Recepção
    '/dashboard/cashier',     // Caixa
    '/dashboard/grooming',    // Banho e Tosa
    '/dashboard/management',  // Gestão (com tabs restritas)
  ],
}

// Sempre liberado — nunca entra no fluxo de paywall
export const ALWAYS_ALLOWED: string[] = [
  '/dashboard/profile',
  '/dashboard/settings',
]

// ── Tabs da Gestão bloqueadas no plano Free ───────────────────────────────────
// Aplica-se a /dashboard/management?tab=<tab>
// Refator Freemium 2026-05-26: 'configuracoes' foi liberada — o paywall agora
// é granular dentro de Configurações > Acesso, módulo a módulo. SysMax
// continua mexendo via Master Key; admin Free vê o catálogo e cada módulo
// PRO dispara UpgradeModal.
export const MANAGEMENT_TAB_BLOCKED_ON_FREE: string[] = [
  'templates',       // Modelos de Documentos
]

// ── Módulos incluídos no plano Free por business_type ────────────────────────
// Espelha o que o trigger trg_clinics_freemium_seed (migration 0189) escreve
// em clinics.active_modules para clínicas novas. ModulesTab usa este mapa
// para marcar quais toggles são "Incluso" vs "PRO". Edite os dois juntos
// quando precisar reabrir a lista do Free.
export const FREE_MODULES: Record<BusinessType, string[]> = {
  vet_clinic:     ['cashier', 'reception', 'patients', 'consultation', 'management'],
  pet_aesthetics: ['cashier', 'reception', 'patients', 'grooming',     'management'],
}

export function isModuleFree(moduleKey: string, businessType: BusinessType): boolean {
  return (FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic).includes(moduleKey)
}

export function isManagementTabAllowed(tab: string | null, plan: PlanName): boolean {
  if (plan !== 'free') return true
  const normalized = tab ?? 'templates' // default tab é "templates"
  return !MANAGEMENT_TAB_BLOCKED_ON_FREE.includes(normalized)
}

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
  '/dashboard/surgery': {
    title:       'Centro Cirúrgico',
    description: 'Bloco cirúrgico dedicado: Kanban Preparo→Sala→RPA, ficha cirúrgica single-page, ficha anestésica, relatório por voz e kits com baixa automática de estoque.',
    feature:     'Centro Cirúrgico',
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
  '/dashboard/internal-chat': {
    title:       'Chat Interno',
    description: 'Mensagens em tempo real entre a equipe, salas automáticas por consulta/internação/cirurgia, anexos e sininho consolidado.',
    feature:     'Chat Interno',
  },
  '/dashboard/registry': {
    title:       'Cadastros Avançados',
    description: 'Cadastros de tutores, animais, fornecedores, funcionários e tabelas de preços personalizadas.',
    feature:     'Cadastros PRO',
  },
  // ── Sub-tabs bloqueadas da Gestão ────────────────────────────────────────────
  '/dashboard/management?tab=templates': {
    title:       'Modelos de Documentos',
    description: 'Crie e edite modelos de laudos, receitas, termos e encaminhamentos com campos dinâmicos e assinatura digital.',
    feature:     'Modelos de Documentos',
  },
  '/dashboard/management?tab=configuracoes': {
    title:       'Configurações da Clínica',
    description: 'Configure horário de funcionamento, fluxo de atendimento, integrações, IA, transcrição por voz e mais.',
    feature:     'Configurações Avançadas',
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
