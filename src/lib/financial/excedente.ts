// O que fazer quando o cliente paga mais do que o título vale.
//
// Antes daqui o código cortava em silêncio:
//
//   // Limita amount_received ao netAmount (segurança)
//   const amountReceived = Math.max(0, Math.min(data.amount_received, netAmount))
//
// O comentário chamava de "segurança" o que era o contrário: tutor pagava
// R$ 200 num título de R$ 150 e os R$ 50 desapareciam — sem troco, sem
// crédito, sem rastro. Dinheiro não pode sumir por arredondamento de código.
//
// Agora o excedente tem destino declarado, e quem decide é o operador.

export type DestinoExcedente = 'troco' | 'credito'

export interface DecisaoExcedente {
  /** Quanto passou do valor do título. 0 quando não houve excedente. */
  excesso: number
  /** Quanto entra como baixa do título (nunca mais que o valor dele). */
  baixar: number
  /** Precisa perguntar ao operador antes de gravar? */
  exigeEscolha: boolean
  /** Motivo da recusa, quando há. */
  erro: string | null
}

const cent = (v: number) => Math.round(v * 100) / 100

/**
 * Decide o que fazer com o valor recebido.
 *
 * `temCliente` importa porque crédito é saldo DE ALGUÉM: sem cliente no
 * título não há a quem creditar, e aí só troco resolve.
 */
export function decidirExcedente(params: {
  valorTitulo: number
  valorRecebido: number
  destino?: DestinoExcedente | null
  temCliente: boolean
}): DecisaoExcedente {
  const titulo   = cent(Math.max(0, params.valorTitulo))
  const recebido = cent(Math.max(0, params.valorRecebido))
  const excesso  = cent(Math.max(0, recebido - titulo))

  // Sem excedente (inclui a baixa parcial, que é outro fluxo).
  if (excesso <= 0.005) {
    return { excesso: 0, baixar: recebido, exigeEscolha: false, erro: null }
  }

  if (!params.destino) {
    return {
      excesso, baixar: titulo, exigeEscolha: true,
      erro: `O valor recebido (${recebido.toFixed(2)}) é maior que o do título (${titulo.toFixed(2)}). Informe o que fazer com a diferença de R$ ${excesso.toFixed(2)}: troco ou crédito do cliente.`,
    }
  }

  if (params.destino === 'credito' && !params.temCliente) {
    return {
      excesso, baixar: titulo, exigeEscolha: true,
      erro: 'Não é possível lançar a diferença como crédito: este título não tem cliente informado. Use troco, ou informe o cliente no título.',
    }
  }

  // O título baixa pelo valor dele. A diferença vira troco (sai) ou crédito
  // (fica como saldo do tutor) — em nenhum dos dois ela some.
  return { excesso, baixar: titulo, exigeEscolha: false, erro: null }
}
