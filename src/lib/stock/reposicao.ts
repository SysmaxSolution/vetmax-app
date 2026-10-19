// Sugestão de compra pela saída e alerta de validade (Fase 4 · item 4.4).
//
// Módulo PURO. É a dor da Aline, que hoje mantém lista de compras e planilha de
// validades à mão.
//
// A regra do ponto de pedido: comprar quando o saldo acabou já é tarde, porque
// o fornecedor leva dias para entregar. O ponto de pedido é o consumo do período
// de entrega — abaixo dele, o item acaba antes de a compra chegar.

export interface ParametrosDeCompra {
  /** Dias de consumo que a compra deve cobrir. Padrão da clínica. */
  coverage_days_default: number
  /** Prazo de entrega assumido quando o item não tem o próprio. */
  lead_time_default: number
}

export const PARAMETROS_PADRAO: ParametrosDeCompra = {
  coverage_days_default: 30,
  lead_time_default:     7,
}

export interface ItemParaRepor {
  stock_item_id:     string
  name:              string
  unit:              string | null
  /** Saldo atual (pode ser negativo — divergência de estoque). */
  quantity:          number
  min_quantity:      number
  /** Total consumido na janela observada. */
  consumo_periodo:   number
  /** Tamanho da janela observada, em dias. */
  dias_periodo:      number
  lead_time_days:    number | null
  coverage_days:     number | null
  purchase_multiple: number | null
  purchase_minimum:  number | null
  shelf_code:        string | null
  location_name:     string | null
  supplier_name:     string | null
}

export interface SugestaoDeCompra {
  stock_item_id:    string
  name:             string
  unit:             string | null
  quantity:         number
  /** Consumo médio por dia na janela observada. */
  consumo_diario:   number
  /** Abaixo disto o item acaba antes de a compra chegar. */
  ponto_de_pedido:  number
  /** Quanto comprar, já arredondado para a embalagem fechada. */
  sugerido:         number
  /** Em quantos dias o saldo zera no ritmo atual. null = sem consumo medido. */
  dias_restantes:   number | null
  urgencia:         'critico' | 'atencao' | 'programado'
  /** Por que este item entrou na lista — texto para a tela. */
  motivo:           string
  shelf_code:       string | null
  location_name:    string | null
  supplier_name:    string | null
}

const tresCasas = (v: number) => Math.round(v * 1000) / 1000

/** Arredonda para cima no múltiplo da embalagem fechada (caixa de 100). */
function arredondarParaEmbalagem(qtd: number, multiplo: number | null, minimo: number | null): number {
  let valor = qtd
  if (minimo && minimo > 0) valor = Math.max(valor, minimo)
  if (multiplo && multiplo > 0) valor = Math.ceil(valor / multiplo) * multiplo
  return tresCasas(valor)
}

/**
 * Decide se o item precisa de compra e quanto comprar.
 *
 * Retorna null quando não há o que sugerir — o item tem folga e consumo normal.
 * Um item SEM consumo medido na janela só entra na lista se estiver abaixo do
 * mínimo cadastrado: sugerir compra de algo que ninguém usou é como a lista de
 * compras deixa de ser confiável e passa a ser ignorada.
 */
export function sugerirCompra(
  item: ItemParaRepor,
  params: ParametrosDeCompra = PARAMETROS_PADRAO,
): SugestaoDeCompra | null {
  const dias = item.dias_periodo > 0 ? item.dias_periodo : 1
  const consumoDiario = tresCasas(Math.max(0, Number(item.consumo_periodo) || 0) / dias)
  const leadTime = item.lead_time_days ?? params.lead_time_default
  const cobertura = item.coverage_days ?? params.coverage_days_default
  const saldo = Number(item.quantity) || 0

  const pontoDePedido = tresCasas(consumoDiario * leadTime)
  const diasRestantes = consumoDiario > 0 ? Math.floor(Math.max(0, saldo) / consumoDiario) : null

  const abaixoDoMinimo = item.min_quantity > 0 && saldo <= item.min_quantity
  const abaixoDoPonto = pontoDePedido > 0 && saldo <= pontoDePedido
  const negativo = saldo < 0

  if (!negativo && !abaixoDoMinimo && !abaixoDoPonto) return null
  // Sem consumo medido, só o mínimo cadastrado (ou saldo negativo) justifica.
  if (consumoDiario === 0 && !abaixoDoMinimo && !negativo) return null

  // Quanto comprar: cobrir o período de cobertura mais o tempo de entrega,
  // descontando o que já existe. Sem consumo medido, repõe até o mínimo.
  const alvo = consumoDiario > 0
    ? consumoDiario * (cobertura + leadTime)
    : Math.max(item.min_quantity, 1)
  const bruto = Math.max(0, alvo - saldo)
  const sugerido = arredondarParaEmbalagem(bruto, item.purchase_multiple, item.purchase_minimum)

  let urgencia: SugestaoDeCompra['urgencia'] = 'programado'
  let motivo: string
  if (negativo) {
    urgencia = 'critico'
    motivo = `Saldo negativo (${tresCasas(saldo)}) — confira o estoque antes de comprar.`
  } else if (diasRestantes !== null && diasRestantes <= leadTime) {
    urgencia = 'critico'
    motivo = diasRestantes === 0
      ? 'Acaba hoje no ritmo atual, e a entrega leva ' + leadTime + ' dia(s).'
      : `Acaba em ${diasRestantes} dia(s) e a entrega leva ${leadTime} — pedir agora.`
  } else if (abaixoDoMinimo) {
    urgencia = 'atencao'
    motivo = `Abaixo do mínimo cadastrado (${tresCasas(item.min_quantity)}).`
  } else {
    urgencia = 'atencao'
    motivo = `No ponto de pedido (${pontoDePedido} para ${leadTime} dia(s) de entrega).`
  }

  return {
    stock_item_id:   item.stock_item_id,
    name:            item.name,
    unit:            item.unit,
    quantity:        tresCasas(saldo),
    consumo_diario:  consumoDiario,
    ponto_de_pedido: pontoDePedido,
    sugerido,
    dias_restantes:  diasRestantes,
    urgencia,
    motivo,
    shelf_code:      item.shelf_code,
    location_name:   item.location_name,
    supplier_name:   item.supplier_name,
  }
}

/** Ordena a lista de compras: o que queima primeiro aparece primeiro. */
export function ordenarSugestoes(lista: SugestaoDeCompra[]): SugestaoDeCompra[] {
  const peso = { critico: 0, atencao: 1, programado: 2 }
  return [...lista].sort((a, b) =>
    peso[a.urgencia] - peso[b.urgencia]
    || (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999)
    || a.name.localeCompare(b.name, 'pt-BR'))
}

// ─── Alerta de validade ─────────────────────────────────────────────────────

export interface LoteComValidade {
  batch_id:      string
  stock_item_id: string
  item_name:     string
  unit:          string | null
  batch_number:  string | null
  expiry_date:   string | null
  quantity:      number
  shelf_code:    string | null
  location_name: string | null
  is_controlled: boolean
}

export interface AlertaDeValidade extends LoteComValidade {
  /** Negativo = já venceu. */
  dias_para_vencer: number
  situacao:         'vencido' | 'vence_em_breve'
}

/** Diferença em dias entre duas datas 'YYYY-MM-DD', sem passar por fuso. */
export function diasEntre(de: string, para: string): number {
  const serial = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number)
    return Date.UTC(a, m - 1, d) / 86400000
  }
  return Math.round(serial(para) - serial(de))
}

/**
 * Filtra os lotes que vencem dentro de `dias` (ou já venceram), do mais urgente
 * para o menos. Lote sem validade cadastrada e lote zerado ficam fora: alerta
 * sobre o que não existe treina a equipe a ignorar o alerta.
 */
export function alertasDeValidade(
  lotes: LoteComValidade[],
  hoje: string,
  dias = 60,
): AlertaDeValidade[] {
  const saida: AlertaDeValidade[] = []
  for (const l of lotes) {
    if (!l.expiry_date) continue
    if (!(Number(l.quantity) > 0)) continue
    const faltam = diasEntre(hoje, l.expiry_date)
    if (faltam > dias) continue
    saida.push({
      ...l,
      dias_para_vencer: faltam,
      situacao: faltam < 0 ? 'vencido' : 'vence_em_breve',
    })
  }
  return saida.sort((a, b) =>
    a.dias_para_vencer - b.dias_para_vencer || a.item_name.localeCompare(b.item_name, 'pt-BR'))
}

/** Texto do alerta, já na linguagem de quem vai agir. */
export function descreverValidade(a: AlertaDeValidade): string {
  const lote = a.batch_number ? `lote ${a.batch_number}` : 'lote sem número'
  if (a.dias_para_vencer < 0) {
    return `Venceu há ${Math.abs(a.dias_para_vencer)} dia(s) — ${lote}, ${a.quantity} ${a.unit ?? 'un'} ainda no saldo.`
  }
  if (a.dias_para_vencer === 0) return `Vence hoje — ${lote}, ${a.quantity} ${a.unit ?? 'un'}.`
  return `Vence em ${a.dias_para_vencer} dia(s) — ${lote}, ${a.quantity} ${a.unit ?? 'un'}.`
}
