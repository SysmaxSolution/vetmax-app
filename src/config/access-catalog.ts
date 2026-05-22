// ──────────────────────────────────────────────────────────────────────────────
// Catálogo de Direitos de Acesso (Module → Tab → Action)
//
// É a única fonte da verdade do que aparece no modal de "Direitos de Acesso".
// Persistência: cada permissão vira uma row em user_permissions_granular com:
//   module = "<moduleKey>" (módulo inteiro) OU "<moduleKey>.<tabKey>" (aba)
//   action = "view" | "create" | "edit" | "delete" | "export" | ...
//
// Para adicionar uma nova tela ao controle, basta adicionar uma entrada
// abaixo — o modal lê do catálogo dinamicamente.
// ──────────────────────────────────────────────────────────────────────────────

export type AccessAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'approve'

export const ACTION_LABELS: Record<AccessAction, string> = {
  view:    'Visualizar',
  create:  'Criar',
  edit:    'Editar',
  delete:  'Excluir',
  export:  'Exportar',
  approve: 'Aprovar',
}

export interface AccessTab {
  key:        string                // identificador único da aba dentro do módulo
  label:      string                // exibido no modal
  actions:    AccessAction[]        // ações disponíveis nesta aba
  description?: string              // texto auxiliar opcional
}

export interface AccessModule {
  key:         string               // bate com MODULE_OPTIONS / clinic.active_modules
  label:       string
  description?: string
  /** Se a aba do módulo não for granular o suficiente, basta listar actions aqui. */
  actions?:    AccessAction[]
  /** Caso o módulo tenha sub-páginas com ações distintas. */
  tabs?:       AccessTab[]
}

// ─── Catálogo principal ──────────────────────────────────────────────────────
//
// Decisão de design: módulos clínicos (vet/recepção/triagem/exames/internação/
// banho-e-tosa/farmácia) recebem actions simples por enquanto. Os módulos de
// retaguarda (financeiro/compras/configurações) recebem abas com ações distintas
// — é onde o admin mais precisa de granularidade.

export const ACCESS_CATALOG: AccessModule[] = [
  {
    key:   'reception',
    label: 'Recepção',
    tabs: [
      { key: 'queue',         label: 'Fila de Atendimento',  actions: ['view', 'create', 'edit'] },
      { key: 'checkin',       label: 'Check-in de Pet',      actions: ['view', 'create'] },
      { key: 'appointments',  label: 'Agendamentos',         actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'history',       label: 'Histórico do Dia',     actions: ['view', 'export'] },
    ],
  },
  {
    key:   'triage',
    label: 'Triagem',
    actions: ['view', 'create', 'edit'],
  },
  {
    key:   'consultation',
    label: 'Consultório',
    tabs: [
      { key: 'attendance', label: 'Atendimento Clínico', actions: ['view', 'create', 'edit'] },
      { key: 'prescription', label: 'Prescrições e Receitas', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'documents', label: 'Documentos do Pet',    actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key:   'exams',
    label: 'Exames',
    tabs: [
      { key: 'queue',    label: 'Fila de Exames',  actions: ['view', 'edit'] },
      { key: 'results',  label: 'Resultados',      actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key:   'hospitalization',
    label: 'Internação',
    tabs: [
      { key: 'board',    label: 'Kanban da Ala',  actions: ['view', 'edit'] },
      { key: 'evolution', label: 'Evolução Clínica', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'discharge', label: 'Alta',          actions: ['view', 'approve'] },
    ],
  },
  {
    key:   'pharmacy',
    label: 'Farmácia',
    tabs: [
      { key: 'stock',     label: 'Estoque',         actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'dispense',  label: 'Dispensar',       actions: ['view', 'create'] },
      { key: 'lots',      label: 'Lotes/Validade',  actions: ['view', 'edit'] },
    ],
  },
  {
    key:   'grooming',
    label: 'Banho e Tosa',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key:   'sales',
    label: 'Vendas (PDV)',
    tabs: [
      { key: 'pos',       label: 'PDV',              actions: ['view', 'create'] },
      { key: 'history',   label: 'Histórico',        actions: ['view', 'export'] },
      { key: 'discount',  label: 'Aplicar Desconto', actions: ['edit', 'approve'] },
    ],
  },
  {
    key:   'cashier',
    label: 'Caixa Central',
    tabs: [
      { key: 'sessions',  label: 'Sessões de Caixa', actions: ['view', 'create', 'edit', 'approve'] },
      { key: 'movements', label: 'Movimentações',    actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'reports',   label: 'Relatórios',       actions: ['view', 'export'] },
    ],
  },
  {
    key:   'patients',
    label: 'Pacientes',
    tabs: [
      { key: 'list',     label: 'Lista de Pets/Tutores', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'timeline', label: 'Histórico do Pet',     actions: ['view', 'export'] },
      { key: 'insurance', label: 'Convênios do Pet',    actions: ['view', 'edit'] },
    ],
  },
  {
    key:   'purchases',
    label: 'Compras',
    tabs: [
      { key: 'orders',     label: 'Pedidos de Compra',  actions: ['view', 'create', 'edit', 'delete', 'approve'] },
      { key: 'nfe_import', label: 'Importar NF-e',      actions: ['view', 'create'] },
      { key: 'suppliers',  label: 'Fornecedores',       actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key:   'financial',
    label: 'Financeiro',
    tabs: [
      { key: 'payable',     label: 'Contas a Pagar',     actions: ['view', 'create', 'edit', 'delete', 'approve'] },
      { key: 'receivable',  label: 'Contas a Receber',   actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'cashflow',    label: 'Fluxo de Caixa',     actions: ['view', 'export'] },
      { key: 'insurance',   label: 'Conciliação Petlove', actions: ['view', 'edit', 'export'] },
    ],
  },
  {
    key:   'reports',
    label: 'Relatórios',
    tabs: [
      { key: 'dre',          label: 'DRE',               actions: ['view', 'export'] },
      { key: 'professional', label: 'Por Profissional',  actions: ['view', 'export'] },
      { key: 'commission',   label: 'Comissões',         actions: ['view', 'export'] },
      { key: 'operational',  label: 'Operacional',       actions: ['view', 'export'] },
    ],
  },
  {
    key:   'registry',
    label: 'Cadastros',
    tabs: [
      { key: 'products',  label: 'Produtos',  actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'services',  label: 'Serviços',  actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'packages',  label: 'Pacotes',   actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'rooms',     label: 'Salas',     actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key:   'whatsapp',
    label: 'WhatsApp',
    actions: ['view', 'create'],
    description: 'Envio de notificações e mensagens manuais.',
  },
  {
    key:   'whatsapp_intelligent',
    label: 'WhatsApp Inteligente (IA)',
    tabs: [
      { key: 'conversations', label: 'Conversas',          actions: ['view', 'edit'] },
      { key: 'campaigns',     label: 'Campanhas',          actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'config',        label: 'Configurar Bot IA',  actions: ['view', 'edit'] },
    ],
  },
  {
    key:   'mentor',
    label: 'Mentor IA',
    actions: ['view'],
    description: 'Assistente de orientação por voz/texto.',
  },
]

// Helper: lista chave de permissão única (module ou module.tab)
export function buildPermissionKey(moduleKey: string, tabKey?: string): string {
  return tabKey ? `${moduleKey}.${tabKey}` : moduleKey
}

// Helper: dado um objeto Map<string,boolean> com chaves "moduleKey.tabKey:action",
// verifica se uma combinação está habilitada.
export function buildPermissionMapKey(moduleKey: string, tabKey: string | undefined, action: AccessAction): string {
  return `${buildPermissionKey(moduleKey, tabKey)}:${action}`
}
