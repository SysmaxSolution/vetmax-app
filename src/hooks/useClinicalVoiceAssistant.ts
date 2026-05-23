'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { buildWakeRe, buildStopRe, fuzzyMatchCustom } from '@/lib/voice-triggers'
import { voiceLock, VOICE_PRIORITY, generateVoiceOwnerId } from '@/lib/voice/lock'

export type ClinicalVoiceState = 'IDLE' | 'RECORDING' | 'CONFIRM_WA'

interface Opts {
  /** Chamado quando há texto para salvar (silêncio de 15s ou comando de parada) */
  onAutoSave:     (transcript: string) => void
  /**
   * Chamado quando o usuário confirma envio de WhatsApp por voz ("sim/enviar/pode").
   *
   * Quando passado, o hook entra em CONFIRM_WA após salvar — o que faz o
   * Speech Recognition ficar ouvindo a resposta sim/não enquanto o modal de
   * WhatsApp está aberto. Compatível com o `autoSend` do WhatsAppNotificationModal:
   * a tela seta `voiceConfirmedWA=true` quando este callback dispara, e o modal
   * envia automaticamente.
   *
   * Se omitido, o hook volta direto para IDLE após salvar (comportamento original).
   */
  onSendWA?:      () => void
  /** Chamado quando o usuário recusa envio por voz ("não/cancelar"). Opcional. */
  onSkipWA?:      () => void
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
export function useClinicalVoiceAssistant({ onAutoSave, onSendWA, onSkipWA, startTriggers, stopTriggers }: Opts) {
  const [state,      setState]      = useState<ClinicalVoiceState>('IDLE')
  const [transcript, setTranscript] = useState('')

  const recognitionRef           = useRef<any>(null)
  const silenceTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRemainingRef = useRef<number | null>(null)   // ms restantes quando suspenso
  const silenceTimerStartedAtRef = useRef<number>(0)              // wall clock do último arme
  const finalTranscriptRef       = useRef('')
  const recordingStartRef        = useRef(0)
  const lastResultLenRef         = useRef(0)
  const isActivatedRef           = useRef(false)
  const isSuspendedRef           = useRef(false)                  // true enquanto outro owner segura o lock
  const ownerIdRef               = useRef<string>(generateVoiceOwnerId('clinical'))
  const stateRef                 = useRef<ClinicalVoiceState>('IDLE')
  const wakeWordReRef            = useRef<RegExp>(buildWakeRe([]))
  const saveCmdReRef             = useRef<RegExp>(buildStopRe([]))
  const onAutoSaveRef            = useRef(onAutoSave)
  const onSendWARef              = useRef(onSendWA)
  const onSkipWARef              = useRef(onSkipWA)
  const processedFinalIndicesRef = useRef<Set<number>>(new Set())
  // Quando a wake word é detectada num chunk interim, o mesmo índice virará final
  // depois. Guardamos a posição do final do match para extrair só o sufixo do chunk
  // final (a frase que veio JUNTO com "assistente, ...").
  const wakeChunkIndexRef        = useRef<number>(-1)
  const wakeChunkOffsetRef       = useRef<number>(0)

  useEffect(() => { stateRef.current      = state      }, [state])
  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])
  useEffect(() => { onSendWARef.current   = onSendWA   }, [onSendWA])
  useEffect(() => { onSkipWARef.current   = onSkipWA   }, [onSkipWA])
  useEffect(() => {
    wakeWordReRef.current = buildWakeRe(startTriggers ?? [])
    saveCmdReRef.current  = buildStopRe(stopTriggers  ?? [])
  }, [startTriggers, stopTriggers])

  /**
   * TTS curto para feedback. Não bloqueia — só dispara se window.speechSynthesis
   * estiver disponível.
   */
  function speak(text: string) {
    try {
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = 'pt-BR'; utt.rate = 1.05
      const voices = window.speechSynthesis.getVoices()
      const pt = voices.find(v => v.lang.startsWith('pt') && v.name.includes('Google'))
              ?? voices.find(v => v.lang.startsWith('pt'))
      if (pt) utt.voice = pt
      window.speechSynthesis.speak(utt)
    } catch { /* noop */ }
  }

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
    silenceTimerRemainingRef.current = null
  }

  function armSilenceTimer(ms: number) {
    clearSilenceTimer()
    silenceTimerStartedAtRef.current = Date.now()
    silenceTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'RECORDING') triggerSave(finalTranscriptRef.current)
    }, ms)
  }

  /** Pausa o timer guardando o tempo restante; usado em onSuspend. */
  function pauseSilenceTimer() {
    if (!silenceTimerRef.current) return
    const elapsed = Date.now() - silenceTimerStartedAtRef.current
    const remaining = Math.max(0, 15_000 - elapsed)
    clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
    silenceTimerRemainingRef.current = remaining
  }

  /** Retoma o timer com o restante guardado; usado em onResume. */
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

  // Detecta se `delta` é re-emissão do que já existe em `baseShingles` (n-gramas
  // de 3 tokens do buffer atual). Threshold 0.85 captura re-emissões pós-restart
  // do engine sem disparar em correções legítimas (ex.: "direita" → "esquerda"
  // numa frase parecida geram ~0.85; "esperar"/"expressar" + sufixo extra dão 0.95+).
  function isReemission(delta: string, baseShingles: Set<string>): boolean {
    const dTokens = tokenize(delta)
    if (dTokens.length < 5) return false
    const dShingles = buildShingles(dTokens, 3)
    if (dShingles.size === 0 || baseShingles.size === 0) return false
    let common = 0
    for (const s of dShingles) if (baseShingles.has(s)) common++
    return common / dShingles.size >= 0.85
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
    wakeChunkIndexRef.current  = -1
    wakeChunkOffsetRef.current = 0
    setTranscript('')
    playBeep(660)
    onAutoSaveRef.current(clean)
    // Se a tela passou onSendWA, entra em CONFIRM_WA para ouvir sim/não.
    // O Speech Recognition continua ativo — a tela vai abrir o modal de WA
    // com autoSend=true quando o callback dispara.
    if (onSendWARef.current) {
      setState('CONFIRM_WA')
      speak('Salvo. Deseja enviar WhatsApp?')
    } else {
      setState('IDLE')
    }
  }

  function startRec() {
    // Nunca abre o engine enquanto outro owner (priority maior) detém o lock.
    if (isSuspendedRef.current) return
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

      // IDLE: detecta wake word — só em FINAL (evita disparo em palavras parciais
      // tipo "assist..." e em frases onde "assistente" aparece como substantivo).
      if (curState === 'IDLE') {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue
          const chunk = event.results[i][0].transcript
          const m     = wakeWordReRef.current.exec(chunk)
          const fuzzy = !m && fuzzyMatchCustom(chunk, startTriggers ?? [])
          if (m || fuzzy) {
            // Preserva o sufixo do mesmo chunk (texto pós wake-word) para não
            // perder "vamos começar a anotação" em "assistente, vamos começar a anotação".
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

      // RECORDING: acumula transcrição, detecta stop command (APENAS no delta novo).
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
            // Se for o chunk onde a wake word foi detectada, descarta o prefixo até o wake.
            if (i === wakeChunkIndexRef.current && wakeChunkOffsetRef.current > 0) {
              rawText = rawText.slice(wakeChunkOffsetRef.current).trimStart()
              wakeChunkIndexRef.current  = -1
              wakeChunkOffsetRef.current = 0
            }
            if (!rawText.trim() || processedFinalIndicesRef.current.has(i)) continue
            processedFinalIndicesRef.current.add(i)
            // 1º: extrai o delta tirando overlap nas bordas (ASR cumulativo).
            const delta = removeLeadingOverlap(finalBuffer, rawText)
            if (!delta) continue
            // 2º: se o delta resultante ainda for praticamente uma cópia do buffer
            // (re-emissão pós-restart com texto repetido no meio), descarta.
            if (isReemission(delta, bufferShingles)) continue
            newDeltaParts.push(delta)
            finalBuffer  = (finalBuffer + ' ' + delta).trim()
            // Atualiza shingles incrementalmente (3-grams começando até 2 tokens atrás).
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

        // Stop-word: testa SÓ no que entrou agora (delta + interim).
        // Evita disparo retroativo por palavra que entrou no buffer minutos atrás.
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

      // CONFIRM_WA: aguarda "sim/enviar/pode/manda" ou "não/cancelar".
      // Disparado apenas quando a tela passou onSendWA.
      if (curState === 'CONFIRM_WA') {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript.toLowerCase()
          if (/\b(enviar|sim|pode|manda)\b/.test(text)) {
            setState('IDLE'); setTranscript('')
            onSendWARef.current?.()
            return
          }
          if (/\b(agora n[aã]o|n[aã]o|cancelar|deixa|depois)\b/.test(text)) {
            setState('IDLE'); setTranscript('')
            onSkipWARef.current?.()
            return
          }
        }
      }
    }

    r.start()
  }

  /** Para o motor sem disparar onFinal (suspensão pelo lock). Preserva buffer/timers. */
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
    // se !isActive, esperamos onResume — não inicia motor agora.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      isSuspendedRef.current = false
      clearSilenceTimer()
      const r = recognitionRef.current
      if (r) { r.onend = null; r.onerror = null; try { r.stop() } catch { } }
      voiceLock.release(ownerIdRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, transcript, activate, deactivate, manualToggle }
}
