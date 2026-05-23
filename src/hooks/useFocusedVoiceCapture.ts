'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { buildStopRe, fuzzyMatchCustom } from '@/lib/voice-triggers'
import { voiceLock, VOICE_PRIORITY, generateVoiceOwnerId } from '@/lib/voice/lock'

// ──────────────────────────────────────────────────────────────────────────────
// useFocusedVoiceCapture
//
// Hook de gravação por voz para modais e campos pontuais (motivo de internação,
// nota de WhatsApp, pergunta para o Mentor, busca em workspace, etc.).
//
// Diferenças vs. useClinicalVoiceAssistant:
//   - Não escuta wake word continuamente — só liga quando start() é chamado.
//   - Não tem ciclo IDLE — só dois estados: parado e gravando.
//   - Stop por: stop triggers da clínica, botão (stop()) OU silêncio de 15s.
//   - Beep ao iniciar e parar — feedback consistente.
//   - Cobre reinício automático do engine Chrome (~60s) mantendo a gravação.
//
// Use em campos focados; use useClinicalVoiceAssistant em telas always-listening.
// ──────────────────────────────────────────────────────────────────────────────

interface Opts {
  /** Triggers de parada customizados da clínica. */
  stopTriggers?: string[]
  /** Chamado em tempo real conforme o texto é capturado (final + interim). */
  onInterim?: (text: string) => void
  /** Chamado quando a gravação encerra com o texto final consolidado. */
  onFinal: (text: string) => void
  /** Silêncio em ms que dispara auto-stop. Default 15s. */
  silenceMs?: number
}

export function useFocusedVoiceCapture({ stopTriggers, onInterim, onFinal, silenceMs = 15_000 }: Opts) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript,  setTranscript]  = useState('')

  const recognitionRef     = useRef<any>(null)
  const finalBufferRef     = useRef('')
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRemainingRef = useRef<number | null>(null)
  const silenceTimerStartedAtRef = useRef<number>(0)
  const silenceMsRef       = useRef<number>(silenceMs)
  const isActivatedRef     = useRef(false)
  const isSuspendedRef     = useRef(false)
  const ownerIdRef         = useRef<string>(generateVoiceOwnerId('focused'))
  const stopReRef          = useRef<RegExp>(buildStopRe([]))
  const stopTriggersRef    = useRef<string[]>([])
  const onFinalRef         = useRef(onFinal)
  const onInterimRef       = useRef<typeof onInterim>(onInterim)
  const processedIdxRef    = useRef<Set<number>>(new Set())

  useEffect(() => { silenceMsRef.current = silenceMs }, [silenceMs])

  useEffect(() => { onFinalRef.current  = onFinal  }, [onFinal])
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])
  useEffect(() => {
    stopReRef.current     = buildStopRe(stopTriggers ?? [])
    stopTriggersRef.current = stopTriggers ?? []
  }, [stopTriggers])

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
    } catch { /* noop */ }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    silenceTimerRemainingRef.current = null
  }

  function armSilenceTimer(ms: number) {
    clearSilenceTimer()
    silenceTimerStartedAtRef.current = Date.now()
    silenceTimerRef.current = setTimeout(() => {
      if (isActivatedRef.current && !isSuspendedRef.current) finalize()
    }, ms)
  }

  function pauseSilenceTimer() {
    if (!silenceTimerRef.current) return
    const elapsed = Date.now() - silenceTimerStartedAtRef.current
    const remaining = Math.max(0, silenceMsRef.current - elapsed)
    clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
    silenceTimerRemainingRef.current = remaining
  }

  function resumeSilenceTimer() {
    const rem = silenceTimerRemainingRef.current
    if (rem === null) return
    silenceTimerRemainingRef.current = null
    armSilenceTimer(rem)
  }

  function finalize() {
    clearSilenceTimer()
    const clean = finalBufferRef.current
      .replace(stopReRef.current, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    finalBufferRef.current = ''
    processedIdxRef.current.clear()
    isActivatedRef.current = false
    isSuspendedRef.current = false
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch {} recognitionRef.current = null }
    voiceLock.release(ownerIdRef.current)
    setIsRecording(false)
    setTranscript('')
    playBeep(660)
    onFinalRef.current(clean)
  }

  function startEngine() {
    if (isSuspendedRef.current) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || recognitionRef.current) return

    const r = new SR()
    r.lang = 'pt-BR'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    recognitionRef.current = r
    processedIdxRef.current.clear()

    r.onerror = (e: any) => {
      if (e.error === 'aborted') return
      recognitionRef.current = null
      if (isActivatedRef.current && !isSuspendedRef.current) setTimeout(startEngine, 400)
    }
    r.onend = () => {
      recognitionRef.current = null
      if (isActivatedRef.current && !isSuspendedRef.current) setTimeout(startEngine, 300)
    }

    r.onresult = (event: any) => {
      let interim = ''
      let buffer  = finalBufferRef.current
      let added   = false

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          if (processedIdxRef.current.has(i)) continue
          const raw = event.results[i][0].transcript
          processedIdxRef.current.add(i)
          buffer = (buffer ? buffer + ' ' : '') + raw.trim()
          added  = true
        } else {
          interim = event.results[i][0].transcript
        }
      }

      if (added) finalBufferRef.current = buffer.replace(/\s{2,}/g, ' ').trim()

      const fullText = (finalBufferRef.current + (interim ? ' ' + interim : '')).trim()
      setTranscript(fullText)
      onInterimRef.current?.(fullText)

      // Detecta stop word
      if (stopReRef.current.test(fullText) || fuzzyMatchCustom(fullText, stopTriggersRef.current)) {
        finalize()
        return
      }

      // Reseta timer de silêncio quando há texto novo finalizado
      if (added) armSilenceTimer(silenceMsRef.current)
    }

    r.start()
  }

  function suspendEngine() {
    isSuspendedRef.current = true
    pauseSilenceTimer()
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } recognitionRef.current = null }
  }

  function resumeEngine() {
    isSuspendedRef.current = false
    if (isActivatedRef.current) {
      startEngine()
      resumeSilenceTimer()
    }
  }

  const start = useCallback(() => {
    if (isActivatedRef.current) return
    finalBufferRef.current = ''
    processedIdxRef.current.clear()
    setTranscript('')
    isActivatedRef.current = true
    setIsRecording(true)
    playBeep(880)
    const { isActive } = voiceLock.acquire({
      id:        ownerIdRef.current,
      priority:  VOICE_PRIORITY.FOCUSED,
      onSuspend: suspendEngine,
      onResume:  resumeEngine,
    })
    isSuspendedRef.current = !isActive
    if (isActive) startEngine()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    if (!isActivatedRef.current) return
    finalize()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(() => {
    if (isActivatedRef.current) stop()
    else start()
  }, [start, stop])

  useEffect(() => () => {
    isActivatedRef.current = false
    isSuspendedRef.current = false
    clearSilenceTimer()
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch {} }
    voiceLock.release(ownerIdRef.current)
  }, [])

  return { isRecording, transcript, start, stop, toggle }
}
