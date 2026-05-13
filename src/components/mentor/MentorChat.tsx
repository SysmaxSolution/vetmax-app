'use client'

import { useState, useRef, useEffect, useTransition, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { findPetConsultation, type MentorPetResult } from '@/lib/actions/mentor'
import { useMentor, TOURS, INTENT_MAP } from './MentorContext'
import { usePathname } from 'next/navigation'
import { MentorHighlightOverlay, type MentorHighlight } from './MentorHighlightOverlay'

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = 'mentor' | 'user'

interface Message {
  id: string
  role: MessageRole
  text: string
  action?: {
    label: string
    onClick: () => void
  }
  action2?: {
    label: string
    onClick: () => void
  }
  petResult?: MentorPetResult & { found: true }
  highlights?: MentorHighlight[]
}

// ─── localStorage key ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'mentor_mode'

// ─── NLP local ───────────────────────────────────────────────────────────────

function detectIntent(text: string): { tourId: string; response: string } | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const intent of INTENT_MAP) {
    if (intent.keywords.some(kw => normalized.includes(
      kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ))) {
      return { tourId: intent.tourId, response: intent.response }
    }
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) }

function mentorMsg(text: string, extras?: Partial<Message>): Message {
  return { id: uid(), role: 'mentor', text, ...extras }
}

function userMsg(text: string): Message {
  return { id: uid(), role: 'user', text }
}

const GREET: Message = mentorMsg(
  'Olá! Sou o Mentor do SysVetMax. Posso te ajudar a:\n• Localizar um animal ("Cadê o Bituca?")\n• Iniciar um tour guiado ("Como dou alta?")\n• Navegar pelo sistema ("Me mostra a triagem")'
)

// ─── Speech Recognition types ─────────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MentorChatProps {
  idleEnabled?: boolean
  idleSeconds?: number
}

export function MentorChat({ idleEnabled = true, idleSeconds = 30 }: MentorChatProps) {
  const [mounted, setMounted]         = useState(false)
  const [open, setOpen]               = useState(false)
  const [idleBubble, setIdleBubble]   = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [messages, setMessages]       = useState<Message[]>([GREET])
  const [input, setInput]             = useState('')
  const [listening, setListening]     = useState(false)
  const [isPending, startTransition]  = useTransition()
  // G16-4: Dual-mode — 'text' | 'visual'. Persiste em localStorage.
  const [mode, setMode]               = useState<'text' | 'visual'>('text')
  // Highlights ativos no momento (para modo visual)
  const [activeHighlights, setActiveHighlights] = useState<MentorHighlight[]>([])

  useEffect(() => { setMounted(true) }, [])

  // Idle timer — exibe balão de ajuda após inatividade
  useEffect(() => {
    if (!idleEnabled) return
    const ms = idleSeconds * 1000

    function resetTimer() {
      setIdleBubble(false)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => setIdleBubble(true), ms)
    }

    const events = ['scroll', 'click', 'touchstart', 'mousemove', 'keydown'] as const
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [idleEnabled, idleSeconds])

  // Lê preferência de modo do localStorage após montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'visual' || saved === 'text') setMode(saved)
    } catch {
      // localStorage indisponível — usa padrão
    }
  }, [])

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === 'text' ? 'visual' : 'text'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* noop */ }
      return next
    })
  }, [])

  const { startTour } = useMentor()
  const router        = useRouter()
  const pathname      = usePathname()
  const inputRef      = useRef<HTMLInputElement>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  const addMsg = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg])
  }, [])

  /**
   * Navega para a rota exigida pelo tour (se necessário) e então dispara.
   * Aguarda 350ms para o router.push completar antes de iniciar o tour,
   * garantindo que os elementos da tela correta estejam no DOM.
   */
  const launchTour = useCallback((tourId: string) => {
    const tour = TOURS[tourId]
    const requiredPath = tour?.requiredPath

    const navigateAndStart = () => {
      startTour(tourId)
      setOpen(false)
    }

    if (requiredPath && !pathname.startsWith(requiredPath)) {
      router.push(requiredPath)
      // Aguarda a navegação completar antes de ativar o tour
      setTimeout(navigateAndStart, 400)
    } else {
      navigateAndStart()
    }
  }, [startTour, router, pathname])

  // ── Core: process any text input ──────────────────────────────────────────

  const processInput = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setInput('')
    addMsg(userMsg(trimmed))

    // 1. Checar se é busca por animal (contém nome + contexto de localização)
    const petSearchPatterns = [
      /cad[eê]\s+o?\s*(.+)/i,
      /onde\s+(?:est[aá]|ficou|foi)\s+o?\s*(.+)/i,
      /localiz[ae]\s+o?\s*(.+)/i,
      /busca[r]?\s+o?\s*(.+)/i,
      /procur[ae]\s+o?\s*(.+)/i,
      /encontr[ae]\s+o?\s*(.+)/i,
      /qual\s+(?:o\s+)?status\s+(?:do|da|de)\s+(.+)/i,
      /como\s+est[aá]\s+o?\s*a?\s*(.+)/i,
      /como\s+vai\s+o?\s*a?\s*(.+)/i,
      /t[aá]\s+bem\s+o?\s*a?\s*(.+)/i,
    ]

    for (const pattern of petSearchPatterns) {
      const match = trimmed.match(pattern)
      if (match) {
        const petName = match[1].replace(/\?|!|\.$/g, '').trim()
        addMsg(mentorMsg(`Procurando "${petName}" no sistema de hoje...`))
        startTransition(async () => {
          const result = await findPetConsultation(petName)
          handlePetResult(result, petName)
        })
        return
      }
    }

    // 2. NLP de intenção → tour
    const intent = detectIntent(trimmed)
    if (intent) {
      addMsg(mentorMsg(intent.response, {
        action: TOURS[intent.tourId] ? {
          label: `Iniciar tour: ${intent.tourId.replace(/-/g, ' ')}`,
          onClick: () => launchTour(intent.tourId),
        } : undefined,
      }))
      return
    }

    // 3. Consultar knowledge base via IA (RAG)
    addMsg(mentorMsg('Consultando a base de conhecimento...'))
    startTransition(async () => {
      try {
        const res = await fetch('/api/mentor-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // G16-2: envia pathname para injeção de contexto de rota no prompt
          body: JSON.stringify({ question: trimmed, pathname }),
        })
        const data = await res.json() as {
          answer?: string
          tourId?: string | null
          highlights?: MentorHighlight[]
        }
        if (data.answer) {
          const tourId: string | null = data.tourId ?? null
          const highlights = data.highlights ?? []

          setMessages(prev => {
            const withoutLoading = prev.filter(m => m.text !== 'Consultando a base de conhecimento...')
            return [...withoutLoading, mentorMsg(data.answer!, {
              action: tourId && TOURS[tourId] ? {
                label: 'Iniciar Tour Guiado',
                onClick: () => launchTour(tourId),
              } : undefined,
              highlights: highlights.length > 0 ? highlights : undefined,
            })]
          })

          // G16-4: no modo visual, aplica highlights imediatamente
          if (mode === 'visual' && highlights.length > 0) {
            setActiveHighlights(highlights)
          }
        }
      } catch {
        setMessages(prev => {
          const withoutLoading = prev.filter(m => m.text !== 'Consultando a base de conhecimento...')
          return [...withoutLoading, mentorMsg(
            'Não consegui acessar a base de conhecimento. Tente:\n• "Cadê o [nome do animal]?"\n• "Como dou alta?"\n• "Me mostra a triagem"'
          )]
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMsg, launchTour, pathname, mode])

  // ── Pet result handler ────────────────────────────────────────────────────

  const handlePetResult = useCallback((result: MentorPetResult, petName: string) => {
    if (!result.found) {
      addMsg(mentorMsg(
        `Não encontrei "${petName}" nos atendimentos de hoje. Verifique se o nome está correto ou se o check-in foi feito.`
      ))
      return
    }

    const msg: Message = mentorMsg(
      `Encontrei o **${result.petName}**! Ele está ${result.statusLabel} (${result.statusLocation}).${result.tutorName ? ` Tutor: ${result.tutorName}.` : ''} Posso te levar lá e te mostrar o que fazer!`,
      {
        action: {
          label: `Ir para ${result.statusLocation}`,
          onClick: () => {
            router.push(result.href)
            setOpen(false)
          },
        },
        action2: TOURS[result.suggestedTour] ? {
          label: 'Me ensinar o passo a passo',
          onClick: () => {
            router.push(result.href)
            setTimeout(() => { startTour(result.suggestedTour); setOpen(false) }, 400)
          },
        } : undefined,
        petResult: result,
      }
    )
    addMsg(msg)
  }, [addMsg, router, startTour, setOpen])

  // ── Voice input ───────────────────────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addMsg(mentorMsg('Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge.'))
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false
    recognitionRef.current = rec

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setListening(false)
      processInput(transcript)
    }
    rec.onerror = () => {
      setListening(false)
      addMsg(mentorMsg('Não consegui capturar o áudio. Tente novamente ou use o teclado.'))
    }
    rec.onend = () => setListening(false)

    rec.start()
    setListening(true)
  }, [listening, addMsg, processInput])

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    processInput(input)
  }

  // ── Quick tours ────────────────────────────────────────────────────────────

  const QUICK_TOURS = [
    { id: 'recepcao',  label: 'Recepção',    emoji: '🚪' },
    { id: 'triagem',   label: 'Triagem',     emoji: '🩺' },
    { id: 'consulta',  label: 'Consultório', emoji: '💬' },
    { id: 'alta',      label: 'Alta',        emoji: '✅' },
    { id: 'internacao',label: 'Internação',  emoji: '🏥' },
    { id: 'grooming',  label: 'Banho e Tosa',emoji: '✂️' },
  ]

  // ─────────────────────────────────────────────────────────────────────────

  // Portal to document.body to avoid stacking context issues (fixed elements
  // inside transformed parents lose their viewport-relative positioning)
  if (!mounted) return null

  return createPortal(
    <>
      {/* G16-3: Highlight Overlay — renderiza fora do chat panel para não conflitar com z-index */}
      {activeHighlights.length > 0 && (
        <MentorHighlightOverlay
          highlights={activeHighlights}
          onDismiss={() => setActiveHighlights([])}
        />
      )}

      {/* ── Idle Bubble ── */}
      {idleBubble && !open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-[9999] w-64 origin-bottom-right animate-fade-in">
          <div className="relative rounded-2xl bg-blue-600 px-4 py-3 text-xs text-white shadow-2xl">
            <p className="leading-relaxed pr-5 font-medium">Precisa de ajuda? Estou aqui para orientar!</p>
            <button
              onClick={() => {
                setIdleBubble(false)
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
              }}
              aria-label="Fechar"
              className="absolute right-2.5 top-2.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
              </svg>
            </button>
            {/* Cauda apontando para o botão (abaixo) */}
            <span className="absolute -bottom-[7px] right-7 h-3.5 w-3.5 rotate-45 rounded-sm bg-blue-600" />
          </div>
        </div>
      )}

      {/* ── Floating Button ── */}
      <button
        onClick={() => { setOpen(v => !v); setIdleBubble(false) }}
        className={`fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-200 ${
          open
            ? 'bg-slate-800 text-white scale-95'
            : 'bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:scale-110 hover:shadow-blue-500/40'
        }`}
        aria-label="Abrir Modo Mentor"
        style={open ? {} : { boxShadow: '0 8px 32px rgba(59,130,246,0.45)' }}
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
          </svg>
        )}
      </button>

      {/* ── Chat Panel ── */}
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-[9998] flex flex-col rounded-3xl border border-slate-100 bg-white"
          style={{
            width: 'min(340px, calc(100vw - 32px))',
            maxHeight: 'min(560px, calc(100vh - 140px))',
            boxShadow: '0 32px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {/* ── Header ── */}
          <div className="flex-shrink-0 rounded-t-3xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3.5">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
                </svg>
                {/* Online dot */}
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-none">Mentor SysVetMax</p>
                <p className="mt-0.5 text-[11px] text-blue-200">Assistente de onboarding</p>
              </div>

              {/* G16-4: Toggle Modo Texto / Modo Visual */}
              <button
                type="button"
                onClick={toggleMode}
                aria-label={mode === 'text' ? 'Ativar Modo Visual' : 'Ativar Modo Texto'}
                title={mode === 'text' ? 'Modo Visual (destaca elementos na tela)' : 'Modo Texto (apenas respostas)'}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all duration-200 ${
                  mode === 'visual'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {mode === 'visual' ? (
                  // Eye icon — modo visual ativo
                  <>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                    </svg>
                    Visual
                  </>
                ) : (
                  // MessageSquare icon — modo texto
                  <>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
                    </svg>
                    Texto
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div data-testid="mentor-chat-messages" className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ minHeight: 0 }}>
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'mentor' && (
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 mr-2 mt-0.5">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
                    </svg>
                  </div>
                )}

                <div className={`max-w-[78%] space-y-2 ${msg.role === 'user' ? '' : ''}`}>
                  {/* Bubble */}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-blue-600 text-white'
                        : 'rounded-bl-sm bg-slate-100 text-slate-800'
                    }`}
                    dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                  />

                  {/* Action buttons */}
                  {msg.role === 'mentor' && (msg.action || msg.action2 || msg.highlights) && (
                    <div className="flex flex-col gap-1.5 pl-0.5">
                      {msg.action && (
                        <button
                          onClick={msg.action.onClick}
                          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
                          </svg>
                          {msg.action.label}
                        </button>
                      )}
                      {msg.action2 && (
                        <button
                          onClick={msg.action2.onClick}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-left text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
                          </svg>
                          {msg.action2.label}
                        </button>
                      )}
                      {/* G16-4: Botão para aplicar highlights manualmente em Modo Texto */}
                      {msg.highlights && msg.highlights.length > 0 && (
                        <button
                          onClick={() => setActiveHighlights(msg.highlights!)}
                          className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                        >
                          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5"/>
                          </svg>
                          Mostrar na tela
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isPending && (
              <div className="flex justify-start">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 mr-2 mt-0.5">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
                  </svg>
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Quick tour chips ── */}
          <div className="flex-shrink-0 border-t border-slate-100 px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tours rápidos</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TOURS.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    addMsg(userMsg(`Iniciar tour: ${t.label}`))
                    addMsg(mentorMsg(`Iniciando o tour "${t.label}"...`))
                    launchTour(t.id)
                  }}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Input ── */}
          <div className="flex-shrink-0 rounded-b-3xl border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={listening ? 'Ouvindo...' : 'Pergunte algo ou busque um animal...'}
                disabled={listening || isPending}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              />

              {/* Mic button */}
              <button
                type="button"
                onClick={toggleVoice}
                disabled={isPending}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-150 ${
                  listening
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110'
                    : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600'
                }`}
                aria-label={listening ? 'Parar gravação' : 'Falar com Mentor'}
              >
                {listening ? (
                  <svg className="h-4 w-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="9" y="3" width="6" height="11" rx="3"/>
                    <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/>
                  </svg>
                )}
              </button>

              {/* Send button */}
              <button
                type="submit"
                disabled={!input.trim() || isPending || listening}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                aria-label="Enviar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
