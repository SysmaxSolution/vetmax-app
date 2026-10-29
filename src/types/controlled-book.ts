// Tipos do Livro de Controlados (Portaria SVS/MS 344/1998 — Livro de Registro
// Específico). Fora de 'use server' de propósito: re-export de tipo em action
// quebra o build em runtime.

export type ControlledKind = 'entrada' | 'saida' | 'perda' | 'ajuste'

/** Uma linha do livro, já com o HISTÓRICO que a folha fiscal exige. */
export interface ControlledLedgerEntry {
  movement_id:    string | null
  date:           string            // ISO
  kind:           ControlledKind
  quantity:       number            // sinalizado: +entrada / −saída / −perda
  balance:        number            // estoque após o evento
  origin:         string            // Compra/Reposição, Consulta, Internação, Venda (PDV), Ajuste…
  /** Legado: observação livre ou tutor (vendas). Mantido para linhas antigas. */
  reference:      string | null
  /** NF-e da entrada ou notificação de receita da saída. */
  document:       string | null
  os_number:      string | null
  patient_name:   string | null
  tutor_name:     string | null
  procedure_name: string | null
  counterparty:   string | null     // fornecedor (entrada)
  batch_number:   string | null
  expires_at:     string | null     // YYYY-MM-DD
  loss_reason:    string | null
  /** Quem registrou o movimento (nome do usuário), quando houver. */
  responsible:    string | null
  notes:          string | null
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

/** Cabeçalho da folha: estabelecimento e responsável técnico que assina. */
export interface ControlledBookClinic {
  name:                       string
  cnpj:                       string | null
  address:                    string | null
  city:                       string | null
  state:                      string | null
  cep:                        string | null
  technical_responsible_name: string | null
  technical_responsible_crmv: string | null
}

export interface ControlledBook {
  from:         string
  to:           string
  generated_at: string
  clinic:       ControlledBookClinic
  human:        ControlledItemBook[]
  veterinary:   ControlledItemBook[]
}
