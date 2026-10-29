// Tipos do Livro de Controlados (Portaria 344/1998 + RDC 22/2014).
//
// Modulo PURO — sairam de `src/lib/actions/controlled-book.ts`, que tem
// 'use server'. Tipo exportado de server action responde 500 em producao sem
// erro de compilacao; a guarda `guard-use-server-types.mjs` bloqueia o padrao.

export type ControlledKind = 'entrada' | 'saida' | 'perda' | 'ajuste'

export interface ControlledLedgerEntry {
  date:      string
  kind:      ControlledKind
  quantity:  number           // sinalizado (+entrada / -saida)
  balance:   number           // saldo apos o evento
  origin:    string           // Compra/Reposicao, Venda (PDV), Internacao, Consulta...
  reference: string | null    // tutor / observacao
  document:  string | null    // notificacao de receita / nota, quando houver
}

export interface ControlledItemBook {
  stock_item_id:   string
  name:            string
  substance:       string | null
  concentration:   string | null
  control_class:   string | null
  is_human_use:    boolean
  unit:            string | null
  opening_balance: number
  total_in:        number
  total_out:       number
  total_loss:      number
  closing_balance: number
  entries:         ControlledLedgerEntry[]
}

export interface ControlledBook {
  from: string
  to:   string
  human:      ControlledItemBook[]
  veterinary: ControlledItemBook[]
}
