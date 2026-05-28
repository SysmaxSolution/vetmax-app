'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMedicationScheduler } from '@/hooks/useMedicationScheduler'
import type { HospPrescription } from '@/lib/actions/hospitalization-prescriptions'

/**
 * Alertas Ativos de Enfermagem (Internação Completa).
 *
 * Plugado no mesmo tick de 15s do `useMedicationScheduler`. Quando uma dose
 * fica DEVIDA (overdue), dispara:
 *   - bip sonoro via Web Audio API (dois toques curtos);
 *   - notificação Push do navegador (Notification API) — funciona mesmo com a
 *     aba em segundo plano.
 *
 * Anti-spam: cada (prescription, janela de dose) alarma UMA vez. Quando a dose
 * é aplicada, a chave sai do conjunto overdue; se a próxima janela vencer, um
 * novo alarme dispara (chave nova = next_dose_at diferente).
 *
 * Gestos do navegador: AudioContext e permissão de Notification exigem ação do
 * usuário. Por isso expomos `enableAlarms()` para um botão "ativar alertas".
 * Sem permissão/áudio, o badge visual do card continua sendo o fallback.
 */

export type AlarmPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export interface MedicationAlarmState {
  /** Estado da permissão de notificação do navegador. */
  permission:    AlarmPermission
  /** Áudio liberado (AudioContext resumido após gesto do usuário). */
  soundReady:    boolean
  /** Há pelo menos uma dose atrasada agora. */
  hasOverdue:    boolean
  /** Quantidade de doses atrasadas agora. */
  overdueCount:  number
  /** Pede permissão de notificação + libera o áudio (chamar de um onClick). */
  enableAlarms:  () => Promise<void>
}

function getNotificationPermission(): AlarmPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as AlarmPermission
}

export function useMedicationAlarm(
  prescriptions: HospPrescription[],
  enabled: boolean,
): MedicationAlarmState {
  const scheduler = useMedicationScheduler(prescriptions)

  const [permission, setPermission] = useState<AlarmPermission>('default')
  const [soundReady, setSoundReady] = useState(false)

  const audioCtxRef  = useRef<AudioContext | null>(null)
  // Chaves (prescriptionId:nextDoseAtISO) já alarmadas na janela corrente.
  const alarmedRef   = useRef<Set<string>>(new Set())

  useEffect(() => { setPermission(getNotificationPermission()) }, [])

  const playBeep = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    try {
      const now = ctx.currentTime
      // Dois toques curtos (880 Hz) para chamar atenção.
      for (const offset of [0, 0.28]) {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22)
        osc.start(now + offset)
        osc.stop(now + offset + 0.24)
      }
    } catch { /* áudio indisponível — o badge visual cobre o fallback */ }
  }, [])

  const enableAlarms = useCallback(async () => {
    // 1. Libera o áudio (precisa de gesto do usuário).
    try {
      if (!audioCtxRef.current) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext
        if (Ctor) audioCtxRef.current = new Ctor()
      }
      if (audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume()
      setSoundReady(!!audioCtxRef.current)
      // Toque de confirmação curto
      if (audioCtxRef.current) playBeep()
    } catch { setSoundReady(false) }

    // 2. Pede permissão de notificação.
    if (typeof Notification !== 'undefined') {
      try {
        const p = await Notification.requestPermission()
        setPermission(p as AlarmPermission)
      } catch { /* ignore */ }
    }
  }, [playBeep])

  useEffect(() => {
    if (!enabled) return

    const overdue = scheduler.alerts.filter(a => a.isOverdue)
    const currentKeys = new Set(
      overdue.map(a => `${a.prescription.id}:${a.nextDoseAt.toISOString()}`)
    )
    const newly = overdue.filter(
      a => !alarmedRef.current.has(`${a.prescription.id}:${a.nextDoseAt.toISOString()}`)
    )

    if (newly.length > 0) {
      playBeep()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const first = newly[0]
        const title = newly.length === 1
          ? `Dose atrasada: ${first.prescription.medication_name}`
          : `${newly.length} doses atrasadas`
        const body = newly.length === 1
          ? `${first.prescription.dose ?? ''} ${first.prescription.route ?? ''} — administrar agora.`.trim()
          : 'Há medicações vencidas na internação. Verifique o mapa de execução.'
        try {
          new Notification(title, { body, tag: 'vetmax-med-alarm', renotify: true } as NotificationOptions)
        } catch { /* alguns browsers bloqueiam em background sem SW */ }
      }
    }

    // Mantém só as janelas ainda vencidas — permite re-alarmar a próxima janela.
    alarmedRef.current = currentKeys
  }, [scheduler, enabled, playBeep])

  return {
    permission,
    soundReady,
    hasOverdue:   scheduler.isAlerting,
    overdueCount: scheduler.alerts.filter(a => a.isOverdue).length,
    enableAlarms,
  }
}
