// Tipos do cadastro de convenios.
//
// Modulo PURO — sairam de `src/lib/actions/insurance-providers.ts`, que tem
// 'use server'. Tipo exportado de server action responde 500 em producao sem
// erro de compilacao; a guarda `guard-use-server-types.mjs` bloqueia o padrao.

import type { CicloRepasse } from '@/lib/insurance/ciclo'
import type { ModoCopay } from '@/lib/insurance/copay'

export type ReceiptMode = 'convenio_repasse' | 'ong_guia' | 'particular_desconto'

export type InsuranceProvider = {
  id:           string
  clinic_id:    string
  name:         string
  plan_types:   string[]
  portal_url:   string | null
  contact_info: { phone?: string; email?: string; contact_name?: string }
  receipt_mode: ReceiptMode
  config:       Record<string, unknown>
  is_active:    boolean
  created_at:   string

  // ─── Ciclo e valor intermediario (migration 0506 · item 1.9) ────────────
  /** Periodicidade do fechamento com este convenio. */
  repass_cycle:     CicloRepasse
  /** Dia de referencia: 0-6 no semanal, 1-31 no mensal, NULL nos demais. */
  repass_cycle_day: number | null
  /** Como sai o valor que o tutor paga. per_item = comportamento historico. */
  copay_mode:    ModoCopay
  copay_percent: number | null
  copay_fixed:   number | null
}
