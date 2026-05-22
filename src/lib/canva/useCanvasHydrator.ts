'use client'

/**
 * useCanvasHydrator — Motor de Hidratação Universal do Canvas Visual.
 *
 * Recebe o `ResolveContext` resolvido server-side (níveis 1+2, mais
 * Nível 3 estático com `vet_notes`/`audio_transcript` já persistidos)
 * e re-hidrata reativamente quando o MV edita campos no consultório:
 *
 *   - Textarea "Medicamentos" do form → parser determinístico imediato
 *     + chamada à IA com debounce (700ms) para enriquecer dose/via/etc.
 *   - Textareas "Posologia" / "Observações" → propagados como
 *     `frequency` / `orientation` dos itens parseados quando ausentes.
 *
 * Output: { hydratedContext, status, prescriptionsSource } onde
 *   status ∈ 'idle' | 'parsing' | 'extracting' | 'ready' | 'error'
 *   prescriptionsSource ∈ 'db' | 'parser' | 'ai' | 'mixed' | 'empty'
 *
 * Garantias:
 *   1. Se o banco já tem prescrições reais (tabela `prescriptions`),
 *      elas mandam — o hook NÃO sobrescreve com extração textual.
 *   2. Hidratação é idempotente: re-renders não disparam nova IA se
 *      o texto não mudou.
 *   3. Cleanup de timer pendente quando o componente desmonta.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResolveContext } from './dynamic-tags'
import {
  parseMedicamentosText, prescriptionsHaveStructure, type ParsedPrescription,
} from './parse-medicamentos'

export type HydratorStatus = 'idle' | 'parsing' | 'extracting' | 'ready' | 'error'
export type PrescriptionsSource = 'db' | 'parser' | 'ai' | 'mixed' | 'empty'

export interface HydratorLiveInput {
  /** Texto bruto do textarea "Medicamentos" — fonte primária do parser. */
  medicamentos?:   string
  /** Posologia geral aplicada a todos os itens se não vier item-a-item. */
  posologia?:      string
  /** Orientações gerais (mesma regra). */
  observacoes?:    string
  /** Texto extra (ex: anamnese editada no live) que vai junto à IA. */
  anamneseExtra?:  string
}

export interface UseCanvasHydratorOptions {
  /** Latência do debounce para a chamada de IA. Default 700ms. */
  debounceMs?:        number
  /** Liga/desliga a camada IA do live edit. Default true. */
  enableAi?:          boolean
  /** Comprimento mínimo de texto para acionar a IA. Default 24. */
  minTextForAi?:      number
}

export interface HydratorResult {
  /** ResolveContext já enriquecido — passar direto ao CanvasStage. */
  hydratedContext:     ResolveContext | undefined
  status:              HydratorStatus
  prescriptionsSource: PrescriptionsSource
  /** Confiança da IA quando aplicável; undefined caso contrário. */
  aiConfidence?:       'high' | 'medium' | 'low'
}

interface ApiResponse {
  prescriptions: ParsedPrescription[]
  confidence:    'high' | 'medium' | 'low'
  source:        'ai' | 'parser' | 'empty'
}

/**
 * Hook principal. Mantém referência ao texto enviado por último para
 * IA evitando re-disparos quando só caracteres irrelevantes mudam.
 */
export function useCanvasHydrator(
  initialContext: ResolveContext | undefined,
  live: HydratorLiveInput,
  options: UseCanvasHydratorOptions = {},
): HydratorResult {
  const { debounceMs = 700, enableAi = true, minTextForAi = 24 } = options

  // Prescrições reais do banco (já vêm em initialContext.consultation.prescriptions).
  const dbPrescriptions = useMemo<Array<Record<string, unknown>>>(() => {
    const c = initialContext?.consultation as Record<string, unknown> | undefined
    const list = c?.prescriptions
    return Array.isArray(list) ? list as Array<Record<string, unknown>> : []
  }, [initialContext])

  // Parser determinístico — síncrono, atualiza a cada keystroke.
  const parsedPrescriptions = useMemo<ParsedPrescription[]>(
    () => parseMedicamentosText(live.medicamentos),
    [live.medicamentos],
  )

  // Resultado da IA (debounced). Inicia null; preenchido após primeira extração.
  const [aiPrescriptions, setAiPrescriptions] = useState<ParsedPrescription[] | null>(null)
  const [aiConfidence, setAiConfidence] = useState<HydratorResult['aiConfidence']>(undefined)
  const [aiStatus, setAiStatus] = useState<'idle' | 'extracting' | 'ready' | 'error'>('idle')

  const lastExtractedRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // O parser produziu itens estruturados (com dose/freq/duração)?
  // Se não, mesmo com `parsed.length > 0` precisamos chamar a IA para
  // tentar extrair estrutura — caso contrário o template renderiza
  // "Amoxilina — · · dias" com separadores órfãos.
  const parserIsStructured = useMemo(
    () => prescriptionsHaveStructure(parsedPrescriptions),
    [parsedPrescriptions],
  )

  // Texto enviado à IA: anamnese extra (vet_notes do consultório editado)
  // + medicamentos quando o parser não conseguiu estruturar.
  const aiInputText = useMemo(() => {
    const parts: string[] = []
    if (live.anamneseExtra?.trim()) parts.push(live.anamneseExtra.trim())
    if ((live.medicamentos?.trim().length ?? 0) > 0 && !parserIsStructured) {
      parts.push(live.medicamentos!.trim())
    }
    return parts.join('\n\n')
  }, [live.anamneseExtra, live.medicamentos, parserIsStructured])

  useEffect(() => {
    // Desliga IA quando: feature off, banco já tem prescrições reais
    // (evita custo desnecessário), parser já cobriu tudo, ou texto curto.
    if (!enableAi) return
    if (dbPrescriptions.length > 0) {
      // Limpa qualquer resultado de IA prévio — banco manda.
      if (aiPrescriptions !== null) {
        setAiPrescriptions(null)
        setAiConfidence(undefined)
        setAiStatus('idle')
      }
      return
    }
    if (aiInputText.length < minTextForAi) {
      if (aiPrescriptions !== null) {
        setAiPrescriptions(null)
        setAiConfidence(undefined)
        setAiStatus('idle')
      }
      return
    }
    if (aiInputText === lastExtractedRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setAiStatus('extracting')
      try {
        const res = await fetch('/api/extract-anamnese', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: aiInputText }),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as ApiResponse
        lastExtractedRef.current = aiInputText
        setAiPrescriptions(data.prescriptions ?? [])
        setAiConfidence(data.confidence)
        setAiStatus('ready')
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error('[useCanvasHydrator] IA falhou:', e)
        setAiStatus('error')
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // aiPrescriptions intencionalmente fora das deps — evita loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiInputText, dbPrescriptions.length, enableAi, debounceMs, minTextForAi])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  // Aplica posologia/observações gerais como complemento dos itens que
  // não trouxeram esses campos no parse/IA.
  function enrichItem<T extends ParsedPrescription | Record<string, unknown>>(p: T): T {
    const item = { ...p } as Record<string, unknown>
    if (!item.frequency && live.posologia?.trim())   item.frequency   = live.posologia.trim()
    if (!item.orientation && live.observacoes?.trim()) item.orientation = live.observacoes.trim()
    return item as T
  }

  // Decide qual fonte usar e monta o `effectivePrescriptions` final.
  const { effectivePrescriptions, prescriptionsSource } = useMemo(() => {
    if (dbPrescriptions.length > 0) {
      return {
        effectivePrescriptions: dbPrescriptions.map(enrichItem),
        prescriptionsSource: 'db' as PrescriptionsSource,
      }
    }
    const fromAi = aiPrescriptions && aiPrescriptions.length > 0
    // Quando o parser NÃO trouxe estrutura mas a IA trouxe, a IA vence
    // (evita item bruto sem dose/freq/duração no template).
    if (!parserIsStructured && fromAi) {
      return {
        effectivePrescriptions: aiPrescriptions!.map(enrichItem),
        prescriptionsSource: 'ai' as PrescriptionsSource,
      }
    }
    if (parserIsStructured && fromAi) {
      // Parser estruturado + IA → preferência ao parser, IA adiciona itens
      // não duplicados (nome diferente).
      const seen = new Set(parsedPrescriptions.map(p => p.medication.toLowerCase()))
      const extra = aiPrescriptions!.filter(p => !seen.has(p.medication.toLowerCase()))
      return {
        effectivePrescriptions: [...parsedPrescriptions, ...extra].map(enrichItem),
        prescriptionsSource: 'mixed' as PrescriptionsSource,
      }
    }
    if (parsedPrescriptions.length > 0) {
      return {
        effectivePrescriptions: parsedPrescriptions.map(enrichItem),
        prescriptionsSource: 'parser' as PrescriptionsSource,
      }
    }
    if (fromAi) {
      return {
        effectivePrescriptions: aiPrescriptions!.map(enrichItem),
        prescriptionsSource: 'ai' as PrescriptionsSource,
      }
    }
    return { effectivePrescriptions: [], prescriptionsSource: 'empty' as PrescriptionsSource }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPrescriptions, parsedPrescriptions, parserIsStructured, aiPrescriptions, live.posologia, live.observacoes])

  const hydratedContext = useMemo<ResolveContext | undefined>(() => {
    if (!initialContext) return initialContext
    const consultation = (initialContext.consultation as Record<string, unknown> | undefined) ?? {}
    // Evita criar objeto novo quando nada mudou — o repeater renderiza
    // novamente só quando esse identity muda.
    if (
      Array.isArray(consultation.prescriptions) &&
      consultation.prescriptions.length === effectivePrescriptions.length &&
      prescriptionsSource === 'db'
    ) {
      return initialContext
    }
    return {
      ...initialContext,
      consultation: { ...consultation, prescriptions: effectivePrescriptions },
    }
  }, [initialContext, effectivePrescriptions, prescriptionsSource])

  const status: HydratorStatus = (() => {
    if (aiStatus === 'extracting') return 'extracting'
    if (aiStatus === 'error')      return 'error'
    if (parsedPrescriptions.length > 0 && aiStatus === 'idle') return 'parsing'
    if (effectivePrescriptions.length > 0) return 'ready'
    return 'idle'
  })()

  return { hydratedContext, status, prescriptionsSource, aiConfidence }
}
