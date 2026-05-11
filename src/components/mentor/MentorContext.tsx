'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

// ─── Tour Step ────────────────────────────────────────────────────────────────

export interface TourStep {
  /** data-mentor-step value to locate the DOM element */
  target: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  ctaLabel?: string
  ctaHref?: string
  /**
   * Se true, o tour avança automaticamente quando o usuário interage com o campo
   * (blur em input/textarea, change em select).
   */
  autoAdvance?: boolean
  /**
   * Se true, este passo é um botão/gatilho que abre algo (modal, drawer).
   * O tour aguarda o próximo alvo aparecer no DOM via MutationObserver
   * antes de avançar — o usuário clica normalmente no elemento iluminado.
   */
  waitForNext?: boolean
  /**
   * Texto curto exibido no balão quando o usuário foca neste campo
   * fora da ordem do tour (modo exploratório). Se omitido, usa `body`.
   */
  info?: string
  /**
   * Se true, este passo é obrigatório — após exploração fora-de-ordem,
   * o Mentor retorna o spotlight para cá quando o usuário sai do campo visitado.
   */
  required?: boolean
}

// ─── Tour Meta ────────────────────────────────────────────────────────────────

export interface TourMeta {
  /** Rota onde este tour deve ser iniciado. MentorChat navega aqui antes de disparar. */
  requiredPath?: string
  steps: TourStep[]
}

// ─── Tours — mapeados para o SysVetMax ──────────────────────────────────────────

export const TOURS: Record<string, TourMeta> = {
  recepcao: {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:      'reception-search-input',
        title:       'Busca de Tutor ou Pet',
        body:        'Digite o CPF, nome do tutor ou nome do pet. Quando os resultados aparecerem, clique no pet desejado para expandir as opções de atendimento.',
        placement:   'bottom',
        info:        'Campo de busca — pesquise por CPF, nome do tutor ou nome do pet.',
        waitForNext: true,
      },
      {
        target:    'reception-checkin-btn',
        title:     'Confirmar Check-in',
        body:      'Clique em Check-in para registrar a chegada do pet. Ele entra imediatamente na Fila de Espera aguardando o auxiliar de triagem.',
        placement: 'bottom',
        info:      'Botão Check-in — registra a chegada e adiciona o pet à fila de espera.',
      },
      {
        target:    'reception-queue',
        title:     'Fila de Espera',
        body:      'O pet aparece aqui após o check-in. Quando o auxiliar de triagem estiver disponível, clique em "Chamar Triagem →" no card do pet para encaminhá-lo.',
        placement: 'right',
        info:      'Fila de espera — pets aguardando triagem em ordem de chegada.',
      },
      {
        target:    'reception-new-btn',
        title:     'Tutor Não Cadastrado?',
        body:      'Se o tutor não aparecer na busca, clique aqui (ou pressione Alt+N) para registrar um novo tutor e pet antes de fazer o check-in.',
        placement: 'bottom',
        info:      'Botão de novo cadastro — cria tutor + pet e já encaminha para check-in.',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  'sala-espera': {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:    'reception-queue',
        title:     'Fila de Espera',
        body:      'Pets que fizeram check-in aguardam triagem aqui, em ordem de chegada. Cada card mostra nome, espécie e horário de chegada.',
        placement: 'right',
        info:      'Fila de espera — pets aguardando triagem em ordem de chegada.',
      },
      {
        target:    'reception-call-triage-btn',
        title:     'Chamar para Triagem',
        body:      'Clique neste botão (ou dê duplo clique no card) para encaminhar o pet ao auxiliar de triagem. O status é atualizado em tempo real.',
        placement: 'left',
        info:      'Botão Chamar Triagem — move o pet da recepção para a fila de triagem.',
      },
      {
        target:    'reception-new-btn',
        title:     'Novo Check-in',
        body:      'Para adicionar um novo pet à fila, use a busca acima para localizar o tutor ou clique aqui para criar um novo cadastro.',
        placement: 'bottom',
        info:      'Botão de novo cadastro — cria tutor + pet e já encaminha para check-in.',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  triagem: {
    requiredPath: '/dashboard/triage',
    steps: [
      {
        target:    'triage-add-btn',
        title:     'Adicionar Pet Manualmente',
        body:      'Para pets sem check-in prévio na recepção, clique aqui para incluí-los diretamente na fila de triagem.',
        placement: 'bottom',
        info:      'Adiciona pet sem check-in prévio diretamente à fila de triagem.',
      },
      {
        target:      'nurse-queue',
        title:       'Fila de Triagem',
        body:        'Pets encaminhados pela recepção aparecem aqui. Clique no nome de um pet para abrir a ficha de triagem e registrar os sinais vitais.',
        placement:   'right',
        info:        'Fila de triagem — clique em um animal para abrir a ficha.',
        waitForNext: true,
      },
      {
        target:    'triage-voice-btn',
        title:     'Registrar Sinais Vitais por Voz',
        body:      'Com a ficha aberta, clique no microfone e fale os sinais vitais: peso, temperatura e frequências. A IA preenche os campos automaticamente.',
        placement: 'bottom',
        info:      'Área de triagem por voz — disponível ao abrir a ficha de um animal.',
      },
      {
        target:    'triage-save-btn',
        title:     'Concluir Triagem',
        body:      'Após confirmar peso (kg) e temperatura (°C) obrigatórios, clique aqui para enviar o pet à fila do médico veterinário.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  consulta: {
    requiredPath: '/dashboard/vet',
    steps: [
      {
        target:      'vet-queue',
        title:       'Fila do Consultório',
        body:        'Pets com triagem concluída aguardam aqui. Clique no nome do pet para abrir o prontuário eletrônico e iniciar o atendimento.',
        placement:   'bottom',
        info:        'Fila do consultório — clique em um pet para abrir o prontuário.',
        waitForNext: true,
      },
      {
        target:      'vet-notes-textarea',
        title:       'Anotações Clínicas (SOAP)',
        body:        'Com o prontuário aberto, registre a evolução clínica. Digite diretamente ou clique no microfone para ditar. Aceita formatação SOAP.',
        placement:   'right',
        info:        'Campo de anotações — suporta entrada por voz e digitação direta.',
        autoAdvance: true,
      },
      {
        target:    'vet-save-notes-btn',
        title:     'Salvar Prontuário',
        body:      'Após revisar as anotações clínicas, clique aqui para salvar. O registro fica vinculado ao histórico do pet para consultas futuras.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  exames: {
    requiredPath: '/dashboard/exams',
    steps: [
      {
        target:    'exams-request-btn',
        title:     'Solicitar Exame',
        body:      'Precisa criar uma solicitação avulsa? Clique aqui para requisitar qualquer exame para um pet cadastrado.',
        placement: 'bottom',
        info:      'Botão de solicitação — cria uma requisição de exame manual.',
      },
      {
        target:      'exams-queue',
        title:       'Fila de Exames',
        body:        'Pets encaminhados pelo MV aparecem aqui. Clique em "Registrar Resultado" em qualquer card para abrir o formulário de laudo.',
        placement:   'bottom',
        info:        'Fila de exames — pets aguardando laudo do laboratório.',
        waitForNext: true,
      },
      {
        target:      'exams-result-textarea',
        title:       'Registrar Laudo',
        body:        'Digite o resultado do exame neste campo. Após salvar, o status é atualizado e o laudo fica disponível no prontuário do pet.',
        placement:   'top',
        ctaLabel:    'Entendido — finalizar tour',
        autoAdvance: true,
      },
    ],
  },

  internacao: {
    requiredPath: '/dashboard/hospitalization',
    steps: [
      {
        target:      'hospitalization-list',
        title:       'Quadro de Internados',
        body:        'Pets internados aparecem neste Kanban por ala: Observação, Enfermaria, UTI e Alta Pronta. Arraste para mover entre alas ou clique em um card para abrir o prontuário de internação.',
        placement:   'bottom',
        info:        'Kanban de internação — cada coluna é uma ala clínica.',
        waitForNext: true,
      },
      {
        target:    'hosp-save-evolution-btn',
        title:     'Registrar Evolução Clínica',
        body:      'Com o prontuário de internação aberto, registre aqui a evolução diária do pet: sinais vitais, medicações e observações. Clique em Salvar.',
        placement: 'top',
        info:      'Registra evolução clínica do internado — disponível ao clicar em um card.',
      },
      {
        target:    'hosp-discharge-btn',
        title:     'Dar Alta Hospitalar',
        body:      'Quando o pet estiver estável e com status "Alta Pronta", o botão Dar Alta aparece no card. Clique para iniciar o processo de alta hospitalar.',
        placement: 'top',
        info:      'Botão Dar Alta — aparece apenas para pets com status "Alta Pronta".',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  grooming: {
    requiredPath: '/dashboard/grooming',
    steps: [
      {
        target:      'grooming-queue',
        title:       'Kanban de Banho e Tosa',
        body:        'Pets agendados ou em serviço aparecem neste quadro. Arraste os cards para avançar nas etapas ou clique em um card para abrir o registro do serviço.',
        placement:   'bottom',
        info:        'Kanban de grooming — acompanhe o fluxo de cada pet em tempo real.',
        waitForNext: true,
      },
      {
        target:    'grooming-voice-btn',
        title:     'Registro por Voz',
        body:      'Com o card aberto, clique no microfone para registrar serviços, produtos e observações por voz. A IA transcreve e preenche os campos automaticamente.',
        placement: 'bottom',
        info:      'Botão de voz — disponível ao abrir um card de grooming.',
      },
      {
        target:      'grooming-observations-textarea',
        title:       'Observações do Serviço',
        body:        'Registre aqui observações sobre o serviço realizado, comportamento do pet ou instruções especiais do tutor. Preencha e avance.',
        placement:   'top',
        info:        'Campo de observações do serviço de grooming.',
        autoAdvance: true,
      },
      {
        target:    'grooming-save-record-btn',
        title:     'Salvar Registro',
        body:      'Após preencher serviços, produtos e observações, clique aqui para salvar o registro completo do atendimento de banho e tosa.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  alta: {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:      'reception-kanban-toggle',
        title:       'Ativar Visualização Kanban',
        body:        'Clique em "Kanban" para ver o quadro completo de atendimentos do dia, com todas as etapas do fluxo clínico em uma única tela.',
        placement:   'bottom',
        info:        'Botão Kanban — ativa a visão de quadro completo da recepção.',
        waitForNext: true,
      },
      {
        target:    'kanban-board',
        title:     'Quadro de Atendimentos',
        body:      'Cada coluna é uma etapa: Agendado, Recepção, Triagem, Consultório, Exames e Alta. Clique em qualquer card para ver os detalhes do atendimento.',
        placement: 'bottom',
        info:      'Kanban do dia — visão geral de todos os atendimentos em andamento.',
      },
      {
        target:    'kanban-col-completed',
        title:     'Coluna Alta',
        body:      'Pets com prontuário finalizado pelo MV e pagamento confirmado chegam aqui. O atendimento está encerrado e o tutor pode ser avisado.',
        placement: 'bottom',
        info:      'Coluna Alta — atendimentos finalizados com pagamento confirmado.',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  'cadastro-pet': {
    requiredPath: '/dashboard/patients',
    steps: [
      {
        target:      'btn-novo-paciente',
        title:       'Abrir Cadastro de Novo Pet',
        body:        'Clique neste botão para abrir o formulário de cadastro. O Mentor vai te guiar campo a campo.',
        info:        'Botão de novo cadastro — clique para abrir o formulário do pet.',
        placement:   'bottom',
        waitForNext: true,
      },
      {
        target:      'pet-name-input',
        title:       'Nome do Pet',
        body:        'Digite o nome do animal e pressione Tab para avançar. Campo obrigatório — é a identificação principal no sistema.',
        info:        'Nome do pet — identificação principal. Ex: "Bolinha", "Mia".',
        placement:   'bottom',
        autoAdvance: true,
        required:    true,
      },
      {
        target:      'pet-species-select',
        title:       'Espécie',
        body:        'Selecione a espécie no menu. Isso define os protocolos clínicos, vacinas e dosagens disponíveis no sistema.',
        info:        'Espécie — define protocolos clínicos e vacinas aplicáveis. Ex: Cão, Gato, Ave.',
        placement:   'bottom',
        autoAdvance: true,
        required:    true,
      },
      {
        target:      'pet-breed-input',
        title:       'Raça',
        body:        'Informe a raça do animal. Ajuda nos protocolos de predisposição genética e nos alertas de dosagem.',
        info:        'Raça — influencia predisposições genéticas e dosagem de medicamentos. Ex: Labrador, Persa.',
        placement:   'bottom',
        autoAdvance: true,
      },
      {
        target:      'pet-reproductive-select',
        title:       'Estado Reprodutivo',
        body:        'Selecione se o animal é castrado ou inteiro. Esta informação é fundamental para protocolos cirúrgicos e anestésicos.',
        info:        'Estado reprodutivo — castrado ou inteiro. Impacta protocolos cirúrgicos e anestésicos.',
        placement:   'bottom',
        autoAdvance: true,
      },
      {
        target:      'pet-behavior-tags',
        title:       'Tags de Comportamento',
        body:        'Marque as características comportamentais do animal. Esses alertas são exibidos em destaque para a equipe durante a triagem.',
        info:        'Tags de comportamento — sinalizam ao auxiliar e ao MV o temperamento: agressivo, assustado, etc.',
        placement:   'bottom',
      },
      {
        target:      'pet-allergies',
        title:       'Alergias Conhecidas',
        body:        'IMPORTANTE: registre todas as alergias aqui. Este campo aparece em destaque vermelho na triagem e no prontuário.',
        info:        'Alergias — exibido em alerta vermelho na triagem. Registre medicamentos, alimentos ou substâncias.',
        placement:   'top',
        autoAdvance: true,
      },
      {
        target:      'pet-chronic-diseases',
        title:       'Doenças Crônicas',
        body:        'Registre condições pré-existentes como Diabetes, Leishmaniose, IRC etc. Essencial para segurança anestésica e escolha de medicamentos.',
        info:        'Doenças crônicas — essencial para segurança anestésica. Ex: Diabetes, IRC, Leishmaniose.',
        placement:   'top',
        autoAdvance: true,
      },
      {
        target:      'pet-microchip',
        title:       'Microchip ID',
        body:        'Informe o código de 15 dígitos do microchip (padrão ISO 11784/11785). Clique em Salvar ao concluir o preenchimento.',
        info:        'Microchip ISO 11784/11785 — código de 15 dígitos. Obrigatório para rastreamento e seguro pet.',
        placement:   'top',
        autoAdvance: true,
      },
    ],
  },
}

// ─── Intent → Tour (NLP local) ────────────────────────────────────────────────

interface IntentMap {
  keywords: string[]
  tourId: string
  response: string
}

export const INTENT_MAP: IntentMap[] = [
  {
    keywords: ['alta', 'liberar', 'finalizar consulta', 'encerrar'],
    tourId: 'alta',
    response: 'Vou te mostrar como dar alta a um animal. Abrindo o tour de Alta agora...',
  },
  {
    keywords: ['triagem', 'sinais vitais', 'peso', 'temperatura', 'enfermagem', 'medir'],
    tourId: 'triagem',
    response: 'Boa! A triagem é o primeiro contato clínico. Deixa eu te guiar pelo processo...',
  },
  {
    keywords: ['recepção', 'check-in', 'chegou', 'registrar animal', 'entrada', 'fila'],
    tourId: 'recepcao',
    response: 'Certo! O check-in é o ponto de partida. Vou mostrar como registrar a chegada de um animal...',
  },
  {
    keywords: ['agendar', 'agendamento', 'marcar consulta', 'consulta futura', 'agendar consulta', 'horário', 'reservar'],
    tourId: 'recepcao',
    response: 'Para agendar uma consulta, acesse a Recepção, busque o tutor e clique em "Agendar". Vou te mostrar o caminho...',
  },
  {
    keywords: ['consulta', 'veterinário', 'consultório', 'prontuário', 'soap', 'diagnóstico'],
    tourId: 'consulta',
    response: 'Entendido! Vou te guiar pelo consultório e como registrar a consulta com IA...',
  },
  {
    keywords: ['exame', 'laboratório', 'laudo', 'resultado', 'exames'],
    tourId: 'exames',
    response: 'Vou mostrar o fluxo de exames. Aqui você registra laudos e resultados laboratoriais...',
  },
  {
    keywords: ['internação', 'internado', 'internar', 'hospitalizar', 'uti', 'internamento'],
    tourId: 'internacao',
    response: 'Vou mostrar a gestão de animais internados. Lá você acompanha cada internado em tempo real...',
  },
  {
    keywords: ['banho', 'tosa', 'grooming', 'pet shop', 'tosador', 'banhista'],
    tourId: 'grooming',
    response: 'Ótimo! O módulo de Banho e Tosa tem fila e registro por voz. Deixa eu te mostrar...',
  },
  {
    keywords: ['cadastrar pet', 'cadastrar animal', 'novo pet', 'novo cadastro', 'microchip', 'alerg', 'doença crônica', 'registrar animal'],
    tourId: 'cadastro-pet',
    response: 'Vou te guiar pelo cadastro completo do pet. Primeiro, preciso te levar até a tela de Pacientes...',
  },
]

// ─── Context ──────────────────────────────────────────────────────────────────

interface MentorContextValue {
  tourId: string | null
  steps: TourStep[]
  currentStep: number
  isTourActive: boolean
  /** Target explorado fora da ordem do tour (null = seguindo o fluxo normal) */
  focusedTarget: string | null
  startTour: (tourId: string) => void
  nextStep: () => void
  prevStep: () => void
  endTour: () => void
  /** Salta o spotlight para um target arbitrário sem alterar currentStep */
  jumpToTarget: (target: string | null) => void
}

const MentorContext = createContext<MentorContextValue | null>(null)

export function MentorProvider({ children }: { children: ReactNode }) {
  const [tourId, setTourId]               = useState<string | null>(null)
  const [steps, setSteps]                 = useState<TourStep[]>([])
  const [currentStep, setCurrentStep]     = useState(0)
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null)

  const startTour = useCallback((id: string) => {
    const tour = TOURS[id]
    if (!tour) return
    setTourId(id)
    setSteps(tour.steps)
    setCurrentStep(0)
    setFocusedTarget(null)
  }, [])

  const nextStep = useCallback(() => {
    setFocusedTarget(null)
    setCurrentStep(s => s + 1)
  }, [])

  const prevStep = useCallback(() => {
    setFocusedTarget(null)
    setCurrentStep(s => Math.max(0, s - 1))
  }, [])

  const endTour = useCallback(() => {
    setTourId(null)
    setSteps([])
    setCurrentStep(0)
    setFocusedTarget(null)
  }, [])

  const jumpToTarget = useCallback((target: string | null) => {
    setFocusedTarget(target)
  }, [])

  // Expõe funções globalmente para testes E2E (Playwright)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      type W = { __MENTOR_START_TOUR?: (id: string) => void; __MENTOR_JUMP_TO?: (t: string | null) => void; __MENTOR_NEXT_STEP?: () => void }
      const w = window as unknown as W
      w.__MENTOR_START_TOUR = startTour
      w.__MENTOR_JUMP_TO    = jumpToTarget
      w.__MENTOR_NEXT_STEP  = () => { setFocusedTarget(null); setCurrentStep(s => s + 1) }
    }
    return () => {
      if (typeof window !== 'undefined') {
        type W = { __MENTOR_START_TOUR?: unknown; __MENTOR_JUMP_TO?: unknown; __MENTOR_NEXT_STEP?: unknown }
        const w = window as unknown as W
        delete w.__MENTOR_START_TOUR
        delete w.__MENTOR_JUMP_TO
        delete w.__MENTOR_NEXT_STEP
      }
    }
  }, [startTour, jumpToTarget])

  return (
    <MentorContext.Provider value={{
      tourId, steps, currentStep, focusedTarget,
      isTourActive: tourId !== null && steps.length > 0 && currentStep < steps.length,
      startTour, nextStep, prevStep, endTour, jumpToTarget,
    }}>
      {children}
    </MentorContext.Provider>
  )
}

export function useMentor() {
  const ctx = useContext(MentorContext)
  if (!ctx) throw new Error('useMentor must be used inside <MentorProvider>')
  return ctx
}
