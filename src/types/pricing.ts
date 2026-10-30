// Tipos de `src/lib/actions/pricing.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export interface PriceTable {
  id: string
  clinic_id: string
  slot: number
  name: string
  is_active: boolean
  /** Acréscimo de urgência da tabela (%), quando o item não tem preço de urgência próprio. */
  urgency_percent?: number
  created_at: string
  updated_at: string
}

export type PricingPrecedence = 'client' | 'product'

export type CompositionMode = 'simple' | 'complete'

export type MarginCalcType = 'margin' | 'markup'

export interface PricingSettings {
  clinic_id: string
  default_b2c_price_table_id: string | null
  precedence: PricingPrecedence
  composition_mode: CompositionMode
  margin_calc_type: MarginCalcType
  updated_at: string
}

// ─── PREÇO POR ITEM POR TABELA (grade de preços) ─────────────────────────────
export interface ItemTablePrice {
  price: number
  margin: number | null
  /** Preço de urgência (plantão/fora de hora); null = usa o acréscimo da tabela. */
  urgent: number | null
  /** Início de vigência do preço atual (AAAA-MM-DD). */
  valid_from: string | null
}
