'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useMentor, type TourStep } from './MentorContext'
import Link from 'next/link'

// ─── Jump Mode Badge ──────────────────────────────────────────────────────────

/** Indica no balão que o usuário está explorando fora da ordem */
function JumpModeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      Exploração livre
    </span>
  )
}

// ─── Highlight Box ────────────────────────────────────────────────────────────

interface HighlightBox {
  top: number; left: number; width: number; height: number
}

function getElementBox(target: string): HighlightBox | null {
  const el = document.querySelector(`[data-mentor-step="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // Ignore elementos com tamanho zero (não visíveis ainda)
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height }
}

/**
 * Aguarda um elemento [data-mentor-step=target] aparecer no DOM
 * usando MutationObserver + timeout de segurança.
 */
function waitForElement(target: string, timeoutMs = 4000): Promise<Element | null> {
  return new Promise(resolve => {
    // Já existe?
    const existing = document.querySelector(`[data-mentor-step="${target}"]`)
    if (existing) { resolve(existing); return }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(`[data-mentor-step="${target}"]`)
      if (el) {
        observer.disconnect()
        clearTimeout(timer)
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null) // timeout — retorna null para o tour exibir o balão centralizado
    }, timeoutMs)
  })
}

// ─── Step Balloon ─────────────────────────────────────────────────────────────

function StepBalloon({
  step, box, index, total, onNext, onPrev, onEnd, waiting,
  isJumpMode, jumpStep, steps,
}: {
  step: TourStep; box: HighlightBox | null
  index: number; total: number
  onNext: () => void; onPrev: () => void; onEnd: () => void
  waiting: boolean
  isJumpMode: boolean
  jumpStep: TourStep | null
  steps: TourStep[]
}) {
  const GAP      = 12  // respiro mínimo entre borda do alvo e borda do balão
  const MARGIN   = 8   // margem das bordas da viewport
  const BALLOON_W = Math.min(308, window.innerWidth - MARGIN * 2)

  // Placement atual: usa o do jumpStep quando em modo exploratório
  const activePlacement = (isJumpMode ? jumpStep?.placement : step.placement) ?? 'bottom'

  // Estilo posicional: usamos CSS `top` OU `bottom` dependendo da direção,
  // nunca os dois ao mesmo tempo, para evitar que o balão sobreponha o alvo.
  let posStyle: React.CSSProperties = {}
  let left = window.innerWidth / 2 - BALLOON_W / 2

  if (!box) {
    // Sem alvo: centraliza na tela
    posStyle = { top: window.innerHeight / 2 - 90 }
  } else {
    const vTop    = box.top    - window.scrollY   // topo do alvo em coords viewport
    const vBottom = vTop + box.height             // base do alvo em coords viewport
    const vLeft   = box.left   - window.scrollX

    // Alinha horizontalmente ao centro do alvo (para top/bottom)
    const hCenter = vLeft + box.width / 2 - BALLOON_W / 2

    if (activePlacement === 'bottom') {
      const spaceBelow = window.innerHeight - vBottom - GAP - MARGIN
      const spaceAbove = vTop - GAP - MARGIN

      if (spaceBelow >= 150 || spaceBelow >= spaceAbove) {
        // Ancora pelo topo: balão começa onde o alvo termina + GAP
        posStyle = { top: vBottom + GAP }
      } else {
        // Ancora pela base: balão termina onde o alvo começa - GAP
        posStyle = { bottom: window.innerHeight - vTop + GAP }
      }
      left = hCenter
    } else if (activePlacement === 'top') {
      const spaceAbove = vTop - GAP - MARGIN
      const spaceBelow = window.innerHeight - vBottom - GAP - MARGIN

      if (spaceAbove >= 150 || spaceAbove >= spaceBelow) {
        posStyle = { bottom: window.innerHeight - vTop + GAP }
      } else {
        posStyle = { top: vBottom + GAP }
      }
      left = hCenter
    } else if (activePlacement === 'right') {
      posStyle = { top: Math.max(MARGIN, vTop + box.height / 2 - 90) }
      left = vLeft + box.width + GAP
      // Se não cabe à direita, vai para esquerda
      if (left + BALLOON_W > window.innerWidth - MARGIN) {
        left = vLeft - BALLOON_W - GAP
      }
    } else { // left
      posStyle = { top: Math.max(MARGIN, vTop + box.height / 2 - 90) }
      left = vLeft - BALLOON_W - GAP
      if (left < MARGIN) {
        left = vLeft + box.width + GAP
      }
    }
  }

  // Clamp horizontal
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - BALLOON_W - MARGIN))

  // Clamp vertical: evita overflow tanto pelo topo quanto pelo fundo (balão ~220px)
  const EST_H = 220
  if ('top' in posStyle && typeof posStyle.top === 'number') {
    posStyle = { top: Math.max(MARGIN, Math.min(posStyle.top, window.innerHeight - EST_H - MARGIN)) }
  } else if ('bottom' in posStyle && typeof posStyle.bottom === 'number') {
    posStyle = { bottom: Math.max(MARGIN, Math.min(posStyle.bottom, window.innerHeight - EST_H - MARGIN)) }
  }

  const isLast = index === total - 1

  return (
    <div
      data-testid="mentor-balloon"
      className="fixed z-[10000] rounded-2xl overflow-hidden"
      style={{
        ...posStyle,
        left,
        width: BALLOON_W,
        maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold text-white">
            {index + 1}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">Modo Mentor</span>
        </div>
        <button
          onClick={onEnd}
          className="flex h-6 w-6 items-center justify-center rounded-full text-blue-200 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Fechar tour"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="bg-white px-4 py-3.5">
        {isJumpMode ? (
          <>
            {/* Modo exploratório: mostra info do campo visitado */}
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {jumpStep?.title ?? 'Campo do formulário'}
              </p>
              <JumpModeBadge />
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {jumpStep?.info ?? jumpStep?.body ?? 'Preencha este campo conforme necessário.'}
            </p>
            <p className="mt-1.5 text-[10px] text-amber-600 font-medium italic">
              Após preencher, o Mentor retomará o guia do ponto onde parou.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-900 mb-1.5">{step.title}</p>
            <p className="text-xs leading-relaxed text-slate-600">{step.body}</p>

            {/* Dicas contextuais do fluxo normal */}
            {step.waitForNext && !waiting && (
              <p className="mt-1.5 text-[10px] text-blue-500 font-medium italic">
                Clique no elemento iluminado para continuar
              </p>
            )}
            {waiting && (
              <p className="mt-1.5 text-[10px] text-amber-500 font-medium italic flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Aguardando o próximo elemento aparecer...
              </p>
            )}
            {step.autoAdvance && !waiting && (
              <p className="mt-1.5 text-[10px] text-blue-500 font-medium italic">
                Preencha o campo acima para avançar automaticamente
              </p>
            )}

            {step.ctaHref && step.ctaLabel && (
              <Link
                href={step.ctaHref}
                onClick={onEnd}
                className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                {step.ctaLabel}
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
                </svg>
              </Link>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-2.5">
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index
                  ? 'w-4 bg-blue-600'
                  : isJumpMode && jumpStep && steps[i]?.target === jumpStep.target
                    ? 'w-4 bg-amber-400'   // destaca passo sendo explorado
                    : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>
        {/* Em modo exploratório, os botões de navegação ficam ocultos */}
        {!isJumpMode && (
          <div className="flex items-center gap-2">
            {index > 0 && !waiting && (
              <button
                onClick={onPrev}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                ← Anterior
              </button>
            )}
            {isLast ? (
              <button
                onClick={onEnd}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Concluir ✓
              </button>
            ) : (
              !step.waitForNext && !waiting && (
                <button
                  onClick={onNext}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Próximo →
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Overlay ─────────────────────────────────────────────────────────────

export function MentorTour() {
  const {
    isTourActive, steps, currentStep,
    focusedTarget, jumpToTarget,
    nextStep, prevStep, endTour,
  } = useMentor()

  const [box,     setBox]     = useState<HighlightBox | null>(null)
  const [waiting, setWaiting] = useState(false) // aguardando próximo DOM node (waitForNext)

  const initialValueRef = useRef<string>('')
  const waitingRef      = useRef(false) // versão ref para uso em closures
  const isJumpModeRef   = useRef(false) // ref espelho para closures dos event handlers

  const step = isTourActive ? steps[currentStep] : null

  // ── Derived: step sendo explorado fora de ordem ───────────────────────────
  const jumpStep = focusedTarget
    ? (steps.find(s => s.target === focusedTarget) ?? null)
    : null
  const isJumpMode = focusedTarget !== null && focusedTarget !== step?.target

  // Mantém ref sincronizada para closures dos event handlers
  isJumpModeRef.current = isJumpMode

  // ── Localiza e centraliza o elemento atual no viewport ────────────────────
  const updateBox = useCallback(() => {
    if (!isTourActive) return
    const target = focusedTarget ?? step?.target
    if (!target) return
    const found = getElementBox(target)
    setBox(found)
    if (found) {
      document.querySelector(`[data-mentor-step="${target}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isTourActive, step, focusedTarget])

  // ── Global focusin: detecta quando usuário foca campo fora da ordem ───────
  useEffect(() => {
    if (!isTourActive) return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      const mentorStep = target.getAttribute('data-mentor-step')
      if (!mentorStep) return

      // Mesmo passo atual → cancela qualquer jump ativo e volta ao fluxo normal
      if (mentorStep === step?.target) {
        jumpToTarget(null)
        return
      }

      // Campo fora de ordem: ativa modo exploratório + reposiciona spotlight
      jumpToTarget(mentorStep)
      const found = getElementBox(mentorStep)
      setBox(found)
      if (found) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [isTourActive, step, jumpToTarget])

  // ── focusout removido intencionalmente ───────────────────────────────────
  // O tour NUNCA reseta o JumpMode por perda de foco.
  // Razão: selects nativos e portals (Radix, headlessui) transferem foco para
  // document.body antes de abrir o menu — o timeout de 50ms disparava antes
  // do menu montar, zerando o spotlight e quebrando o tour.
  // O JumpMode só sai quando o usuário foca de volta o passo atual (focusin acima)
  // ou pressiona Próximo/Anterior no balão (nextStep/prevStep limpam focusedTarget).

  // ── Efeito principal: localizar elemento + MutationObserver se não achar ──
  // Reage tanto à mudança de step quanto à mudança de focusedTarget
  useEffect(() => {
    if (!isTourActive || !step) return

    // Em modo exploratório o focusin já posicionou o box; não sobrescreve
    if (isJumpMode) return

    setWaiting(false)
    waitingRef.current = false

    let cancelled = false

    async function findAndBind() {
      // Tenta localizar imediatamente
      let found = getElementBox(step!.target)

      if (!found) {
        // Elemento não está no DOM ainda — aguarda via MutationObserver
        setWaiting(true)
        waitingRef.current = true

        const el = await waitForElement(step!.target, 5000)
        if (cancelled) return

        setWaiting(false)
        waitingRef.current = false

        if (el) {
          // Aguarda 1 frame para o browser renderizar (ex: modal com animação)
          await new Promise(r => requestAnimationFrame(r))
          if (cancelled) return
          found = getElementBox(step!.target)
        }
      }

      if (cancelled) return
      setBox(found)
      if (found) {
        document.querySelector(`[data-mentor-step="${step!.target}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    findAndBind()

    const onResize = () => updateBox()
    const onScroll = () => updateBox()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
    }
  // isJumpMode incluído para recalcular box quando sair do modo exploratório
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, step, isJumpMode, updateBox])

  // ── waitForNext: observa o PRÓXIMO alvo aparecer e avança ─────────────────
  useEffect(() => {
    if (!isTourActive || !step?.waitForNext) return

    const nextStep_ = steps[currentStep + 1]
    if (!nextStep_) return

    let cancelled = false

    async function watchNextTarget() {
      const el = await waitForElement(nextStep_.target, 8000)
      if (cancelled || !el) return
      // Pequeno delay para animações de abertura de modal
      await new Promise(r => setTimeout(r, 120))
      if (cancelled) return
      nextStep()
    }

    watchNextTarget()
    return () => { cancelled = true }
  }, [isTourActive, step, steps, currentStep, nextStep])

  // ── autoAdvance: ouve interação do usuário no campo atual ─────────────────
  useEffect(() => {
    if (!isTourActive || !step || step.waitForNext) return

    const el = document.querySelector(`[data-mentor-step="${step.target}"]`) as
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    if (!el) return

    initialValueRef.current = el.value ?? ''

    const tagName = el.tagName.toLowerCase()

    const handleChange = () => {
      if (tagName === 'select') {
        nextStep()
        return
      }
    }

    const handleBlur = () => {
      // Não avança se o usuário apenas saiu para explorar outro campo
      if (isJumpModeRef.current) return
      const current = (el.value ?? '').trim()
      if (current.length > 0 && current !== initialValueRef.current.trim()) {
        nextStep()
      }
    }

    const handleKeydown = (e: Event) => {
      if (isJumpModeRef.current) return
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' && (el.value ?? '').trim().length > 0) {
        nextStep()
      }
    }

    if (tagName === 'select') {
      el.addEventListener('change', handleChange)
    } else {
      el.addEventListener('blur', handleBlur)
      el.addEventListener('keydown', handleKeydown)
    }

    return () => {
      if (tagName === 'select') {
        el.removeEventListener('change', handleChange)
      } else {
        el.removeEventListener('blur', handleBlur)
        el.removeEventListener('keydown', handleKeydown)
      }
    }
  }, [isTourActive, step, nextStep, currentStep])

  if (!isTourActive || !step) return null

  const PAD = 8

  return (
    <div data-testid="mentor-overlay" className="fixed inset-0 z-[9990]" style={{ pointerEvents: 'none' }}>
      {box ? (
        <>
          {(() => {
            const vTop  = box.top  - window.scrollY
            const vLeft = box.left - window.scrollX

            return (
              <>
                {/* ── 4 faixas escuras ao redor do spotlight ── */}
                {/* pointerEvents: none em todas — cliques atravessam e atingem os campos */}
                {/* Topo */}
                <div
                  className="absolute bg-black/55 backdrop-blur-[1px]"
                  style={{ top: 0, left: 0, right: 0, height: Math.max(0, vTop - PAD), pointerEvents: 'none' }}
                />
                {/* Base */}
                <div
                  className="absolute bg-black/55 backdrop-blur-[1px]"
                  style={{ top: vTop + box.height + PAD, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}
                />
                {/* Esquerda */}
                <div
                  className="absolute bg-black/55 backdrop-blur-[1px]"
                  style={{
                    top: vTop - PAD, left: 0,
                    width: Math.max(0, vLeft - PAD),
                    height: box.height + PAD * 2,
                    pointerEvents: 'none',
                  }}
                />
                {/* Direita */}
                <div
                  className="absolute bg-black/55 backdrop-blur-[1px]"
                  style={{
                    top: vTop - PAD,
                    left: vLeft + box.width + PAD,
                    right: 0,
                    height: box.height + PAD * 2,
                    pointerEvents: 'none',
                  }}
                />

                {/* ── Anel de destaque: azul (fluxo normal) | âmbar (exploratório) ── */}
                <div
                  className="absolute rounded-xl transition-colors duration-200"
                  style={{
                    top:    vTop  - PAD,
                    left:   vLeft - PAD,
                    width:  box.width  + PAD * 2,
                    height: box.height + PAD * 2,
                    border: isJumpMode
                      ? '2px solid rgba(251,191,36,0.9)'
                      : '2px solid rgba(96,165,250,0.9)',
                    boxShadow: isJumpMode
                      ? '0 0 0 4px rgba(245,158,11,0.25), inset 0 0 0 1px rgba(255,255,255,0.1)'
                      : '0 0 0 4px rgba(59,130,246,0.25), inset 0 0 0 1px rgba(255,255,255,0.1)',
                    pointerEvents: 'none',
                  }}
                />
              </>
            )
          })()}
        </>
      ) : (
        // Sem elemento alvo: overlay completo (aguardando elemento ou tela errada)
        // pointerEvents: none para permitir que o usuário interaja com campos
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Balão — sempre clicável */}
      <div style={{ pointerEvents: 'auto' }}>
        <StepBalloon
          step={step}
          box={box}
          index={currentStep}
          total={steps.length}
          onNext={nextStep}
          onPrev={prevStep}
          onEnd={endTour}
          waiting={waiting}
          isJumpMode={isJumpMode}
          jumpStep={jumpStep}
          steps={steps}
        />
      </div>
    </div>
  )
}
