// Tipos de `src/lib/actions/stock.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

import type { StockCategory } from '@/lib/stock-constants'

export type StockItem = {
  id: string
  clinic_id: string
  medication_name: string
  quantity: number
  unit: string
  min_stock_level: number
  last_restock: string | null
  created_at: string
  updated_at: string
}

export type StockMovement = {
  id: string
  clinic_id: string
  stock_item_id: string | null
  medication_name: string
  movement_type: 'DEBIT' | 'CREDIT' | 'ADJUSTMENT'
  quantity_change: number
  quantity_before: number | null
  quantity_after: number | null
  source: 'CONSULTATION' | 'HOSPITALIZATION' | 'MANUAL_ADJUSTMENT' | 'INITIAL_STOCK' | 'RESTOCK' | null
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type StockItemV2 = {
  id:           string
  clinic_id:    string
  name:         string
  category:     StockCategory
  quantity:     number
  /** Unidade de SALDO: aquela em que o estoque é contado (migration 0532). */
  unit:         string
  /** Como o fornecedor vende (CX, FR). Nulo = igual à unidade de saldo. */
  unit_purchase?:   string | null
  /** Quantas unidades de saldo há em 1 unidade de compra. */
  factor_purchase?: number | null
  /** Como a equipe aplica (mL, dose). Nulo = igual à unidade de saldo. */
  unit_use?:        string | null
  /** Quantas unidades de saldo saem em 1 unidade de uso. */
  factor_use?:      number | null
  /** Como o balcão vende (FR, UN). Nulo = igual à unidade de saldo. */
  unit_sale?:       string | null
  /** Quantas unidades de saldo saem em 1 unidade de venda. */
  factor_sale?:     number | null
  /** Fator de compra antigo (migration 0404), ainda usado como fallback. */
  units_per_package?: number | null
  min_quantity: number
  unit_price:   number
  last_restock: string | null
  created_at:   string
  updated_at:   string
  // migration 0099
  is_controlled: boolean
  /** Aparece nas telas de venda. Falso = insumo ou uso e consumo. */
  is_sellable:   boolean
  // migration 0441 — Livro de Controlados
  substance:     string | null
  /** Setor do item (LAB, IMG, CMED, CCIR, PS…): agrupa comissões e relatórios. */
  sector:        string | null
  concentration: string | null
  is_human_use:  boolean
  control_class: string | null
  brand:         string | null
  sku:           string | null
  barcode:       string | null
  batch_number:  string | null
  expiry_date:   string | null
  supplier:      string | null
  // migration 0100
  is_service:    boolean
  // migration 0111 (fiscal)
  ncm:              string | null
  ncm_description:  string | null
  cfop:             string | null
  unit_com:         string | null
  supplier_id:      string | null
  // migration 0215 (Item 5: split convênio Petlove)
  default_insurance_price: number | null
  // migration 0221 (Épico A 04/06: taxa % sobre coparticipação no cartão)
  insurance_card_interest_percent: number
  // migration 0363 (NFS-e Fase 3: códigos de serviço por item)
  nfse_item_lista_servico:          string | null
  nfse_codigo_tributario_municipio: string | null
  // migration 0422 (Sprint Animais: composição de preço simples)
  cost_price:        number | null
  entry_tax_percent: number | null
  margin_percent:    number | null
  // migration 0424 (Sprint Animais: composição de preço completa)
  purchase_price:            number | null
  supplier_discount_percent: number | null
  entry_tax_icms:    number | null
  entry_tax_st:      number | null
  entry_tax_ipi:     number | null
  entry_tax_freight: number | null
  entry_tax_ibs_cbs: number | null
  sale_tax_percent:  number | null
}

export type BulkImportRow = {
  name:          string
  category:      StockCategory
  quantity:      number
  unit:          string
  unit_price:    number
  min_quantity:  number
  is_service:    boolean
  is_controlled: boolean
  brand:         string | null
  sku:           string | null
  barcode:       string | null
  batch_number:  string | null
  expiry_date:   string | null
  supplier:      string | null
}
