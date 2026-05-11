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

  const recognitionRef     = useRef<any>(null)
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTranscriptRef = useRef('')
  const recordingStartRef  = useRef(0)
  const lastResultLenRef   = useRef(0)
  const isActivatedRef     = useRef(false)
  const stateRef           = useRef<ClinicalVoiceState>('IDLE')
  const wakeWordReRef      = useRef<RegExp>(buildWakeRe([]))
  const saveCmdReRef       = useRef<RegExp>(buildStopRe([]))
  const onAutoSaveRef      = useRef(onAutoSave)

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

  function triggerSave(rawText: string) {
    clearSilenceTimer()
    const clean = rawText.replace(saveCmdReRef.current, '').replace(/\s{2,}/g, ' ').trim()
    finalTranscriptRef.current = ''
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
        let interim   = ''
        let newFinals = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (i < recordingStartRef.current) continue
          if (event.results[i].isFinal) {
            newFinals += event.results[i][0].transcript + ' '
          } else {
            interim = event.results[i][0].transcript
          }
        }

        if (newFinals) {
          finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + newFinals).trim()
        }

        const fullText = (finalTranscriptRef.current + (interim ? ' ' + interim : '')).trim()

        if (saveCmdReRef.current.test(fullText) || fuzzyMatchCustom(fullText, stopTriggers ?? [])) {
          triggerSave(fullText)
          return
        }

        setTranscript(fullText)
        if (newFinals) {
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
