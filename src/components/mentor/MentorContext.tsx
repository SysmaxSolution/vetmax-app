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

// ─── Tours — mapeados para o VetMax ──────────────────────────────────────────

export const TOURS: Record<string, TourMeta> = {
  recepcao: {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:    'reception-checkin-btn',
        title:     'Check-in do Animal',
        body:      'Clique aqui para iniciar o atendimento. Você vai buscar o tutor e escolher o animal para a consulta.',
        placement: 'bottom',
      },
      {
        target:    'reception-queue',
        title:     'Fila de Espera',
        body:      'Animais com check-in feito aparecem aqui. Quando a triagem estiver livre, chame o próximo.',
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
        body:      'Animais aguardando triagem aparecem aqui em ordem de chegada.',
        placement: 'right',
      },
      {
        target:    'reception-checkin-btn',
        title:     'Novo Check-in',
        body:      'Para adicionar um novo animal à fila, clique aqui e siga os passos do check-in.',
        placement: 'bottom',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  triagem: {
    requiredPath: '/dashboard/triage',
    steps: [
      {
        target:    'nurse-queue',
        title:     'Fila de Triagem',
        body:      'Aqui ficam os animais aguardando triagem. Clique em um nome para abrir a ficha.',
        placement: 'right',
      },
      {
        target:    'triage-voice-btn',
        title:     'Triagem por Voz',
        body:      'Clique no microfone e fale os sinais vitais em voz alta. A IA preenche os campos automaticamente.',
        placement: 'bottom',
      },
      {
        target:    'triage-save-btn',
        title:     'Concluir Triagem',
        body:      'Após confirmar os dados, clique aqui para enviar o animal para a fila do veterinário.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  consulta: {
    requiredPath: '/dashboard/vet',
    steps: [
      {
        target:    'vet-record-btn',
        title:     'Gravar Consulta',
        body:      'O MV inicia a gravação por voz aqui. A IA transcreve e gera o SOAP automaticamente.',
        placement: 'bottom',
      },
      {
        target:    'vet-soap-section',
        title:     'Prontuário SOAP',
        body:      'Revise o texto gerado pela IA. Ajuste conforme necessário antes de salvar.',
        placement: 'right',
      },
      {
        target:    'vet-save-btn',
        title:     'Salvar Prontuário',
        body:      'Marque a caixa de responsabilidade e salve. O animal é liberado para alta.',
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
        body:      'Animais aguardando laudo aparecem aqui. Clique para abrir a solicitação.',
        placement: 'right',
      },
      {
        target:    'exams-result-btn',
        title:     'Registrar Resultado',
        body:      'Insira o resultado e clique aqui para devolver o animal ao fluxo.',
        placement: 'top',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  internacao: {
    requiredPath: '/dashboard/hospitalization',
    steps: [
      {
        target:    'hospitalization-list',
        title:     'Lista de Internados',
        body:      'Todos os animais internados aparecem aqui. Cada card mostra o status atual e os cuidados pendentes.',
        placement: 'right',
      },
      {
        target:    'hospitalization-discharge-btn',
        title:     'Dar Alta Hospitalar',
        body:      'Quando o animal estiver estável, clique aqui para registrar a alta e retornar ao fluxo normal.',
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
        title:     'Fila do Banho e Tosa',
        body:      'Animais agendados aparecem aqui. Arraste para mudar de etapa ou clique para detalhes.',
        placement: 'right',
      },
      {
        target:    'grooming-voice-btn',
        title:     'Registro por Voz',
        body:      'Fale observações sobre o serviço. A IA transcreve e preenche as notas automaticamente.',
        placement: 'bottom',
        ctaLabel:  'Entendido — finalizar tour',
      },
    ],
  },

  alta: {
    requiredPath: '/dashboard/reception',
    steps: [
      {
        target:    'kanban-board',
        title:     'Quadro de Atendimentos',
        body:      'Cada coluna representa uma etapa. Mova os cards ou clique para detalhar.',
        placement: 'bottom',
      },
      {
        target:    'kanban-col-completed',
        title:     'Coluna Alta',
        body:      'Animais com alta têm o prontuário oficial finalizado pelo MV. O processo está concluído.',
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
