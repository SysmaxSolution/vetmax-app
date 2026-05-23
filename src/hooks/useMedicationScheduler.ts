'use client'

import { useSyncExternalStore, useMemo } from 'react'
import { medicationTickStore } from '@/lib/medication-tick'
import type { HospPrescription } from '@/lib/actions/hospitalization-prescriptions'

/**
 * Scheduler client-side de prescrições de internação.
 *
 * Deriva o estado de alerta APENAS de `Date.now()` + `prescriptions[]` — o
 * banco nunca armazena `next_dose_at`. A cada tick (15s ou online/visible),
 * o hook re-renderiza e recalcula.
 *
 * Regras:
 *  - status='paused' ou 'finished' → nunca alerta
 *  - frequency_hours=null (dose única) → nunca alerta após primeira aplicação
 *  - duration_hours definido + ciclo passou de started_at + duration_hours →
 *    nunca alerta
 *  - nextDoseAt = (lastAppliedAt ?? startedAt) + frequency_hours
 *  - isOverdue = now >= nextDoseAt
 *  - isImminent = now < nextDoseAt && (nextDoseAt - now) <= IMMINENT_MS
 */

const IMMINENT_MS = 10 * 60 * 1000   // 10 minutos antes da dose já avisa

export interface MedicationAlert {
  prescription:   HospPrescription
  nextDoseAt:     Date
  /** ms em relação a now; positivo = atrasada, negativo = ainda faltam ms. */
  deltaMs:        number
  isOverdue:      boolean
  isImminent:     boolean
}

export interface SchedulerResult {
  /** Há pelo menos uma dose atrasada (deltaMs > 0). */
  isAlerting:  boolean
  /** Há pelo menos uma dose chegando nos próximos IMMINENT_MS. */
  hasImminent: boolean
  /** Todos os alertas (overdue OU imminent), ordenados por urgência decrescente. */
  alerts:      MedicationAlert[]
  /** Mais urgente — null se nenhum. */
  nextSoonest: MedicationAlert | null
}

const EMPTY_RESULT: SchedulerResult = {
  isAlerting:  false,
  hasImminent: false,
  alerts:      [],
  nextSoonest: null,
}

function computeAlerts(prescriptions: HospPrescription[], now: number): MedicationAlert[] {
  const out: MedicationAlert[] = []

  for (const p of prescriptions) {
    if (p.status !== 'active') continue
    if (p.frequency_hours === null || p.frequency_hours <= 0) continue

    const startedAt   = new Date(p.started_at).getTime()
    const lastApplied = p.last_applied_at ? new Date(p.last_applied_at).getTime() : null
    const lastAnchor  = lastApplied ?? startedAt
    const freqMs      = p.frequency_hours * 3_600_000
    const nextDoseMs  = lastAnchor + freqMs

    // Respeita duration_hours: se já passou do fim, não alerta mais.
    if (p.duration_hours !== null) {
      const endsAt = startedAt + p.duration_hours * 3_600_000
      if (now > endsAt) continue
    }

    const deltaMs    = now - nextDoseMs   // > 0 = atrasada
    const isOverdue  = deltaMs >= 0
    const isImminent = !isOverdue && Math.abs(deltaMs) <= IMMINENT_MS

    if (isOverdue || isImminent) {
      out.push({
        prescription: p,
        nextDoseAt:   new Date(nextDoseMs),
        deltaMs,
        isOverdue,
        isImminent,
      })
    }
  }

  // Mais urgente primeiro: maior deltaMs (mais atrasada) → menor deltaMs (mais imminente).
  out.sort((a, b) => b.deltaMs - a.deltaMs)
  return out
}

export function useMedicationScheduler(prescriptions: HospPrescription[]): SchedulerResult {
  // Subscreve ao tick — re-render a cada 15s ou em online/visible.
  useSyncExternalStore(
    medicationTickStore.subscribe,
    medicationTickStore.getSnapshot,
    medicationTickStore.getServerSnapshot,
  )

  // useMemo NÃO inclui o tick — força recalcular toda render. Tick provoca
  // render; o cálculo em si é O(n) e barato. Dependência: a referência do
  // array (substituída quando o caller dá refetch).
  return useMemo<SchedulerResult>(() => {
    if (!prescriptions || prescriptions.length === 0) return EMPTY_RESULT
    const now    = Date.now()
    const alerts = computeAlerts(prescriptions, now)
    if (alerts.length === 0) return EMPTY_RESULT
    return {
      isAlerting:  alerts.some(a => a.isOverdue),
      hasImminent: alerts.some(a => a.isImminent),
      alerts,
      nextSoonest: alerts[0],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptions, medicationTickStore.getSnapshot()])
}
