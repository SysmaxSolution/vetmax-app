'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { buildWakeRe, buildStopRe, fuzzyMatchCustom } from '@/lib/voice-triggers'

export type ClinicalVoiceState = 'IDLE' | 'RECORDING'

interface Opts {
  /** Chamado quando há texto para salvar (silêncio de 15s ou comando de parada) */
  onAutoSave:     (transcript: string) => void
  /** Gatilhos customizados da clínica para ativar gravação */
  startTriggers?: string[]
  /** Gatilhos customizados da clínica para encerrar gravação */
  stopTriggers?:  string[]
}

/**
 * Hook handsfree para módulos clínicos (Triagem, Consultório, Exames, Internação).
 *
 * Fluxo: IDLE → (wake word) → RECORDING → (stop command | silêncio 15s) → IDLE
 *
 * Uma única instância SpeechRecognition com continuous=true; nunca reiniciada pelo usuário.
 * API: activate(), deactivate(), manualToggle()
 */
export function useClinicalVoiceAssistant({ onAutoSave, startTriggers, stopTriggers }: Opts) {
  const [state,      setState]      = useState<ClinicalVoiceState>('IDLE')
  const [transcript, setTranscript] = useState('')

  const recognitionRef           = useRef<any>(null)
  const silenceTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTranscriptRef       = useRef('')
  const recordingStartRef        = useRef(0)
  const lastResultLenRef         = useRef(0)
  const isActivatedRef           = useRef(false)
  const stateRef                 = useRef<ClinicalVoiceState>('IDLE')
  const wakeWordReRef            = useRef<RegExp>(buildWakeRe([]))
  const saveCmdReRef             = useRef<RegExp>(buildStopRe([]))
  const onAutoSaveRef            = useRef(onAutoSave)
  const processedFinalIndicesRef = useRef<Set<number>>(new Set())
  // Dedup por conteúdo: persiste entre restarts da engine (Chrome mobile reinicia ~60s)
  // para evitar que o mesmo texto seja acumulado duas vezes após um onend/restart.
  const processedFinalTextsRef   = useRef<Set<string>>(new Set())

  useEffect(() => { stateRef.current      = state      }, [state])
  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])
  useEffect(() => {
    wakeWordReRef.current = buildWakeRe(startTriggers ?? [])
    saveCmdReRef.current  = buildStopRe(stopTriggers  ?? [])
  }, [startTriggers, stopTriggers])

  function playBeep(freq = 880) {
    try {
      const ctx  = new AudioContext()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    } catch { /* AudioContext não disponível */ }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
  }

  // Remove do início de `incoming` qualquer texto já presente no final de `base`,
  // usando matching por TOKENS (letras+dígitos), imune a pontuação e espaços extras.
  // Cobre overlaps longos (frases inteiras de ASR cumulativo do Chrome mobile)
  // e variações como "37 ,5" vs "37,5" — ambos tokenizam para ["37","5"].
  function removeLeadingOverlap(base: string, incoming: string): string {
    if (!base || !incoming) return incoming
    const incomingTrim = incoming.trim()
    if (!base.trim() || !incomingTrim) return incomingTrim

    const tokRe   = /\p{L}+|\d+/gu
    const bTokens = (base.toLowerCase().match(tokRe) ?? [])
    const cMatches: { tok: string; end: number }[] = []
    for (const m of incomingTrim.matchAll(tokRe)) {
      cMatches.push({ tok: m[0].toLowerCase(), end: (m.index ?? 0) + m[0].length })
    }
    if (bTokens.length === 0 || cMatches.length === 0) return incomingTrim

    // Maior sufixo de bTokens que é prefixo de cTokens (sem limite arbitrário).
    let overlap = 0
    const max = Math.min(bTokens.length, cMatches.length)
    for (let len = max; len >= 1; len--) {
      let ok = true
      for (let i = 0; i < len; i++) {
        if (bTokens[bTokens.length - len + i] !== cMatches[i].tok) { ok = false; break }
      }
      if (ok) { overlap = len; break }
    }

    if (overlap === 0) return incomingTrim
    if (overlap === cMatches.length) return ''
    // Limiar mínimo (5 chars de texto sobreposto) para evitar falso-positivo em "a"/"e"/"o".
    const chars = cMatches.slice(0, overlap).reduce((s, t) => s + t.tok.length, 0)
    if (chars < 5) return incomingTrim
    return incomingTrim.slice(cMatches[overlap - 1].end).trimStart()
  }

  function triggerSave(rawText: string) {
    clearSilenceTimer()
    const clean = rawText.replace(saveCmdReRef.current, '').replace(/\s{2,}/g, ' ').trim()
    finalTranscriptRef.current = ''
    processedFinalIndicesRef.current.clear()
    processedFinalTextsRef.current.clear()
    setState('IDLE')
    setTranscript('')
    playBeep(660)
    onAutoSaveRef.current(clean)
  }

  function startRec() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || recognitionRef.current) return

    const r          = new SR()
    r.lang           = 'pt-BR'
    r.continuous     = true
    r.interimResults = true
    r.maxAlternatives = 1
    recognitionRef.current = r
    processedFinalIndicesRef.current.clear()

    r.onerror = (e: any) => {
      if (e.error === 'aborted') return
      recognitionRef.current = null
      if (isActivatedRef.current) {
        if (stateRef.current === 'RECORDING') recordingStartRef.current = 0
        setTimeout(startRec, 400)
      }
    }

    r.onend = () => {
      recognitionRef.current = null
      if (isActivatedRef.current) {
        if (stateRef.current === 'RECORDING') recordingStartRef.current = 0
        setTimeout(startRec, 300)
      }
    }

    r.onresult = (event: any) => {
      lastResultLenRef.current = event.results.length
      const curState = stateRef.current

      // IDLE: detecta wake word
      if (curState === 'IDLE') {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript
          if (wakeWordReRef.current.test(chunk) || fuzzyMatchCustom(chunk, startTriggers ?? [])) {
            recordingStartRef.current  = i + 1
            finalTranscriptRef.current = ''
            setState('RECORDING')
            setTranscript('')
            playBeep()
            return
          }
        }
        return
      }

      // RECORDING: acumula transcrição, detecta stop command
      if (curState === 'RECORDING') {
        let interim      = ''
        // finalBuffer cresce à medida que cada final é processado; cada novo final
        // é deduplicado contra o buffer JÁ ACUMULADO — cobre finais cumulativos do
        // Chrome mobile ("a gente" → "a gente tá" → "a gente tá esperando" → ...).
        let finalBuffer  = finalTranscriptRef.current
        let hadNewFinals = false

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (i < recordingStartRef.current) continue
          if (event.results[i].isFinal) {
            const rawText = event.results[i][0].transcript
            const textKey = rawText.trim().toLowerCase()
            if (!processedFinalIndicesRef.current.has(i) && !processedFinalTextsRef.current.has(textKey)) {
              processedFinalIndicesRef.current.add(i)
              processedFinalTextsRef.current.add(textKey)
              const delta = removeLeadingOverlap(finalBuffer, rawText)
              if (delta) {
                finalBuffer  = (finalBuffer + ' ' + delta).trim()
                hadNewFinals = true
              }
            }
          } else {
            interim = event.results[i][0].transcript
          }
        }

        if (hadNewFinals) finalTranscriptRef.current = finalBuffer

        const displayInterim = removeLeadingOverlap(finalBuffer, interim)
        const fullText = (finalBuffer + (displayInterim ? ' ' + displayInterim : '')).trim()

        if (saveCmdReRef.current.test(fullText) || fuzzyMatchCustom(fullText, stopTriggers ?? [])) {
          triggerSave(fullText)
          return
        }

        setTranscript(fullText)
        if (hadNewFinals) {
          clearSilenceTimer()
          silenceTimerRef.current = setTimeout(() => {
            if (stateRef.current === 'RECORDING') triggerSave(finalTranscriptRef.current)
          }, 15_000)
        }
      }
    }

    r.start()
  }

  const activate = useCallback(() => {
    if (isActivatedRef.current || recognitionRef.current) return
    isActivatedRef.current = true
    startRec()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const deactivate = useCallback(() => {
    isActivatedRef.current = false
    clearSilenceTimer()
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } recognitionRef.current = null }
    setState('IDLE')
    setTranscript('')
    finalTranscriptRef.current = ''
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Failsafe físico (clique no botão ou barra de espaço):
   * IDLE      → inicia RECORDING com beep
   * RECORDING → salva imediatamente com o texto acumulado
   */
  const manualToggle = useCallback(() => {
    if (stateRef.current === 'IDLE') {
      recordingStartRef.current  = lastResultLenRef.current
      finalTranscriptRef.current = ''
      setState('RECORDING')
      setTranscript('')
      playBeep()
    } else if (stateRef.current === 'RECORDING') {
      triggerSave(finalTranscriptRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      isActivatedRef.current = false
      clearSilenceTimer()
      const r = recognitionRef.current
      if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, transcript, activate, deactivate, manualToggle }
}
