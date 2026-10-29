// Tipos do módulo de farmácia / ações clínicas da consulta.
//
// Módulo PURO. Viviam em `src/lib/actions/pharmacy.ts`, que tem 'use server' —
// tipo exportado de server action responde 500 em produção sem erro de
// compilação, e a guarda `guard-use-server-types.mjs` bloqueia o padrão.

import type { StatusBaixaEstoque } from '@/lib/stock/aplicacao'

export type AppliedMedication = {
  id: string
  consultation_id: string
  medication_name: string
  dosage: string | null
  route: string | null
  notes: string | null
  is_controlled: boolean
  created_at: string

  // ─── Vínculo com o estoque (migration 0505 · item 1.7) ───────────────────
  /** Item de estoque aplicado. null = registro em texto livre. */
  stock_item_id: string | null
  /** Quantidade aplicada na unidade do item. null em registros antigos. */
  quantity: number | null
  unit: string | null
  /** Movimento que baixou o estoque — a devolução parte dele. */
  stock_movement_id: string | null
  stock_status: StatusBaixaEstoque | null
  /** Linha gerada na conta da OS, quando a clínica usa cobrança automática. */
  consultation_service_id: string | null
  /** Nº da notificação de receita do controlado (Portaria 344/1998). */
  prescription_notification: string | null
}

/** Dados da baixa devolvidos junto do registro, para a tela mostrar o que houve. */
export type AppliedMedicationResult = {
  medication: AppliedMedication
  /** null quando não houve tentativa de baixa (registro sem item e sem nome útil). */
  stock: {
    status: StatusBaixaEstoque
    mensagem: string
    tom: 'ok' | 'atencao' | 'alerta'
    saldo_depois: number | null
  } | null
  /** Mensagem quando a cobrança automática falhou — o registro clínico fica de pé. */
  avisoCobranca: string | null
}

export type Referral = {
  id: string
  consultation_id: string
  type: 'exam_internal' | 'exam_external' | 'prescription_external'
  description: string
  doctor_notes: string | null
  created_at: string
}

export type ExtractedClinicalActions = {
  medications: Array<{
    medication_name: string
    dosage: string | null
    route: string | null
    notes: string | null
  }>
  referrals: Array<{
    type: 'exam_internal' | 'exam_external' | 'prescription_external'
    description: string
    doctor_notes: string | null
  }>
}
