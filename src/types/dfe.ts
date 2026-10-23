// Tipos da Distribuição DF-e usados pela tela.
//
// Em módulo puro porque `src/lib/actions/dfe.ts` é `'use server'`: exportar
// tipo de lá derruba as actions em produção com 500, sem erro de compilação.

export interface NotaDisponivel {
  id:            string
  chave:         string
  emitenteNome:  string | null
  emitenteCnpj:  string | null
  numero:        string | null
  serie:         string | null
  valor:         number | null
  emitidaEm:     string | null
  /** True quando já temos o XML — só então dá para lançar a entrada. */
  temXml:        boolean
  /** Preenchido quando a nota já virou entrada de compra. */
  lancadaEm:     string | null
  /** 'nsu' | 'chave' — por onde a nota chegou até nós. */
  origem:        string
  manifestadaEm: string | null
}

export interface ResumoConsulta {
  /** Quantas notas novas apareceram. */
  novas:        number
  /** Quantas ganharam o XML completo nesta rodada. */
  comXml:       number
  /** Frase pronta para a tela. Nunca traz detalhe técnico. */
  mensagem:     string
  /** True quando a consulta não pôde ser feita agora (bloqueio em vigor). */
  aguardando:   boolean
}

export interface ConfiguracaoDfe {
  company_id:   string
  company_name: string
  company_cnpj: string | null
  enabled:      boolean
  auto_ciencia: boolean
  /** Para a tela dizer se estamos em dia, sem expor NSU. */
  emDia:        boolean
  ultimoSucesso: string | null
  /** True quando há sinal de outro software consumindo o mesmo CNPJ. */
  conflito:     boolean
}
