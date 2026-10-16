// Tipos do PAGFOR / DDA.
//
// Vivem FORA de `src/lib/actions/pagfor.ts` porque aquele arquivo é
// `'use server'`: módulo de server action só pode exportar função assíncrona.
// Tipo exportado ali faz a action responder 500 em runtime, sem erro de
// compilação — é o tipo de falha que só aparece em produção. O hook
// `guard-use-server-types` barra isso no commit.

/** Boleto vindo do DDA (saída do parser ou da API do banco). */
export interface DdaBoleto {
  barcode:         string | null   // linha digitável / código de barras
  beneficiary:     string | null   // nome do beneficiário (fornecedor)
  beneficiary_doc: string | null   // CNPJ/CPF do beneficiário
  amount:          number | null
  due_date:        string | null   // YYYY-MM-DD
  document:        string | null   // nº do documento / nota
  raw:             string
}

export interface DdaMatchRow {
  boleto:   DdaBoleto
  status:   'in_system' | 'not_in_system'   // verde | vermelho
  entry_id: string | null
  entry_scheduled: string | null            // scheduled_payment_date do título casado
}

export interface DdaMatchResult {
  rows:    DdaMatchRow[]
  summary: { total: number; in_system: number; not_in_system: number }
}

/** Prévia de quais fornecedores o lançamento vai criar, agrupada por CNPJ. */
export interface PreviaFornecedorDda {
  documento:        string
  documento_fmt:    string
  nome_no_banco:    string | null
  nome_final:       string | null
  ja_cadastrado:    boolean
  nome_enriquecido: boolean
  boletos:          number
  valor_total:      number
}
