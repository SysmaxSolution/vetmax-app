/**
 * Catálogo unificado de "Motivo da Visita" (visit_reason).
 *
 * Fonte ÚNICA para CheckInModal, NewAppointmentModal, EditAppointmentModal,
 * CalendarWorkspace, ReceptionWorkspace, AgendaKanban e demais lugares que
 * mostram/selecionam motivo. Garante:
 *   - Mesmo conjunto de motivos em todos os pontos do sistema
 *   - Mesmos labels (PT-BR consistente)
 *   - Mesmos emojis para identificação visual
 *   - Mesmas cores para badges
 *   - moduleKey opcional para esconder motivos cujo módulo está inativo
 *
 * NUNCA defina listas paralelas em outros arquivos — sempre importe daqui.
 */

import type { VisitReason } from '@/types'

/**
 * UI Reason engloba todos os tipos exibidos no sistema. `VisitReason` (no
 * type principal) cobre apenas os que entram em consultations.visit_reason;
 * 'grooming' aqui representa um fluxo separado (grooming_sessions) mas
 * aparece no MESMO seletor visual para o usuário não ver listas divergentes.
 */
export type UIVisitReason = VisitReason | 'grooming'

export interface VisitReasonOption {
  value:     UIVisitReason
  label:     string
  emoji:     string
  color:     string          // classes Tailwind para badge
  /** Quando setado, esconde o motivo se o módulo não estiver ativo. */
  moduleKey?: string
}

export const VISIT_REASON_OPTIONS: VisitReasonOption[] = [
  { value: 'consultation',  label: 'Consulta',       emoji: '👨‍⚕️', color: 'bg-slate-100 text-slate-700' },
  { value: 'follow_up',     label: 'Retorno',        emoji: '📋',    color: 'bg-slate-100 text-slate-700' },
  { value: 'emergency',     label: 'Emergência',     emoji: '🚨',    color: 'bg-red-100 text-red-700'      },
  { value: 'vaccination',   label: 'Vacinação',      emoji: '💉',    color: 'bg-green-100 text-green-700'   },
  { value: 'exam',          label: 'Exame',          emoji: '🔬',    color: 'bg-purple-100 text-purple-700', moduleKey: 'exams' },
  { value: 'surgery',       label: 'Cirurgia',       emoji: '🏥',    color: 'bg-orange-100 text-orange-700', moduleKey: 'centro_cirurgico' },
  { value: 'grooming',      label: 'Banho e Tosa',   emoji: '✂️',    color: 'bg-teal-100 text-teal-700',     moduleKey: 'grooming' },
  { value: 'microchipping', label: 'Microchipagem',  emoji: '🐶',    color: 'bg-indigo-100 text-indigo-700'  },
  { value: 'acompanhamento', label: 'Acompanhamento', emoji: '📋',   color: 'bg-cyan-100 text-cyan-700'      },
]

/** Lookup rápido label por value. */
export const VISIT_REASON_LABELS: Record<string, string> = Object.fromEntries(
  VISIT_REASON_OPTIONS.map(o => [o.value, o.label]),
)

/** Lookup emoji por value (útil para feeds, kanbans). */
export const VISIT_REASON_EMOJIS: Record<string, string> = Object.fromEntries(
  VISIT_REASON_OPTIONS.map(o => [o.value, o.emoji]),
)

/**
 * Filtra a lista mantendo apenas motivos cujos moduleKey estão ativos.
 * Motivos sem moduleKey (consultation, follow_up, emergency, vaccination,
 * microchipping) sempre aparecem.
 */
export function visibleVisitReasons(activeModules: string[] | null | undefined): VisitReasonOption[] {
  if (!activeModules || activeModules.length === 0) return VISIT_REASON_OPTIONS
  return VISIT_REASON_OPTIONS.filter(o => !o.moduleKey || activeModules.includes(o.moduleKey))
}
