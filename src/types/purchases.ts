// Tipos do módulo de Compras.
//
// Ficam aqui, e não em `src/lib/actions/purchases.ts`, porque aquele arquivo é
// `'use server'` — tipo exportado de módulo 'use server' faz a server action
// responder 500 em runtime sem erro de compilação (regra do projeto).

export interface PurchaseOrder {
  id:           string
  clinic_id:    string
  supplier_id:  string | null
  nfe_key:      string | null
  nfe_number:   string | null
  nfe_series:   string | null
  issue_date:   string | null
  total_value:  number | null
  status:       'pending' | 'received' | 'cancelled'
  notes:        string | null
  created_at:   string
  updated_at:   string
  duplicatas?:  { numero: string; vencimento: string; valor: number }[]
  supplier?:    { id: string; name: string; document: string | null } | null
  items?:       PurchaseOrderItem[]
  // CFOP e entrega futura (migration 0530) — nulos nas compras anteriores.
  cfop_natureza?:        string | null
  lanca_financeiro?:     boolean | null
  movimenta_estoque?:    boolean | null
  nota_origem_id?:       string | null
  nfe_key_referenciada?: string | null
}

export interface PurchaseOrderItem {
  id:                 string
  purchase_order_id:  string
  stock_item_id:      string | null
  description:        string
  ncm:                string | null
  ean:                string | null
  cfop:               string | null
  /** CFOP com que o item entra aqui (5102 do fornecedor → 1102 nosso). */
  cfop_entrada?:      string | null
  /** Entrega futura: linha do faturamento que esta remessa abate. */
  item_origem_id?:    string | null
  /** Entrega futura: quanto ainda falta o fornecedor entregar desta linha. */
  quantidade_pendente?: number | null
  quantity:           number
  unit:               string | null
  unit_price:         number
  total_price:        number
  tax_icms:           number | null
  tax_pis:            number | null
  tax_cofins:         number | null
  // Impostos por item (migration 0519) — opcionais porque compras antigas não os têm.
  cst?:               string | null
  icms_origin?:       string | null
  icms_base?:         number | null
  icms_value?:        number | null
  icms_st_value?:     number | null
  ipi_value?:         number | null
  pis_value?:         number | null
  cofins_value?:      number | null
  is_matched:         boolean
}

export interface NCMData {
  code:        string
  description: string
  chapter?:    string
}

export interface PublicProduct {
  description: string
  ncm?:        string
  brand?:      string
  unit?:       string
  source:      string
}

export interface ManualPurchaseItem {
  description: string
  quantity:    number
  unit_price:  number
  unit?:       string | null
  ean?:        string | null
  ncm?:        string | null
}

export interface ManualPurchasePayload {
  supplier_id: string | null
  issue_date:  string | null   // 'YYYY-MM-DD'
  notes?:      string | null
  items:       ManualPurchaseItem[]
}

export interface PurchaseInstallmentInput {
  due_date: string
  amount:   number
  especie?: string | null
}

export interface StockMatchSuggestion {
  id:         string
  name:       string
  category:   string
  unit_price: number
  score:      number
  reason:     string
}
