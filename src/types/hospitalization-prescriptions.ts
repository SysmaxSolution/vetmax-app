// Tipos de `src/lib/actions/hospitalization-prescriptions.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

import type { StockConsumptionResult } from '@/types/stock-consumption'

export type PrescriptionStatus = 'active' | 'paused' | 'finished'

/**
 * Prescrição de internação com a última administração já resolvida.
 * Forma consumida pelo useMedicationScheduler (cálculo de next_dose_at é
 * client-side: lastAppliedAt ?? startedAt + frequencyHours).
 */
export interface HospPrescription {
  id:                 string
  hospitalization_id: string
  medication_name:    string
  dose:               string | null
  route:              string | null
  frequency_hours:    number | null
  started_at:         string                 // ISO
  duration_hours:     number | null
  status:             PrescriptionStatus
  notes:              string | null
  prescribed_by:      string | null
  created_at:         string
  /** ISO da última administração (vem de hospitalization_dose_administrations). */
  last_applied_at:    string | null
  /** Número de doses já aplicadas (auditoria rápida). */
  doses_applied:      number
  /** Vínculo com stock_items — quando preenchido, applyDose baixa estoque. */
  stock_item_id:      string | null
  /** Unidades consumidas do estoque por dose aplicada. */
  quantity_per_dose:  number | null
}

export interface CreatePrescriptionPayload {
  hospitalization_id: string
  medication_name:    string
  dose?:              string | null
  route?:             string | null
  /** Vem do dropdown — 4/6/8/12/24, ou null para dose única (SOS). */
  frequency_hours?:   number | null
  duration_hours?:    number | null
  /** Quando começa o ciclo. Default = now() (banco). */
  started_at?:        string | null
  notes?:             string | null
  /** Vínculo opcional com stock_items para baixa automática. */
  stock_item_id?:     string | null
  /** Quantidade do estoque consumida por dose (obrigatório quando stock_item_id setado). */
  quantity_per_dose?: number | null
}

export interface ApplyDoseOptions {
  /** Quando a dose foi aplicada. Default = now(). */
  applied_at?:    string
  /** Quando ESTAVA programada — preencher se a aplicação foi registrada atrasada. */
  scheduled_for?: string
  notes?:         string
}

export interface ApplyDoseResult {
  id:    string
  /** Resultado da baixa de estoque — null quando a prescrição não tem vínculo. */
  stock: StockConsumptionResult | { error: string } | null
}
