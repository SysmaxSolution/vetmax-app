// Tipos de `src/lib/actions/hospitalization-charges.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type ChargeKind = 'daily' | 'medication' | 'kit' | 'procedure' | 'exam' | 'other'

export type ChargeStatus = 'open' | 'transferred' | 'paid' | 'void'

export interface HospCharge {
  id:          string
  kind:        ChargeKind
  description: string
  quantity:    number
  unit_amount: number
  amount:      number
  status:      ChargeStatus
  charged_at:  string
}

export interface HospAccount {
  charges:    HospCharge[]
  /** Saldo em ABERTO (status=open). Alta Administrativa só com balance <= 0. */
  balance:    number
  /** Já liquidado/transferido (paid + transferred). */
  settled:    number
  /** Total geral (exceto void). */
  total:      number
  /** Enviado ao caixa e ainda não recebido (lotes parciais, 0521). */
  awaiting_cashier: number
}
