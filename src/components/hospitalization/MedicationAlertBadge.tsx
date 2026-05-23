'use client'

import { Pill } from 'lucide-react'
import type { SchedulerResult } from '@/hooks/useMedicationScheduler'

/**
 * Ícone de pílula piscando + contador, usado dentro do KanbanCard.
 *
 * Vermelho (med-icon-pulse) quando isAlerting=true (dose atrasada);
 * âmbar quando hasImminent=true (chegando em ≤10min); nada caso contrário.
 *
 * O wrapper externo cuida da animação de pulse do CARD (border + box-shadow);
 * este aqui é apenas o "selo" interno que conta as doses pendentes.
 */

interface Props {
  scheduler: SchedulerResult
  onClick?: (e: React.MouseEvent) => void
}

export default function MedicationAlertBadge({ scheduler, onClick }: Props) {
  if (!scheduler.isAlerting && !scheduler.hasImminent) return null

  const overdueCount  = scheduler.alerts.filter(a => a.isOverdue).length
  const imminentCount = scheduler.alerts.filter(a => a.isImminent).length
  const isUrgent      = scheduler.isAlerting

  const colorClasses = isUrgent
    ? 'bg-rose-100 text-rose-700 border-rose-300'
    : 'bg-amber-100 text-amber-700 border-amber-300'

  const label = isUrgent
    ? `${overdueCount} dose${overdueCount !== 1 ? 's' : ''} atrasada${overdueCount !== 1 ? 's' : ''}`
    : `${imminentCount} dose${imminentCount !== 1 ? 's' : ''} chegando`

  const ariaLabel = `${label} — ${scheduler.nextSoonest?.prescription.medication_name ?? 'medicação'}`

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick?.(e)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      draggable={false}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${colorClasses}`}
    >
      <Pill className={`h-3 w-3 ${isUrgent ? 'med-icon-pulse' : ''}`} aria-hidden />
      {isUrgent ? overdueCount : imminentCount}
    </button>
  )
}
