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
        target:    'reception-search-input',
        title:     'Busca de Tutor ou Pet',
        body:      'Digite o CPF, nome do tutor ou nome do pet para localizar o cadastro. Selecione o resultado para ver os pets vinculados.',
        placement: 'bottom',
        info:      'Campo de busca — pesquise por CPF, nome do tutor ou nome do pet.',
      },
      {
        target:    'reception-new-btn',
        title:     'Novo Cadastro',
        body:      'Tutor não cadastrado? Clique aqui (ou Alt+N) para registrar um novo tutor e pet. Após cadastrar, faça o check-in.',
        placement: 'bottom',
        info:      'Botão de novo cadastro — cria tutor + pet e já encaminha para check-in.',
      },
      {
        target:    'reception-queue',
        title:     'Fila de Espera',
        body:      'Após o check-in, o pet aparece aqui. Clique em "Chamar Triagem →" quando o auxiliar estiver disponível.',
        placement: 'right',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  'sala-espera': {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:    'reception-queue',
        title:     'Sala de Espera',
        body:      'Pets com check-in feito aguardam triagem aqui, em ordem de chegada. Clique em "Chamar Triagem →" para chamar o próximo.',
        placement: 'right',
        info:      'Fila de espera — pets aguardando triagem em ordem de chegada.',
      },
      {
        target:    'reception-new-btn',
        title:     'Novo Check-in',
        body:      'Para adicionar um novo pet à fila, clique aqui para buscar o cadastro ou criar um novo tutor e pet.',
        placement: 'bottom',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  triagem: {
    requiredPath: '/dashboard/triage',
    steps: [
      {
        target:      'nurse-queue',
        title:       'Fila de Triagem',
        body:        'Pets encaminhados pela recepção aparecem aqui. Clique no nome de um pet para abrir a ficha de triagem e registrar os sinais vitais.',
        placement:   'right',
        info:        'Fila de triagem — clique em um animal para abrir a ficha.',
        waitForNext: true,
      },
      {
        target:    'triage-add-btn',
        title:     'Adicionar Manualmente',
        body:      'Precisa adicionar um pet sem check-in? Use este botão para incluí-lo diretamente na fila de triagem.',
        placement: 'bottom',
        info:      'Botão de adição manual — para pets sem check-in prévio.',
      },
      {
        target:    'triage-voice-btn',
        title:     'Triagem por Voz',
        body:      'Dentro da ficha do pet, clique no microfone e fale os sinais vitais em voz alta. A IA preenche os campos automaticamente.',
        placement: 'bottom',
        info:      'Área de triagem por voz — disponível ao abrir a ficha de um animal.',
      },
      {
        target:    'triage-save-btn',
        title:     'Concluir Triagem',
        body:      'Após confirmar peso, temperatura e demais dados, clique aqui para enviar o pet à fila do médico veterinário.',
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
        body:        'Pets com triagem concluída aguardam atendimento aqui. Clique no nome do pet para abrir o prontuário eletrônico.',
        placement:   'bottom',
        info:        'Fila do consultório — clique em um pet para abrir o prontuário.',
        waitForNext: true,
      },
      {
        target:    'vet-notes-textarea',
        title:     'Anotações Clínicas (SOAP)',
        body:      'Registre a evolução clínica aqui. Você pode ditar por voz ou digitar diretamente. O campo aceita formatação SOAP.',
        placement: 'right',
        info:      'Campo de anotações — suporta entrada por voz e digitação.',
        autoAdvance: true,
      },
      {
        target:    'vet-save-notes-btn',
        title:     'Salvar Prontuário',
        body:      'Após revisar as anotações, clique aqui para salvar. O prontuário fica registrado no histórico do pet.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  exames: {
    requiredPath: '/dashboard/exams',
    steps: [
      {
        target:    'exams-queue',
        title:     'Fila de Exames',
        body:      'Pets encaminhados pelo MV para exames aparecem aqui. Clique em um card para abrir a solicitação e registrar o laudo.',
        placement: 'bottom',
        info:      'Fila de exames — pets aguardando laudo do laboratório.',
      },
      {
        target:    'exams-request-btn',
        title:     'Solicitar Exame',
        body:      'Precisa solicitar um exame adicional? Clique aqui para criar uma solicitação avulsa para qualquer pet.',
        placement: 'bottom',
        info:      'Botão de solicitação — cria uma requisição de exame manual.',
      },
      {
        target:    'exams-result-textarea',
        title:     'Registrar Laudo',
        body:      'Digite o resultado do exame neste campo. Após salvar, o pet retorna automaticamente ao fluxo clínico.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
        autoAdvance: true,
      },
    ],
  },

  internacao: {
    requiredPath: '/dashboard/hospitalization',
    steps: [
      {
        target:    'hospitalization-list',
        title:     'Quadro de Internados',
        body:      'Todos os pets internados aparecem neste quadro Kanban, divididos por ala (Observação, Enfermaria, UTI). Arraste para mover entre alas.',
        placement: 'bottom',
        info:      'Kanban de internação — cada coluna representa uma ala clínica.',
      },
      {
        target:    'hosp-discharge-btn',
        title:     'Dar Alta Hospitalar',
        body:      'Quando o pet estiver estável e pronto para alta, o botão "Dar Alta" aparece no card. Clique nele para iniciar o processo de alta.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  grooming: {
    requiredPath: '/dashboard/grooming',
    steps: [
      {
        target:    'grooming-queue',
        title:     'Kanban de Banho e Tosa',
        body:      'Pets agendados ou em serviço aparecem neste quadro. Arraste os cards para mudar de etapa ou clique para abrir o registro do serviço.',
        placement: 'bottom',
        info:      'Kanban de grooming — acompanhe o fluxo de cada pet em tempo real.',
      },
      {
        target:    'grooming-voice-btn',
        title:     'Registro por Voz',
        body:      'Ao abrir um card, use este botão (ou diga "Assistente") para registrar observações por voz. A IA preenche serviços, produtos e notas automaticamente.',
        placement: 'bottom',
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
        body:        'Clique em "Kanban" para ver o quadro completo de atendimentos do dia, com todas as etapas do fluxo clínico.',
        placement:   'bottom',
        info:        'Botão para ativar a visualização Kanban da recepção.',
        waitForNext: true,
      },
      {
        target:    'kanban-board',
        title:     'Quadro de Atendimentos',
        body:      'Cada coluna representa uma etapa do fluxo: Agendado, Recepção, Triagem, Consultório, Exames, Alta. Mova os cards ou clique para detalhar.',
        placement: 'bottom',
        info:      'Kanban do dia — visão geral de todos os atendimentos em andamento.',
      },
      {
        target:    'kanban-col-completed',
        title:     'Coluna Alta',
        body:      'Pets com prontuário finalizado pelo MV e pagamento confirmado aparecem aqui. O atendimento está concluído.',
        placement: 'bottom',
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
        body:        'Clique neste botão para abrir o formulário de cadastro. O Mentor vai te guiar por cada campo.',
        info:        'Botão de novo cadastro — clique para abrir o formulário do pet.',
        placement:   'bottom',
        waitForNext: true,
      },
      {
        target:      'pet-name-input',
        title:       'Nome do Pet',
        body:        'Digite o nome do animal. Este é o campo principal de identificação.',
        info:        'Nome do pet — identificação principal. Ex: "Bolinha", "Mia".',
        placement:   'bottom',
        autoAdvance: true,
        required:    true,
      },
      {
        target:      'pet-species-select',
        title:       'Espécie',
        body:        'Selecione a espécie. Isso define os protocolos clínicos e as vacinas disponíveis.',
        info:        'Espécie — define protocolos clínicos e vacinas aplicáveis. Ex: Cão, Gato, Ave.',
        placement:   'bottom',
        autoAdvance: true,
        required:    true,
      },
      {
        target:      'pet-breed-input',
        title:       'Raça',
        body:        'Informe a raça do animal. Ajuda nos protocolos de predisposição genética.',
        info:        'Raça — influencia predisposições genéticas e dosagem de medicamentos. Ex: Labrador, Persa.',
        placement:   'bottom',
        autoAdvance: true,
      },
      {
        target:      'pet-reproductive-select',
        title:       'Estado Reprodutivo',
        body:        'Informe se o animal é castrado ou inteiro. Fundamental para protocolos cirúrgicos e hormonais.',
        info:        'Estado reprodutivo — castrado ou inteiro. Impacta protocolos cirúrgicos e anestésicos.',
        placement:   'bottom',
        autoAdvance: true,
      },
      {
        target:      'pet-behavior-tags',
        title:       'Tags de Comportamento',
        body:        'Marque características comportamentais. Alertam a equipe sobre temperamento do animal.',
        info:        'Tags de comportamento — sinalizam ao auxiliar e ao MV o temperamento: agressivo, assustado, etc.',
        placement:   'bottom',
      },
      {
        target:      'pet-allergies',
        title:       'Alergias Conhecidas',
        body:        'IMPORTANTE: registre todas as alergias aqui. Esse campo aparece em destaque vermelho na triagem.',
        info:        'Alergias — exibido em alerta vermelho na triagem. Registre medicamentos, alimentos ou substâncias.',
        placement:   'top',
        autoAdvance: true,
      },
      {
        target:      'pet-chronic-diseases',
        title:       'Doenças Crônicas',
        body:        'Registre condições pré-existentes como Diabetes, Leishmaniose etc. Fundamental para anestesia.',
        info:        'Doenças crônicas — essencial para segurança anestésica. Ex: Diabetes, IRC, Leishmaniose.',
        placement:   'top',
        autoAdvance: true,
      },
      {
        target:      'pet-microchip',
        title:       'Microchip ID',
        body:        'Informe o código de 15 dígitos do microchip (padrão ISO 11784/11785).',
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
