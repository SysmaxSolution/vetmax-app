// Tipos de `src/lib/actions/commissions.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export interface UserCommission {
  id:          string
  clinic_id:   string
  user_id:     string
  item_type:   'all' | 'product' | 'service' | 'package' | 'sector'
  item_id:     string | null
  percentage:  number
  /** Com item_type=sector: vale para todos os itens com stock_items.sector igual. */
  sector:      string | null
  /** Valor fixo por unidade vendida (alternativa ao percentual). */
  fixed_amount: number | null
  description: string | null
  created_at:  string
}

export interface CommissionReport {
  professional_id:   string
  professional_name: string
  total_amount:      number
  pending_amount:    number
  entry_count:       number
  entries: {
    id:          string
    description: string
    amount:      number
    due_date:    string
    status:      string
  }[]
}

export interface CommissionableItem {
  id:       string
  name:     string
  price:    number
  category: string
}
