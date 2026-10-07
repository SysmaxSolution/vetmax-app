// Identidade de uma linha do extrato bancário, para a importação não duplicar.
//
// O problema que isto resolve, medido em PRODUÇÃO: 150 linhas em
// `bank_statements` com 43 grupos duplicados por conteúdo. O usuário
// consultava um período, vinculava alguns títulos, saía da tela, voltava,
// reimportava o mesmo período — e ganhava cópias, inclusive de lançamento já
// conciliado, o que permitia gerar vários títulos do mesmo movimento.
//
// Por que NÃO serve o `external_id`: ele guarda o `numeroDocumento` do Sicoob,
// que para Pix vem como a string literal "Pix". Em produção havia 51 linhas
// com external_id = 'Pix' — 51 transações DIFERENTES. Usar isso como chave
// apagaria 50 movimentos reais.
//
// A regra:
//   • o banco deu um identificador único da transação (`transactionId` do
//     Sicoob) → a digital é ele. Idempotência perfeita.
//   • não deu (CSV, OFX) → hash do conteúdo + a ORDEM de ocorrência dentro do
//     grupo idêntico. Duas transações realmente iguais no mesmo dia seguem
//     linhas distintas, e reimportar o mesmo período cai nas mesmas digitais.

import { createHash } from 'node:crypto'

export interface LinhaExtrato {
  date: string
  amount: number
  description?: string
  type: 'credit' | 'debit'
  /** numeroDocumento — serve para casar com título, não para identificar. */
  external_id?: string
  /** Identificador único da transação, quando o banco fornece. */
  tx_id?: string
}

const conteudo = (contaId: string, l: LinhaExtrato): string =>
  createHash('md5')
    .update([contaId, l.date, Math.abs(l.amount).toFixed(2), l.description ?? '', l.type].join('|'))
    .digest('hex')

/**
 * Digitais de um lote, na ordem em que vieram.
 *
 * A ordem importa: é ela que numera as ocorrências repetidas. O mesmo extrato
 * do mesmo período chega na mesma ordem, então as digitais se repetem — que é
 * exatamente o que faz a reimportação ser inofensiva.
 */
export function digitaisDoLote(contaId: string, linhas: LinhaExtrato[]): string[] {
  const vistos = new Map<string, number>()
  return linhas.map(l => {
    if (l.tx_id && l.tx_id.trim()) return `tx:${l.tx_id.trim()}`
    const base = conteudo(contaId, l)
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return `${base}:${n}`
  })
}
