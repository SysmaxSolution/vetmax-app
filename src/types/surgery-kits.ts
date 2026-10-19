// Tipos do kit cirúrgico e da conferência da devolução (Fase 4 · item 4.1).
//
// Módulo PURO. Saíram de `src/lib/actions/surgery-kits.ts`, que tem
// 'use server': tipo exportado de server action responde 500 em produção sem
// erro de compilação, e a guarda `guard-use-server-types.mjs` bloqueia o padrão.

export interface KitItem {
  stock_item_id: string | null
  item_name:     string
  quantity:      number
}

export interface ServiceKitSummary {
  id: string
  name: string
  description: string | null
  item_count: number
}

export interface ServiceKit extends ServiceKitSummary {
  items: KitItem[]
}

export interface SurgeryChargeRow {
  id: string
  kind: string
  description: string
  amount: number
  status: string
  created_at: string
}

export interface SurgeryAccount {
  charges: SurgeryChargeRow[]
  total: number
}

export interface ApplyKitResult {
  /** Identificador da aplicação — é por ele que se confere a devolução depois. */
  application_id: string
  /** Valor lançado na conta da cirurgia. */
  charged: number
  /** Insumos baixados do estoque. */
  consumed: number
  /** Insumos cuja baixa ficou com divergência (saldo negativo ou item solto). */
  reconciliation: number
  /** Insumos do kit sem vínculo com estoque — não baixam nada. */
  sem_vinculo: number
}

/** Uma linha do kit que saiu para a sala, como a tela de conferência a mostra. */
export interface KitApplicationItemRow {
  id:                string
  stock_item_id:     string | null
  item_name:         string
  unit:              string | null
  quantity_planned:  number
  quantity_returned: number
  quantity_lost:     number
  unit_price:        number
  returnable:        boolean
}

export interface KitApplicationRow {
  id:            string
  surgery_id:    string
  kit_id:        string | null
  kit_name:      string
  status:        'aplicado' | 'conferido' | 'cancelado'
  applied_at:    string
  applied_by_name:    string | null
  reconciled_at:      string | null
  reconciled_by_name: string | null
  items:         KitApplicationItemRow[]
  /** Soma do que foi cobrado por esta aplicação, já líquido de abatimentos. */
  total_cobrado: number
}

export interface ConferirKitResult {
  devolvido:   number
  perdido:     number
  /** Quanto saiu da conta do tutor por ter voltado fechado. */
  abatimento:  number
  /** Mensagem pronta para a tela. */
  mensagem:    string
  /** Ajustes que a conferência precisou fazer na marcação — nunca em silêncio. */
  avisos:      string[]
}
