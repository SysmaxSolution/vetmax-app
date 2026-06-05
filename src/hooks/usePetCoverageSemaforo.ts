'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getPetCoverageContext,
  type PetCoverageContext,
} from '@/lib/actions/coverage-llm'
import type { LlmCoverageResponse, CoverageCategory } from '@/lib/ai/coverage-extractor'

/**
 * Semáforo Petlove via voz — orquestra debounce + AbortController + cache LRU
 * para o chip de cobertura que aparece durante a fala do veterinário.
 *
 * Gatilhos de extração (qualquer um dispara):
 *   - Pausa de 2s sem novo texto no transcript
 *   - Acúmulo de 30+ palavras desde a última extração
 *
 * Performance:
 *   - useMemo para o lookup do contexto do plano
 *   - AbortController cancela request HTTP a cada nova chamada / suspensão
 *   - Cache LRU client-side com chave (patientId : providerName : hash do snippet)
 *     evita pagar IA por trechos já analisados
 */

// ─── Estado público ──────────────────────────────────────────────────────────

export type SemaforoStatus =
  | 'idle'         // sem plano, sem fala recente, ou ainda não analisou
  | 'analyzing'    // chamada IA em curso
  | 'uncertain'    // IA detectou procedimento com confidence < 0.6
  | 'covered'      // coberto, fora da carência
  | 'caution'      // coberto mas em carência
  | 'not_covered'  // excluído OU categoria ausente do plano

export interface SemaforoState {
  status:           SemaforoStatus
  category:         CoverageCategory | null
  procedureLabel:   string | null
  /** Coparticipação (R$) quando covered/caution. */
  copayAmount:      number | null
  copayCharger:     'clinic' | 'provider' | null
  /** Carência total do plano para esta categoria (dias). */
  waitingDaysTotal: number | null
  /** Quanto falta da carência (dias). null = sem carência ou sem enrollment_date. */
  daysRemaining:    number | null
  /** Texto humano da regra (tooltip). */
  examplePattern:   string | null
}

const IDLE_STATE: SemaforoState = {
  status:           'idle',
  category:         null,
  procedureLabel:   null,
  copayAmount:      null,
  copayCharger:     null,
  waitingDaysTotal: null,
  daysRemaining:    null,
  examplePattern:   null,
}

interface Opts {
  patientId:   string | null
  /** Transcript acumulado vindo do useClinicalVoiceAssistant. */
  transcript:  string
  /** true enquanto o hook clinical está em RECORDING. */
  isListening: boolean
}

// ─── Cache LRU client-side ───────────────────────────────────────────────────

const CACHE_MAX = 30
const cache = new Map<string, LlmCoverageResponse | null>()

/** djb2 — hash não-criptográfico suficiente para chave de cache. */
function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

function lruGet(key: string): LlmCoverageResponse | null | undefined {
  if (!cache.has(key)) return undefined
  const value = cache.get(key)
  // touch — move pra ponta (mais recente)
  cache.delete(key)
  cache.set(key, value ?? null)
  return value ?? null
}

function lruSet(key: string, value: LlmCoverageResponse | null): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
}

// ─── Resolver de estado (IA + contexto → semáforo) ───────────────────────────

function resolveState(
  llm: LlmCoverageResponse | null,
  ctx: PetCoverageContext,
): SemaforoState {
  if (!llm || llm.category === null) return IDLE_STATE

  if (llm.confidence < 0.6) {
    return {
      ...IDLE_STATE,
      status:         'uncertain',
      category:       llm.category,
      procedureLabel: llm.procedure_label,
    }
  }

  const rule = ctx.coverage[llm.category as CoverageCategory]
  if (!rule) {
    return {
      ...IDLE_STATE,
      status:         'not_covered',
      category:       llm.category,
      procedureLabel: llm.procedure_label,
    }
  }

  if (!rule.is_covered) {
    return {
      ...IDLE_STATE,
      status:         'not_covered',
      category:       llm.category,
      procedureLabel: llm.procedure_label,
      examplePattern: rule.example_pattern,
    }
  }

  // Verifica carência
  let daysRemaining: number | null = null
  if (rule.waiting_days > 0) {
    if (ctx.enrollmentDate) {
      const ms       = Date.now() - new Date(`${ctx.enrollmentDate}T00:00:00`).getTime()
      const enrolled = Math.floor(ms / 86_400_000)
      daysRemaining  = Math.max(0, rule.waiting_days - enrolled)
    } else {
      // Sem enrollment_date conhecido: conservador — assume carência ainda rolando.
      daysRemaining = rule.waiting_days
    }
  }

  if (daysRemaining !== null && daysRemaining > 0) {
    return {
      status:           'caution',
      category:         llm.category,
      procedureLabel:   llm.procedure_label,
      copayAmount:      rule.copay_amount,
      copayCharger:     rule.copay_charger,
      waitingDaysTotal: rule.waiting_days,
      daysRemaining,
      examplePattern:   rule.example_pattern,
    }
  }

  return {
    status:           'covered',
    category:         llm.category,
    procedureLabel:   llm.procedure_label,
    copayAmount:      rule.copay_amount,
    copayCharger:     rule.copay_charger,
    waitingDaysTotal: rule.waiting_days,
    daysRemaining:    null,
    examplePattern:   rule.example_pattern,
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePetCoverageSemaforo({
  patientId, transcript, isListening,
}: Opts): SemaforoState {
  const [context, setContext] = useState<PetCoverageContext | null>(null)
  const [state,   setState]   = useState<SemaforoState>(IDLE_STATE)

  // ── Carrega contexto do pet quando patientId muda ────────────────────────
  useEffect(() => {
    if (!patientId) { setContext(null); setState(IDLE_STATE); return }
    let cancelled = false
    getPetCoverageContext(patientId).then(ctx => {
      if (!cancelled) setContext(ctx)
    }).catch(() => { if (!cancelled) setContext(null) })
    return () => { cancelled = true }
  }, [patientId])

  // useMemo para evitar re-renders quando o objeto context muda referência
  // mas o conteúdo é o mesmo (raro, mas Realtime poderia disparar).
  const stableContext = useMemo(() => context, [
    context?.providerName,
    context?.planType,
    context?.enrollmentDate,
    context?.hasPlan,
    context?.coverage,
  ])

  // ── Refs do orquestrador ──────────────────────────────────────────────────
  const lastSnippetRef        = useRef<string>('')
  const wordsAtLastTriggerRef = useRef<number>(0)
  const debounceTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef    = useRef<AbortController | null>(null)
  /** Token de geração para descartar respostas obsoletas. */
  const requestTokenRef       = useRef<number>(0)

  function clearDebounce() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }

  function abortInflight() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  // ── Quando para de ouvir: cancela tudo, volta a IDLE ──────────────────────
  useEffect(() => {
    if (!isListening) {
      clearDebounce()
      abortInflight()
      setState(prev => prev.status === 'analyzing' ? IDLE_STATE : prev)
    }
  }, [isListening])

  // ── Trigger principal: reage ao transcript ────────────────────────────────
  useEffect(() => {
    if (!isListening) return
    if (!stableContext?.hasPlan) return

    const snippet = transcript.slice(-600)
    if (!snippet.trim()) return
    if (snippet === lastSnippetRef.current) return

    // Conta palavras do snippet atual; gatilho imediato se cresceu 30+ desde
    // a última extração.
    const wordCount = snippet.split(/\s+/).filter(Boolean).length
    const wordsSinceTrigger = wordCount - wordsAtLastTriggerRef.current
    const triggerImmediate  = wordsSinceTrigger >= 30

    const runExtraction = async () => {
      clearDebounce()
      abortInflight()

      const token = ++requestTokenRef.current
      const ac    = new AbortController()
      abortControllerRef.current = ac

      const cacheKey = `${patientId ?? ''}:${stableContext.providerName ?? ''}:${stableContext.planType ?? ''}:${hashString(snippet)}`
      const cached   = lruGet(cacheKey)

      let result: LlmCoverageResponse | null
      if (cached !== undefined) {
        result = cached
      } else {
        // só mostra "analyzing" se não temos cache (UX: chip não pisca toda hora)
        setState(prev => ({ ...prev, status: 'analyzing' }))
        try {
          const res = await fetch('/api/coverage/extract', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ text: snippet }),
            signal:  ac.signal,
          })
          if (token !== requestTokenRef.current) return  // resposta obsoleta
          if (!res.ok) { result = null }
          else {
            result = (await res.json()) as LlmCoverageResponse | null
          }
          lruSet(cacheKey, result)
        } catch (err) {
          const e = err as { name?: string }
          if (e?.name === 'AbortError') return
          result = null
        }
      }

      if (token !== requestTokenRef.current) return
      lastSnippetRef.current        = snippet
      wordsAtLastTriggerRef.current = wordCount
      setState(resolveState(result, stableContext))
    }

    if (triggerImmediate) {
      runExtraction()
    } else {
      clearDebounce()
      debounceTimerRef.current = setTimeout(runExtraction, 2000)
    }

    return () => {
      clearDebounce()
      // não aborta aqui — pode ser apenas re-execução do effect por nova
      // chunk de transcript. Aborto real é no unmount / isListening=false.
    }
  }, [transcript, isListening, stableContext, patientId])

  // ── Cleanup geral ─────────────────────────────────────────────────────────
  useEffect(() => () => {
    clearDebounce()
    abortInflight()
    requestTokenRef.current++   // invalida qualquer resposta em voo
  }, [])

  return state
}
