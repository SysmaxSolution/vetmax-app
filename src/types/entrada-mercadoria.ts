// Ajustes que o operador faz ANTES de confirmar a entrada de mercadoria.
//
// O XML não é tocado: ele é o documento fiscal e continua sendo a verdade do
// que o fornecedor emitiu. O que estes ajustes mudam é o que entra no SISTEMA
// — a descrição que vai para o estoque, a quantidade realmente recebida, o
// vencimento que foi combinado por fora.
//
// Em módulo puro porque `src/lib/actions/purchases.ts` é `'use server'`.

export interface AjusteDeItem {
  /** Posição do item no XML — é o que amarra o ajuste ao item certo. */
  indice:       number
  description?: string
  ncm?:         string
  ean?:         string
  quantity?:    number
  unit_price?:  number
  total_price?: number
  /** Deixar de fora da entrada (item que não chegou, por exemplo). */
  excluir?:     boolean
}

export interface AjusteDeDuplicata {
  indice:      number
  vencimento?: string
  valor?:      number
  excluir?:    boolean
}

export interface AjustesDaEntrada {
  itens?:      AjusteDeItem[]
  duplicatas?: AjusteDeDuplicata[]
}
