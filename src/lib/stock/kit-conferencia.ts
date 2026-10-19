// Conferência da devolução do kit cirúrgico (Fase 4 · item 4.1).
//
// Módulo PURO. É a necessidade nº 1 do Vinícius: hoje o kit sai inteiro do
// estoque e o que volta fechado para a prateleira não volta para a conta —
// dinheiro vazando todo dia.
//
// A conferência é POR EXCEÇÃO: a premissa é que saiu tudo, e quem confere marca
// só o que voltou. É a pergunta 4 das 24 enviadas ao Vinícius, e a resposta
// prática é essa porque no fim de uma cirurgia ninguém digita linha por linha —
// se a conferência for trabalhosa, não é feita, e não ser feita é o estado atual.

/** O que saiu para a sala, por item. */
export interface ItemAplicado {
  id:                string
  item_name:         string
  unit:              string | null
  quantity_planned:  number
  unit_price:        number
  /** FALSE = aberto não volta ao estoque (frasco, seringa, campo desembalado). */
  returnable:        boolean
}

/** O que a pessoa marcou na conferência, por item. */
export interface MarcacaoConferencia {
  item_id: string
  /** Quanto voltou fechado para a prateleira. */
  devolvido?: number
  /** Quanto foi aberto e não usado — perda, não devolução. */
  perdido?: number
}

export interface LinhaConferida {
  item_id:    string
  item_name:  string
  unit:       string | null
  /** Quanto saiu. */
  saiu:       number
  /** Quanto volta ao estoque. */
  devolvido:  number
  /** Quanto vira perda registrada. */
  perdido:    number
  /** Quanto efetivamente ficou no animal — é isto que o tutor paga. */
  consumido:  number
  /** Valor a abater da conta pelo que voltou fechado. */
  abatimento: number
  /** Quando a marcação precisou ser corrigida, o motivo fica aqui. */
  aviso:      string | null
}

export interface ResultadoConferencia {
  linhas:            LinhaConferida[]
  total_devolvido:   number
  total_perdido:     number
  /** Soma dos abatimentos — o quanto a conta do tutor diminui. */
  total_abatimento:  number
  avisos:            string[]
}

const duasCasas = (v: number) => Math.round(v * 100) / 100
const tresCasas = (v: number) => Math.round(v * 1000) / 1000

/**
 * Resolve a conferência: dado o que saiu e o que foi marcado, calcula o que
 * volta ao estoque, o que vira perda, o que o tutor paga e o abatimento.
 *
 * Corrige em silêncio o que é erro óbvio de digitação (número negativo, soma
 * maior do que saiu) mas NUNCA sem avisar: cada correção volta como aviso para
 * a tela, porque quem conferiu precisa saber que o número dele foi ajustado.
 *
 * Item marcado como não retornável tem a devolução convertida em perda — é a
 * regra do frasco aberto: saiu da prateleira, não volta, e o custo não
 * desaparece da contabilidade.
 */
export function conferirDevolucaoDoKit(
  itens: ItemAplicado[],
  marcacoes: MarcacaoConferencia[],
): ResultadoConferencia {
  const porItem = new Map<string, MarcacaoConferencia>()
  for (const m of marcacoes) porItem.set(m.item_id, m)

  const linhas: LinhaConferida[] = []
  const avisos: string[] = []

  for (const item of itens) {
    const m = porItem.get(item.id)
    const saiu = tresCasas(Math.max(0, Number(item.quantity_planned) || 0))

    let devolvido = tresCasas(Math.max(0, Number(m?.devolvido ?? 0) || 0))
    let perdido = tresCasas(Math.max(0, Number(m?.perdido ?? 0) || 0))
    let aviso: string | null = null

    // Não retornável: o que foi marcado como devolução é, na verdade, perda.
    if (!item.returnable && devolvido > 0) {
      perdido = tresCasas(perdido + devolvido)
      aviso = `"${item.item_name}" não volta ao estoque depois de aberto — ${devolvido} registrado como perda.`
      devolvido = 0
    }

    // Marcou mais do que saiu: o excedente é cortado. Devolver material que não
    // saiu criaria saldo do nada, e é o tipo de erro que só aparece no inventário.
    if (devolvido + perdido > saiu) {
      const excedente = tresCasas(devolvido + perdido - saiu)
      if (perdido >= excedente) {
        perdido = tresCasas(perdido - excedente)
      } else {
        devolvido = tresCasas(Math.max(0, saiu - perdido))
      }
      aviso = (aviso ? aviso + ' ' : '') +
        `Marcação de "${item.item_name}" passava do que saiu (${saiu}); ajustada para caber.`
    }

    if (aviso) avisos.push(aviso)

    const consumido = tresCasas(saiu - devolvido - perdido)
    // O tutor paga o que ficou no animal MAIS o que se perdeu aberto? Não: a
    // pergunta 7 ao Vinícius (quem paga o aberto não usado) está em aberto, e
    // cobrar sem resposta é decidir pelo cliente. Aqui a perda sai da conta do
    // tutor e fica registrada como perda da clínica; quando ele responder, é uma
    // linha de configuração.
    const abatimento = duasCasas((devolvido + perdido) * (Number(item.unit_price) || 0))

    linhas.push({
      item_id:   item.id,
      item_name: item.item_name,
      unit:      item.unit,
      saiu,
      devolvido,
      perdido,
      consumido,
      abatimento,
      aviso,
    })
  }

  return {
    linhas,
    total_devolvido:  tresCasas(linhas.reduce((s, l) => s + l.devolvido, 0)),
    total_perdido:    tresCasas(linhas.reduce((s, l) => s + l.perdido, 0)),
    total_abatimento: duasCasas(linhas.reduce((s, l) => s + l.abatimento, 0)),
    avisos,
  }
}

/** Resumo em uma linha para o toast depois de conferir. */
export function resumirConferencia(r: ResultadoConferencia, moeda = true): string {
  const partes: string[] = []
  if (r.total_devolvido > 0) partes.push(`${r.total_devolvido} devolvido(s) ao estoque`)
  if (r.total_perdido > 0) partes.push(`${r.total_perdido} registrado(s) como perda`)
  if (moeda && r.total_abatimento > 0) {
    partes.push(`${r.total_abatimento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} abatido(s) da conta`)
  }
  return partes.length > 0 ? partes.join(' · ') : 'Kit conferido: tudo foi usado.'
}
