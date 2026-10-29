// Tipos do consumo e da devolução de estoque.
//
// Módulo PURO. Viviam em `src/lib/actions/stock-consumption.ts`, que tem
// 'use server': tipo exportado de arquivo de server action faz a action
// responder 500 em produção sem nenhum erro de compilação. A guarda
// `guard-use-server-types.mjs` bloqueia esse padrão; os tipos ficam aqui e as
// actions importam.

/** Contexto operacional da baixa — bate com o CHECK de `stock_movements.source`. */
export type StockConsumptionSource =
  | 'CONSULTATION'
  | 'HOSPITALIZATION'
  | 'MANUAL_ADJUSTMENT'
  | 'INITIAL_STOCK'
  | 'RESTOCK'

export interface ConsumeStockPayload {
  /** UUID do stock_item. null/omitido = item não reconhecido → audit-only com requires_reconciliation=TRUE. */
  stock_item_id?:   string | null
  /** Nome textual do medicamento (sempre obrigatório — auditoria). */
  medication_name:  string
  /** Quantidade a debitar. Sempre positiva; a RPC inverte para movement DEBIT. */
  quantity:         number
  /** Contexto operacional — bate com o CHECK do stock_movements. */
  source:           StockConsumptionSource
  /** UUID do registro de origem (ex.: applied_medications.id, hospitalization_dose_administrations.id). */
  reference_id?:    string | null
  notes?:           string | null
  /**
   * HISTÓRICO do Livro de Controlados (Portaria 344): quem recebeu, em que
   * procedimento, em qual OS, com qual notificação de receita. Gravado como
   * fotografia no movimento — o livro é registro legal e não pode mudar porque
   * um cadastro foi renomeado depois.
   */
  book?:            LivroHistorico | null
}

export interface LivroHistorico {
  os_number?:       string | null
  patient_name?:    string | null
  tutor_name?:      string | null
  procedure_name?:  string | null
  /** Notificação de receita (saída) ou NF-e (entrada). */
  document_number?: string | null
}

export interface StockConsumptionResult {
  movement_id:              string
  /** TRUE se a baixa cruzou com um stock_item real (decremento aplicado). */
  matched:                  boolean
  /** Quantidade ANTES da baixa (null se unmatched). */
  quantity_before:          number | null
  /** Quantidade APÓS a baixa (pode ser negativa em estoque insuficiente). */
  quantity_after:           number | null
  /** Resultado caiu ≤ min_quantity mas ainda positivo — toast amber. */
  below_minimum:            boolean
  /** TRUE quando: unmatched OU resultou em quantity_after < 0. Toast rose/cinza. */
  requires_reconciliation:  boolean
}

export interface StockReturnResult {
  movement_id:     string
  /** Quantidade devolvida ao estoque. */
  returned:        number
  quantity_before: number | null
  quantity_after:  number | null
}

export interface StockItemLite {
  id:            string
  name:          string
  sku:           string | null
  barcode:       string | null
  category:      string
  unit:          string
  quantity:      number
  min_quantity:  number
  is_controlled: boolean
  /** Marcador derivado: quantity <= min_quantity (badge "estoque baixo" no UI). */
  is_below_min:  boolean
}

export interface ReconciliationItem {
  id:                    string
  stock_item_id:         string | null
  medication_name:       string
  quantity_change:       number
  quantity_before:       number | null
  quantity_after:        number | null
  source:                string
  reference_id:          string | null
  notes:                 string | null
  created_at:            string
  created_by:            string | null
}
