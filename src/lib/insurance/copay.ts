// Valor intermediário do convênio — quanto fica com o tutor e quanto o convênio
// deve (Fase 1 · item 1.9).
//
// Módulo PURO. A regra de ouro do split, herdada da migration 0215, é
// `total = copay + repass`, sem centavo perdido: o arredondamento sobra sempre
// no repasse, porque o tutor não pode ser cobrado por um centavo que a conta
// dele não mostra.

/** Igual ao CHECK de `insurance_providers.copay_mode`. */
export type ModoCopay = 'per_item' | 'percent' | 'fixed' | 'none'

export const ROTULO_MODO_COPAY: Record<ModoCopay, string> = {
  per_item: 'Negociado item a item',
  percent:  'Percentual do valor',
  fixed:    'Valor fixo por item',
  none:     'Tutor não paga nada',
}

export interface RegraCopay {
  modo:     ModoCopay
  percent:  number | null
  fixed:    number | null
}

export interface SplitCalculado {
  /** O que o tutor paga no balcão. */
  copay:  number
  /** O que o convênio deve repassar. */
  repass: number
}

const duasCasas = (v: number) => Math.round(v * 100) / 100

/**
 * Calcula o split quando a regra está no CONVÊNIO (percentual, valor fixo ou
 * nada). Devolve null quando a regra é `per_item`, que é o padrão e significa
 * "quem manda é o split cadastrado no pet+item" — nesse caso o chamador segue a
 * hierarquia antiga.
 *
 * `quantidade` importa no modo `fixed`: valor fixo é por item aplicado, então
 * duas unidades cobram dois valores fixos. O copay nunca passa do total — se a
 * regra fixa for maior que o preço, o tutor paga o preço e o repasse é zero, em
 * vez de o convênio ficar devendo negativo.
 */
export function calcularSplitDoConvenio(
  regra: RegraCopay,
  total: number,
  quantidade = 1,
): SplitCalculado | null {
  const valorTotal = duasCasas(Math.max(0, Number(total) || 0))

  if (regra.modo === 'per_item') return null

  if (regra.modo === 'none') {
    return { copay: 0, repass: valorTotal }
  }

  if (regra.modo === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(regra.percent ?? 0)))
    const copay = duasCasas((valorTotal * pct) / 100)
    const limitado = Math.min(copay, valorTotal)
    return { copay: limitado, repass: duasCasas(valorTotal - limitado) }
  }

  // fixed — por item aplicado
  const qtd = Number(quantidade) > 0 ? Number(quantidade) : 1
  const bruto = duasCasas(Number(regra.fixed ?? 0) * qtd)
  const copay = Math.min(Math.max(0, bruto), valorTotal)
  return { copay, repass: duasCasas(valorTotal - copay) }
}

/**
 * Descreve a regra em uma linha, para a tela do convênio e para o cabeçalho do
 * fechamento. Quem confere precisa ler a regra sem abrir a configuração.
 */
export function descreverRegraCopay(regra: RegraCopay): string {
  switch (regra.modo) {
    case 'none':
      return 'O tutor não paga nada; o convênio deve o valor integral.'
    case 'percent':
      return `O tutor paga ${Number(regra.percent ?? 0).toString().replace('.', ',')}% do valor; o restante é repasse do convênio.`
    case 'fixed':
      return `O tutor paga R$ ${Number(regra.fixed ?? 0).toFixed(2).replace('.', ',')} por item; o restante é repasse do convênio.`
    default:
      return 'O valor que o tutor paga vem do que está negociado para cada item (ou para o pet).'
  }
}
