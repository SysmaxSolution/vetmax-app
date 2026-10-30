/**
 * CFOP na entrada de mercadoria.
 *
 * A nota chega com o CFOP de SAÍDA do fornecedor (5102 dentro do estado, 6102
 * de outro estado, 7102 do exterior). Quem recebe lança com o CFOP de ENTRADA
 * correspondente (1102, 2102, 3102). A regra geral é trocar só o primeiro
 * dígito; o que muda de verdade entre um CFOP e outro é o que ele faz no
 * sistema: se gera contas a pagar, se movimenta estoque, e se é uma das duas
 * pontas da venda para entrega futura.
 */

/** O que o CFOP faz quando a nota é lançada como entrada. */
export type NaturezaCfop =
  /** Compra comum: lança financeiro e movimenta estoque. */
  | 'compra'
  /** Bonificação, brinde, doação, amostra: entra no estoque sem contas a pagar. */
  | 'bonificacao'
  /** Simples faturamento da entrega futura: lança financeiro, não movimenta estoque. */
  | 'entrega_futura_faturamento'
  /** Remessa da entrega futura: movimenta estoque, financeiro já foi lançado. */
  | 'entrega_futura_remessa'
  /** Devolução de venda nossa: entra no estoque, financeiro é crédito, não despesa. */
  | 'devolucao'
  /** Remessa que volta (conserto, demonstração, comodato): sem financeiro. */
  | 'remessa_temporaria'
  /** Não classificado: o operador decide na tela. */
  | 'outra'

export interface RegraCfop {
  /** CFOP como vem na nota do fornecedor (saída). */
  saida: string
  /** CFOP com que a nota deve ser lançada aqui (entrada), dentro do estado. */
  entrada: string
  natureza: NaturezaCfop
  descricao: string
}

/**
 * Converte o CFOP de saída do fornecedor no de entrada.
 * 5xxx → 1xxx (mesmo estado), 6xxx → 2xxx (outro estado), 7xxx → 3xxx (exterior).
 * Os três últimos dígitos são preservados.
 */
export function cfopDeEntrada(cfopSaida: string | null | undefined): string | null {
  const s = String(cfopSaida ?? '').replace(/\D/g, '')
  if (s.length !== 4) return null
  const mapa: Record<string, string> = { '5': '1', '6': '2', '7': '3' }
  const primeiro = mapa[s[0]]
  if (!primeiro) return s.startsWith('1') || s.startsWith('2') || s.startsWith('3') ? s : null
  return primeiro + s.slice(1)
}

/** Catálogo inicial, pelos três últimos dígitos (vale para 5xxx, 6xxx e 7xxx). */
export const NATUREZA_POR_SUFIXO: Record<string, { natureza: NaturezaCfop; descricao: string }> = {
  '101': { natureza: 'compra',   descricao: 'Venda de produção do estabelecimento' },
  '102': { natureza: 'compra',   descricao: 'Venda de mercadoria adquirida de terceiros' },
  '103': { natureza: 'compra',   descricao: 'Venda de produção, entrega a ordem do adquirente' },
  '104': { natureza: 'compra',   descricao: 'Venda de mercadoria, entrega a ordem do adquirente' },
  '109': { natureza: 'compra',   descricao: 'Venda destinada à Zona Franca ou Área de Livre Comércio' },
  '116': { natureza: 'entrega_futura_remessa',     descricao: 'Venda de produção originada de encomenda para entrega futura' },
  '117': { natureza: 'entrega_futura_remessa',     descricao: 'Venda de mercadoria de terceiros originada de encomenda para entrega futura' },
  '118': { natureza: 'entrega_futura_remessa',     descricao: 'Venda de produção entregue ao destinatário por conta e ordem' },
  '119': { natureza: 'entrega_futura_remessa',     descricao: 'Venda de mercadoria entregue ao destinatário por conta e ordem' },
  '922': { natureza: 'entrega_futura_faturamento', descricao: 'Simples faturamento decorrente de venda para entrega futura' },
  '910': { natureza: 'bonificacao', descricao: 'Bonificação, doação ou brinde' },
  '911': { natureza: 'bonificacao', descricao: 'Amostra grátis' },
  '912': { natureza: 'remessa_temporaria', descricao: 'Remessa para demonstração' },
  '913': { natureza: 'remessa_temporaria', descricao: 'Retorno de mercadoria remetida para demonstração' },
  '914': { natureza: 'remessa_temporaria', descricao: 'Remessa para exposição ou feira' },
  '915': { natureza: 'remessa_temporaria', descricao: 'Remessa para conserto ou reparo' },
  '916': { natureza: 'remessa_temporaria', descricao: 'Retorno de conserto ou reparo' },
  '917': { natureza: 'remessa_temporaria', descricao: 'Remessa em consignação' },
  '920': { natureza: 'remessa_temporaria', descricao: 'Retorno de mercadoria em consignação' },
  '201': { natureza: 'devolucao', descricao: 'Devolução de compra para industrialização' },
  '202': { natureza: 'devolucao', descricao: 'Devolução de compra para comercialização' },
  '949': { natureza: 'outra',     descricao: 'Outra saída não especificada' },
}

/** O que cada natureza faz, por padrão, ao lançar a entrada. */
export const EFEITO_DA_NATUREZA: Record<NaturezaCfop, { financeiro: boolean; estoque: boolean }> = {
  compra:                      { financeiro: true,  estoque: true },
  bonificacao:                 { financeiro: false, estoque: true },
  entrega_futura_faturamento:  { financeiro: true,  estoque: false },
  entrega_futura_remessa:      { financeiro: false, estoque: true },
  devolucao:                   { financeiro: false, estoque: true },
  remessa_temporaria:          { financeiro: false, estoque: false },
  outra:                       { financeiro: true,  estoque: true },
}
