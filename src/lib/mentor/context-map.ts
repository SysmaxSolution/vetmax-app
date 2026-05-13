/**
 * G-16 — Context Map estático do Mentor IA.
 * Mapeia cada rota do dashboard para o módulo, componentes e steps de mentor.
 * Gerado estaticamente (não em build-time dinâmico).
 */

export interface RouteContext {
  module: string
  description: string
  key_components: string[]
  available_actions: string[]
  /** data-mentor-step values disponíveis nesta rota */
  mentor_steps: string[]
}

export const MENTOR_CONTEXT_MAP: Record<string, RouteContext> = {
  '/dashboard/reception': {
    module: 'Recepção',
    description: 'Gerenciar chegada de pets, check-in e fila de espera',
    key_components: ['SearchBar', 'QueueCard', 'CheckInModal', 'AppointmentCard', 'KanbanToggle'],
    available_actions: ['check-in', 'agendar', 'chamar triagem', 'novo cadastro', 'agendar banho e tosa'],
    mentor_steps: [
      'reception-search-input',
      'reception-checkin-btn',
      'reception-queue',
      'reception-new-btn',
      'reception-call-triage-btn',
      'reception-kanban-toggle',
      'kanban-board',
      'kanban-col-completed',
    ],
  },

  '/dashboard/triage': {
    module: 'Triagem',
    description: 'Coletar sinais vitais e encaminhar pets ao consultório',
    key_components: ['TriageQueue', 'TriageForm', 'VoiceInput', 'VitalsCard'],
    available_actions: ['registrar peso', 'registrar temperatura', 'gravar por voz', 'encaminhar consultório'],
    mentor_steps: [
      'triage-add-btn',
      'nurse-queue',
      'triage-voice-btn',
      'triage-save-btn',
    ],
  },

  '/dashboard/vet': {
    module: 'Consultório',
    description: 'Realizar consulta clínica, preencher prontuário SOAP e definir destino do pet',
    key_components: ['VetQueue', 'SOAPEditor', 'VoiceRecorder', 'ConsultationCard'],
    available_actions: ['gravar anamnese', 'preencher SOAP', 'solicitar exame', 'internar', 'dar alta'],
    mentor_steps: [
      'vet-queue',
      'vet-notes-textarea',
      'vet-save-notes-btn',
    ],
  },

  '/dashboard/exams': {
    module: 'Exames',
    description: 'Processar requisições de exame e registrar laudos',
    key_components: ['ExamsQueue', 'ResultModal', 'ExamCard'],
    available_actions: ['registrar resultado', 'solicitar exame avulso', 'visualizar histórico'],
    mentor_steps: [
      'exams-request-btn',
      'exams-queue',
      'exams-result-textarea',
    ],
  },

  '/dashboard/grooming': {
    module: 'Banho e Tosa',
    description: 'Gerenciar sessões de banho e tosa em Kanban e registrar pagamentos',
    key_components: ['GroomingKanban', 'SessionCard', 'VoiceInput', 'PaymentModal'],
    available_actions: ['confirmar chegada', 'iniciar banho', 'iniciar tosa', 'entregar', 'cancelar sessão'],
    mentor_steps: [
      'grooming-queue',
      'grooming-voice-btn',
      'grooming-observations-textarea',
      'grooming-save-record-btn',
    ],
  },

  '/dashboard/grooming/schedule': {
    module: 'Banho e Tosa — Agenda',
    description: 'Visualizar e gerenciar agendamentos futuros de banho e tosa em calendário',
    key_components: ['GroomingCalendar', 'ScheduleCard'],
    available_actions: ['agendar sessão', 'cancelar agendamento'],
    mentor_steps: [],
  },

  '/dashboard/hospitalization': {
    module: 'Internação',
    description: 'Gerenciar animais internados em Kanban por ala clínica',
    key_components: ['HospitalizationKanban', 'PatientCard', 'EvolutionModal', 'DischargeModal'],
    available_actions: ['admitir', 'registrar evolução', 'mover entre alas', 'dar alta hospitalar'],
    mentor_steps: [
      'hospitalization-list',
      'hosp-save-evolution-btn',
      'hosp-discharge-btn',
    ],
  },

  '/dashboard/cashier': {
    module: 'Caixa Central',
    description: 'Controlar pagamentos, sessão diária do caixa e saídas financeiras',
    key_components: ['CashierTabs', 'InvoiceCard', 'PaymentModal', 'SessionPanel'],
    available_actions: ['registrar pagamento', 'abrir caixa', 'fechar caixa', 'adicionar saída'],
    mentor_steps: [],
  },

  '/dashboard/management': {
    module: 'Gestão',
    description: 'Configurar clínica, gerenciar usuários, templates e catálogo de serviços',
    key_components: ['ManagementTabs', 'UserList', 'TemplateEditor', 'CatalogList', 'ModuleToggles'],
    available_actions: ['convidar usuário', 'editar template', 'ativar módulo', 'configurar clínica'],
    mentor_steps: [],
  },

  '/dashboard/management/kanban': {
    module: 'Gestão — Kanban',
    description: 'Visão Kanban dos atendimentos em andamento no dia',
    key_components: ['KanbanBoard', 'ConsultationCard'],
    available_actions: ['mover cards', 'visualizar status'],
    mentor_steps: [
      'kanban-board',
      'kanban-col-completed',
    ],
  },

  '/dashboard/pharmacy': {
    module: 'Farmácia',
    description: 'Controlar estoque de medicamentos, dispensar e repor itens',
    key_components: ['StockList', 'DispenseModal', 'RestockModal'],
    available_actions: ['dispensar medicamento', 'repor estoque', 'adicionar medicamento', 'ajustar quantidade'],
    mentor_steps: [],
  },

  '/dashboard/patients': {
    module: 'Pacientes',
    description: 'Diretório completo de pets — busca, histórico e cadastro',
    key_components: ['PatientSearch', 'PetCard', 'PetTimelineModal', 'NewPetModal'],
    available_actions: ['cadastrar pet', 'editar cadastro', 'ver histórico', 'buscar por CPF'],
    mentor_steps: [
      'btn-novo-paciente',
      'pet-name-input',
      'pet-species-select',
      'pet-breed-input',
      'pet-reproductive-select',
      'pet-behavior-tags',
      'pet-allergies',
      'pet-chronic-diseases',
      'pet-microchip',
    ],
  },

  '/dashboard/patients/tutor': {
    module: 'Pacientes — Tutor',
    description: 'Perfil completo do tutor com todos os pets vinculados',
    key_components: ['TutorProfile', 'PetList'],
    available_actions: ['editar tutor', 'ver pet'],
    mentor_steps: [],
  },

  '/dashboard/purchases': {
    module: 'Compras',
    description: 'Importar NF-e XML, gerenciar fornecedores e consultar NCM/EAN',
    key_components: ['PurchaseList', 'NFeImport', 'SupplierList'],
    available_actions: ['importar XML', 'cadastrar fornecedor', 'exportar ZIP'],
    mentor_steps: [],
  },

  '/dashboard/whatsapp': {
    module: 'WhatsApp',
    description: 'Canal de WhatsApp integrado — conversas, notificações e vinculação de contatos',
    key_components: ['ConversationList', 'ChatPanel', 'QRCodeDisplay'],
    available_actions: ['responder mensagem', 'vincular tutor', 'conectar via QR'],
    mentor_steps: [],
  },

  '/dashboard/profile': {
    module: 'Perfil',
    description: 'Configurações pessoais do usuário — nome, senha, CRM-V',
    key_components: ['ProfileForm'],
    available_actions: ['alterar senha', 'atualizar CRM-V'],
    mentor_steps: [],
  },
}

/**
 * Retorna o contexto da rota mais específica que corresponde ao pathname.
 * Ex: /dashboard/patients/tutor/123 → retorna contexto de /dashboard/patients/tutor
 */
export function getRouteContext(pathname: string): RouteContext | null {
  // Tenta match exato primeiro
  if (MENTOR_CONTEXT_MAP[pathname]) return MENTOR_CONTEXT_MAP[pathname]

  // Match pelo prefixo mais longo
  const keys = Object.keys(MENTOR_CONTEXT_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (pathname.startsWith(key)) return MENTOR_CONTEXT_MAP[key]
  }

  return null
}

/**
 * Serializa o contexto da rota para injeção no system prompt do Mentor IA.
 */
export function serializeRouteContext(ctx: RouteContext): string {
  return [
    `Módulo atual: ${ctx.module}`,
    `Descrição: ${ctx.description}`,
    `Ações disponíveis: ${ctx.available_actions.join(', ')}`,
    ctx.mentor_steps.length > 0
      ? `Elementos guiáveis (data-mentor-step): ${ctx.mentor_steps.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}
