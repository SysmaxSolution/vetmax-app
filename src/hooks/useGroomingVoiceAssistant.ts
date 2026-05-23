'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { buildWakeRe, buildStopRe, fuzzyMatchCustom } from '@/lib/voice-triggers'
import { voiceLock, VOICE_PRIORITY, generateVoiceOwnerId } from '@/lib/voice/lock'

export type VoiceAssistantState = 'IDLE' | 'RECORDING' | 'CONFIRM_WA'

interface Opts {
  /** Chamado quando a evolução deve ser salva (silêncio de 15s ou comando de parar) */
  onAutoSave:     (transcript: string) => Promise<void>
  /** Chamado quando o usuário confirmar envio de WhatsApp por voz */
  onSendWA:       () => void
  /** Gatilhos customizados da clínica para ativar gravação */
  startTriggers?: string[]
  /** Gatilhos customizados da clínica para salvar a evolução */
  stopTriggers?:  string[]
}

/**
 * Hook de assistente de voz Hands-Free — Banho e Tosa.
 *
 * UMA única instância de SpeechRecognition com continuous=true e interimResults=true.
 * Toda a lógica é de ESTADO, não de hardware: a instância nunca é reiniciada pelo usuário.
 *
 * IDLE      → ouve tudo; wake word detectada → beep + RECORDING
 * RECORDING → acumula transcrição visível; save command → strip trigger + beep + CONFIRM_WA
 * CONFIRM_WA→ aguarda "enviar" / "não" por voz
 *
 * API pública: activate(), deactivate(), manualToggle()
 */
export function useGroomingVoiceAssistant({ onAutoSave, onSendWA, startTriggers, stopTriggers }: Opts) {
  const [state,      setState]      = useState<VoiceAssistantState>('IDLE')
  const [transcript, setTranscript] = useState('')

  // ─── Refs (evitam closures stale nos handlers do SR) ─────────────────────────
  const recognitionRef           = useRef<any>(null)
  const silenceTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRemainingRef = useRef<number | null>(null)
  const silenceTimerStartedAtRef = useRef<number>(0)
  const finalTranscriptRef       = useRef('')       // texto finalizado acumulado durante RECORDING
  const recordingStartRef        = useRef(0)        // índice em event.results onde RECORDING começou
  const lastResultLenRef         = useRef(0)        // último event.results.length visto (para manualToggle)
  const isActivatedRef           = useRef(false)    // true após activate(), false após deactivate()
  const isSuspendedRef           = useRef(false)
  const ownerIdRef               = useRef<string>(generateVoiceOwnerId('grooming'))
  const stateRef                 = useRef<VoiceAssistantState>('IDLE')
  const wakeWordReRef            = useRef<RegExp>(buildWakeRe([]))
  const saveCmdReRef             = useRef<RegExp>(buildStopRe([]))
  const onAutoSaveRef            = useRef(onAutoSave)
  const onSendWARef              = useRef(onSendWA)
  const processedFinalIndicesRef = useRef<Set<number>>(new Set())
  const wakeChunkIndexRef        = useRef<number>(-1)
  const wakeChunkOffsetRef       = useRef<number>(0)

  useEffect(() => { stateRef.current     = state      }, [state])
  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])
  useEffect(() => { onSendWARef.current   = onSendWA   }, [onSendWA])
  useEffect(() => {
    wakeWordReRef.current = buildWakeRe(startTriggers ?? [])
    saveCmdReRef.current  = buildStopRe(stopTriggers  ?? [])
  }, [startTriggers, stopTriggers])

  // ─── Áudio ───────────────────────────────────────────────────────────────────

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

  // ─── TTS ─────────────────────────────────────────────────────────────────────

  function speak(text: string) {
    try {
      window.speechSynthesis.cancel()
      const utt    = new SpeechSynthesisUtterance(text)
      utt.lang     = 'pt-BR'; utt.rate = 1.05
      const voices = window.speechSynthesis.getVoices()
      const pt     = voices.find(v => v.lang.startsWith('pt') && v.name.includes('Google'))
                  ?? voices.find(v => v.lang.startsWith('pt'))
      if (pt) utt.voice = pt
      window.speechSynthesis.speak(utt)
    } catch { /* noop */ }
  }

  // ─── Timer de silêncio ────────────────────────────────────────────────────────

  function clearSilenceTimer() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    silenceTimerRemainingRef.current = null
  }

  function armSilenceTimer(ms: number) {
    clearSilenceTimer()
    silenceTimerStartedAtRef.current = Date.now()
    silenceTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'RECORDING') triggerSave(finalTranscriptRef.current)
    }, ms)
  }

  function pauseSilenceTimer() {
    if (!silenceTimerRef.current) return
    const elapsed = Date.now() - silenceTimerStartedAtRef.current
    const remaining = Math.max(0, 15_000 - elapsed)
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

  function tokenize(s: string): string[] {
    return s.toLowerCase().match(/\p{L}+|\d+/gu) ?? []
  }

  function buildShingles(tokens: string[], k = 3): Set<string> {
    const out = new Set<string>()
    if (tokens.length < k) return out
    for (let i = 0; i + k <= tokens.length; i++) {
      out.add(tokens.slice(i, i + k).join(' '))
    }
    return out
  }

  function isReemission(delta: string, baseShingles: Set<string>): boolean {
    const dTokens = tokenize(delta)
    if (dTokens.length < 5) return false
    const dShingles = buildShingles(dTokens, 3)
    if (dShingles.size === 0 || baseShingles.size === 0) return false
    let common = 0
    for (const s of dShingles) if (baseShingles.has(s)) common++
    return common / dShingles.size >= 0.85
  }

  // ─── Overlap dedup ───────────────────────────────────────────────────────────

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
    const chars = cMatches.slice(0, overlap).reduce((s, t) => s + t.tok.length, 0)
    if (chars < 5) return incomingTrim
    return incomingTrim.slice(cMatches[overlap - 1].end).trimStart()
  }

  // ─── Salvar evolução ──────────────────────────────────────────────────────────

  function triggerSave(rawText: string) {
    clearSilenceTimer()
    // Remove o próprio gatilho de parada do texto antes de salvar
    const clean = rawText.replace(saveCmdReRef.current, '').replace(/\s{2,}/g, ' ').trim()
    finalTranscriptRef.current = ''
    processedFinalIndicesRef.current.clear()
    wakeChunkIndexRef.current  = -1
    wakeChunkOffsetRef.current = 0
    setState('CONFIRM_WA')
    setTranscript('')
    playBeep(660)
    onAutoSaveRef.current(clean).then(() => speak('Evolução salva. Deseja enviar WhatsApp?'))
  }

  // ─── Motor: ÚNICA instância contínua ─────────────────────────────────────────

  function startRec() {
    if (isSuspendedRef.current) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || recognitionRef.current) return

    const r       = new SR()
    r.lang           = 'pt-BR'
    r.continuous     = true
    r.interimResults = true   // ← SEMPRE true: uma instância serve todos os modos
    r.maxAlternatives = 1
    recognitionRef.current = r
    processedFinalIndicesRef.current.clear()

    // Se parar inesperadamente (erro / timeout do browser), reinicia
    r.onerror = (e: any) => {
      if (e.error === 'aborted') return
      recognitionRef.current = null
      if (isActivatedRef.current && !isSuspendedRef.current) {
        if (stateRef.current === 'RECORDING') recordingStartRef.current = 0
        setTimeout(startRec, 400)
      }
    }

    r.onend = () => {
      recognitionRef.current = null
      if (isActivatedRef.current && !isSuspendedRef.current) {
        if (stateRef.current === 'RECORDING') recordingStartRef.current = 0
        setTimeout(startRec, 300)
      }
    }

    r.onresult = (event: any) => {
      lastResultLenRef.current = event.results.length
      const curState = stateRef.current

      // ── IDLE: detecta wake word — só em FINAL para evitar disparo prematuro ─
      if (curState === 'IDLE') {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue
          const chunk = event.results[i][0].transcript
          const m     = wakeWordReRef.current.exec(chunk)
          const fuzzy = !m && fuzzyMatchCustom(chunk, startTriggers ?? [])
          if (m || fuzzy) {
            wakeChunkIndexRef.current  = i
            wakeChunkOffsetRef.current = m ? m.index + m[0].length : chunk.length
            recordingStartRef.current  = i
            finalTranscriptRef.current = ''
            processedFinalIndicesRef.current.clear()
            setState('RECORDING')
            setTranscript('')
            playBeep()
            return
          }
        }
        return
      }

      // ── RECORDING: acumula transcrição, detecta save command (só no delta) ──
      if (curState === 'RECORDING') {
        let interim         = ''
        let finalBuffer     = finalTranscriptRef.current
        let bufferShingles  = buildShingles(tokenize(finalBuffer), 3)
        let hadNewFinals    = false
        const newDeltaParts: string[] = []

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (i < recordingStartRef.current) continue
          if (event.results[i].isFinal) {
            let rawText = event.results[i][0].transcript
            if (i === wakeChunkIndexRef.current && wakeChunkOffsetRef.current > 0) {
              rawText = rawText.slice(wakeChunkOffsetRef.current).trimStart()
              wakeChunkIndexRef.current  = -1
              wakeChunkOffsetRef.current = 0
            }
            if (!rawText.trim() || processedFinalIndicesRef.current.has(i)) continue
            processedFinalIndicesRef.current.add(i)
            const delta = removeLeadingOverlap(finalBuffer, rawText)
            if (!delta) continue
            if (isReemission(delta, bufferShingles)) continue
            newDeltaParts.push(delta)
            finalBuffer  = (finalBuffer + ' ' + delta).trim()
            const newTokens = tokenize(finalBuffer)
            const startIdx  = Math.max(0, newTokens.length - tokenize(delta).length - 2)
            for (let j = startIdx; j + 3 <= newTokens.length; j++) {
              bufferShingles.add(newTokens.slice(j, j + 3).join(' '))
            }
            hadNewFinals = true
          } else {
            let raw = event.results[i][0].transcript
            if (i === wakeChunkIndexRef.current && wakeChunkOffsetRef.current > 0) {
              raw = raw.slice(wakeChunkOffsetRef.current).trimStart()
            }
            interim = raw
          }
        }

        if (hadNewFinals) finalTranscriptRef.current = finalBuffer

        const displayInterim = removeLeadingOverlap(finalBuffer, interim)
        const fullText = (finalBuffer + (displayInterim ? ' ' + displayInterim : '')).trim()

        // Stop-word: testa SÓ no que entrou agora.
        const newText = (newDeltaParts.join(' ') + ' ' + displayInterim).trim()
        if (newText && (
          saveCmdReRef.current.test(newText) ||
          fuzzyMatchCustom(newText, stopTriggers ?? [])
        )) {
          triggerSave(fullText)
          return
        }

        setTranscript(fullText)
        if (hadNewFinals) armSilenceTimer(15_000)
        return
      }

      // ── CONFIRM_WA: aguarda "enviar" / "não" ────────────────────────────────
      if (curState === 'CONFIRM_WA') {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript.toLowerCase()
          if (/\b(enviar|sim|pode)\b/.test(text)) {
            setState('IDLE'); setTranscript(''); onSendWARef.current()
            return
          }
          if (/\b(agora n[aã]o|n[aã]o|cancelar)\b/.test(text)) {
            setState('IDLE'); setTranscript('')
            return
          }
        }
      }
    }

    r.start()
  }

  // ─── API pública ──────────────────────────────────────────────────────────────

  function suspendEngine() {
    isSuspendedRef.current = true
    pauseSilenceTimer()
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } recognitionRef.current = null }
  }

  function resumeEngine() {
    isSuspendedRef.current = false
    if (isActivatedRef.current) {
      startRec()
      resumeSilenceTimer()
    }
  }

  /** Inicia a escuta contínua. Chamar no mount do componente consumidor. */
  const activate = useCallback(() => {
    if (isActivatedRef.current || recognitionRef.current) return
    isActivatedRef.current = true
    const { isActive } = voiceLock.acquire({
      id:        ownerIdRef.current,
      priority:  VOICE_PRIORITY.AMBIENT,
      onSuspend: suspendEngine,
      onResume:  resumeEngine,
    })
    isSuspendedRef.current = !isActive
    if (isActive) startRec()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Para a escuta e reseta o estado. Chamar no unmount do componente consumidor. */
  const deactivate = useCallback(() => {
    isActivatedRef.current = false
    isSuspendedRef.current = false
    clearSilenceTimer()
    const r = recognitionRef.current
    if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } recognitionRef.current = null }
    voiceLock.release(ownerIdRef.current)
    window.speechSynthesis?.cancel()
    setState('IDLE')
    setTranscript('')
    finalTranscriptRef.current = ''
    wakeChunkIndexRef.current  = -1
    wakeChunkOffsetRef.current = 0
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Failsafe físico (barra de espaço / clique no botão):
   *  IDLE      → inicia RECORDING imediatamente com beep
   *  RECORDING → dispara triggerSave com o texto acumulado
   */
  const manualToggle = useCallback(() => {
    if (stateRef.current === 'IDLE') {
      recordingStartRef.current  = lastResultLenRef.current  // ignora tudo transcrito antes
      finalTranscriptRef.current = ''
      setState('RECORDING')
      setTranscript('')
      playBeep()
    } else if (stateRef.current === 'RECORDING') {
      triggerSave(finalTranscriptRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      isActivatedRef.current = false
      isSuspendedRef.current = false
      clearSilenceTimer()
      const r = recognitionRef.current
      if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } }
      voiceLock.release(ownerIdRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, transcript, activate, deactivate, manualToggle, isActive: state !== 'IDLE' }
}
