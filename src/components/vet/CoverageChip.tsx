'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, AlertTriangle, XCircle, HelpCircle, Loader2 } from 'lucide-react'
import type { SemaforoState } from '@/hooks/usePetCoverageSemaforo'

/**
 * Semáforo Petlove — chip discreto posicionado dentro do textarea de
 * anamnese (parent precisa ser `position: relative`). Estados:
 *
 *   idle        → não renderiza nada
 *   analyzing   → cinza com spinner
 *   uncertain   → cinza claro com "?"
 *   covered     → verde
 *   caution     → amarelo (carência)
 *   not_covered → vermelho (particular)
 *
 * Sustain pattern: ao voltar para idle, o chip permanece visível mais 1s
 * com fade-out de 1s — evita piscar quando o vet faz uma pausa longa
 * entre frases.
 *
 * Tooltip aparece em hover (desktop) ou click (mobile).
 */

interface Props {
  state: SemaforoState
  /** Override do posicionamento default (`absolute top-2 right-2`). */
  className?: string
}

const FADE_OUT_DELAY_MS  = 1000
const FADE_OUT_DURATION  = 1000
const FADE_IN_DURATION   = 200

type RealStatus = Exclude<SemaforoState['status'], 'idle'>

interface VariantConfig {
  classes: string
  icon:    React.ReactNode
  label:   string
}

const VARIANTS: Record<RealStatus, VariantConfig> = {
  analyzing: {
    classes: 'bg-slate-100/90 border-slate-200 text-slate-600',
    icon:    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
    label:   'Analisando',
  },
  uncertain: {
    classes: 'bg-slate-100/90 border-slate-300 text-slate-600',
    icon:    <HelpCircle className="h-3 w-3" aria-hidden />,
    label:   'Verificar',
  },
  covered: {
    classes: 'bg-emerald-50/95 border-emerald-300 text-emerald-700',
    icon:    <Check className="h-3 w-3" aria-hidden />,
    label:   'Coberto',
  },
  caution: {
    classes: 'bg-amber-50/95 border-amber-300 text-amber-700',
    icon:    <AlertTriangle className="h-3 w-3" aria-hidden />,
    label:   'Carência',
  },
  not_covered: {
    classes: 'bg-rose-50/95 border-rose-300 text-rose-700',
    icon:    <XCircle className="h-3 w-3" aria-hidden />,
    label:   'Particular',
  },
}

function formatCopay(amount: number | null, charger: 'clinic' | 'provider' | null): string | null {
  if (amount === null || amount <= 0) return null
  const fmt = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (charger === 'clinic')   return `Coparticipação ${fmt} (clínica)`
  if (charger === 'provider') return `Coparticipação ${fmt} (convênio)`
  return `Coparticipação ${fmt}`
}

export default function CoverageChip({ state, className = '' }: Props) {
  // O que está REALMENTE pintado no DOM (pode estar 1s à frente do state real,
  // durante o fade-out).
  const [rendered,    setRendered]    = useState<SemaforoState>(state)
  const [showTooltip, setShowTooltip] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // isVisible reflete o estado real (state.status), não o renderizado — controla
  // o opacity. Quando state.status volta a idle: isVisible=false, opacity vai a
  // 0 em FADE_OUT_DURATION ms, e SÓ depois desse tempo desmontamos.
  const isVisible = state.status !== 'idle'

  useEffect(() => {
    // Novo estado não-idle: atualiza o pintado imediatamente, cancela fade-out.
    if (state.status !== 'idle') {
      if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null }
      setRendered(state)
      return
    }
    // Indo para idle: agenda desmonte após o fade.
    if (rendered.status === 'idle') return
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => {
      setRendered({ ...state, status: 'idle' })
    }, FADE_OUT_DELAY_MS)
  }, [state, rendered.status])

  useEffect(() => () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
  }, [])

  if (rendered.status === 'idle') return null

  const variant = VARIANTS[rendered.status as RealStatus]
  const copayLine     = formatCopay(rendered.copayAmount, rendered.copayCharger)
  const procedureLine = rendered.procedureLabel ? `"${rendered.procedureLabel}"` : null
  const waitingLine   =
    rendered.status === 'caution' && rendered.daysRemaining !== null
      ? `Carência: faltam ${rendered.daysRemaining} dia${rendered.daysRemaining !== 1 ? 's' : ''}`
      : null
  const ariaLabel = `Cobertura: ${variant.label}${rendered.procedureLabel ? ` — ${rendered.procedureLabel}` : ''}`

  return (
    <div
      className={`absolute top-2 right-2 z-10 ${className}`}
      style={{
        opacity:           isVisible ? 1 : 0,
        transform:         `scale(${isVisible ? 1 : 0.95})`,
        transitionProperty: 'opacity, transform',
        transitionDuration: `${isVisible ? FADE_IN_DURATION : FADE_OUT_DURATION}ms`,
        transitionTimingFunction: 'ease',
        pointerEvents:     isVisible ? 'auto' : 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setShowTooltip(v => !v)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onBlur={() => setShowTooltip(false)}
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${variant.classes} text-[10px] font-bold uppercase tracking-wide shadow-sm backdrop-blur-sm hover:shadow`}
      >
        {variant.icon}
        <span className="leading-none">{variant.label}</span>
      </button>

      {showTooltip && (procedureLine || copayLine || waitingLine || rendered.examplePattern) && (
        <div
          role="tooltip"
          className="absolute top-full right-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white shadow-xl px-3 py-2.5 text-[11px] text-slate-700 space-y-1 z-20"
        >
          {procedureLine && (
            <p className="font-semibold text-slate-800">
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${
                rendered.status === 'covered'     ? 'bg-emerald-500' :
                rendered.status === 'caution'     ? 'bg-amber-500'   :
                rendered.status === 'not_covered' ? 'bg-rose-500'    :
                'bg-slate-400'
              }`} />
              {variant.label} · <span className="font-normal italic text-slate-600">{procedureLine}</span>
            </p>
          )}
          {waitingLine && (
            <p className="text-amber-700 font-semibold">{waitingLine}</p>
          )}
          {copayLine && (
            <p className="text-slate-600">{copayLine}</p>
          )}
          {rendered.examplePattern && rendered.status !== 'uncertain' && (
            <p className="text-[10px] text-slate-400 leading-snug">
              Regra do plano: <span className="italic">{rendered.examplePattern}</span>
            </p>
          )}
          {rendered.status === 'uncertain' && (
            <p className="text-[10px] text-slate-500 leading-snug">
              IA detectou possível procedimento mas com baixa certeza — confirme manualmente antes de cobrar.
            </p>
          )}
          {rendered.status === 'not_covered' && !rendered.examplePattern && (
            <p className="text-[10px] text-slate-500 leading-snug">
              Esse procedimento não consta na cobertura do plano deste pet — cobrança particular.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
