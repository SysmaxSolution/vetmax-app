// Conversão de valores da EvoluServices — módulo PURO.
//
// POR QUE ISTO EXISTE SEPARADO
// ----------------------------
// A mesma integração usa TRÊS formatos de valor, e o mesmo campo tem formato
// diferente em cada API. Medido na documentação, arquivo por arquivo:
//
//   | onde                                  | formato                  | exemplo     |
//   |---------------------------------------|--------------------------|-------------|
//   | `order.amount` (criar link)           | string, CENTAVOS         | "1000000"   |
//   | `order.splits[].value` (link)         | inteiro, CENTAVOS        | "9600"      |
//   | `transaction.value` (maquininha)      | decimal com ponto, 2 casas | "10.00"   |
//   | `transaction.splits[].value`          | decimal com ponto, 2 casas | "2.00"    |
//   | `payments[].value` (callback/consulta)| decimal                  | 4.95        |
//
// Mandar centavos no split da maquininha faz o beneficiário receber 100× o
// devido. No caminho inverso, decimal no link, o split sai 100× menor **e
// passa** sem erro. Já levamos um 100× no Sicoob por confusão de unidade.
//
// Por isso NÃO existe aqui uma função `paraCentavos()` genérica: cada função
// carrega no nome o endpoint a que serve, e quem chama é obrigado a escolher.

/**
 * Converte reais em centavos inteiros, com aritmética DECIMAL em vez de
 * binária.
 *
 * Multiplicar por 100 em ponto flutuante erra: `2.675 * 100` dá
 * `267.49999999999997`, e `(2.675).toFixed(2)` dá `"2.67"` — os dois arredondam
 * meio centavo para BAIXO, porque o 2,675 que existe na memória é um pouco
 * menor que 2,675. Em dinheiro isso não é aceitável: o resultado tem de ser
 * previsível e igual ao que uma pessoa faria no papel.
 *
 * Então a conta é feita sobre a representação decimal: separa inteiro e
 * centavos, e arredonda o terceiro dígito meio-para-cima (o mesmo critério de
 * banco). Não depende de IEEE 754 em nenhum ponto.
 */
function emCentavos(reais: number): number {
  if (!Number.isFinite(reais)) throw new Error('valor não numérico')
  if (reais < 0) throw new Error('valor negativo')

  // Notação científica (1e-7) não tem forma decimal direta; aí o binário serve,
  // porque o valor é desprezível em dinheiro de qualquer modo.
  const texto = String(reais)
  if (texto.includes('e') || texto.includes('E')) return Math.round(reais * 100)

  const [inteiro, decimais = ''] = texto.split('.')
  const centavos = Number(inteiro) * 100 + Number((decimais + '00').slice(0, 2))
  // Terceiro dígito decimal decide o arredondamento: 5 ou mais sobe um centavo.
  const terceiro = Number(decimais[2] ?? '0')
  return centavos + (terceiro >= 5 ? 1 : 0)
}

/**
 * Valor para o **Link de Pagamento** (`order.amount` e `order.splits[].value`).
 * String de centavos, sem separador: R$ 10,00 → `"1000"`.
 */
export function valorParaLink(reais: number): string {
  return String(emCentavos(reais))
}

/**
 * Valor para a **Transação Remota** (`transaction.value` e
 * `transaction.splits[].value`). Decimal com ponto e sempre 2 casas, porque a
 * validação deles é `\d+\.\d{2}` — `"10"` e `"10.0"` são recusados.
 */
export function valorParaTransacaoRemota(reais: number): string {
  const c = emCentavos(reais)
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`
}

/**
 * Lê um valor que VEIO deles (callback ou consulta) e devolve reais.
 *
 * Aceita os dois formatos de propósito: `payments[].value` vem decimal
 * (`4.95`), mas `transaction.amount` na consulta de order é descrito como
 * "menor unidade de contagem" e **exemplificado como `"100.00"`** — a doc se
 * contradiz no mesmo arquivo. A heurística é conservadora: valor com separador
 * decimal é tratado como reais; inteiro sem separador, como centavos.
 */
export function lerValorDeles(bruto: unknown): number {
  if (bruto === null || bruto === undefined || bruto === '') return 0
  if (typeof bruto === 'number') return Number(bruto.toFixed(2))

  const texto = String(bruto).trim()
  if (texto === '') return 0

  // Tem separador decimal → já está em reais.
  if (/[.,]\d{1,2}$/.test(texto)) {
    const n = Number(texto.replace(',', '.'))
    if (!Number.isFinite(n)) throw new Error(`valor ilegível: ${texto}`)
    return Number(n.toFixed(2))
  }

  // Inteiro puro → centavos.
  if (/^\d+$/.test(texto)) return Number(texto) / 100

  throw new Error(`valor em formato não reconhecido: ${texto}`)
}

/**
 * Valida o split antes de enviar. A soma das partes dos beneficiários não pode
 * passar do valor da venda — eles recusam com
 * `SPLIT_SUM_GREATER_THAN_TRANSACTION_VALUE`, mas falhar aqui dá mensagem em
 * português para a recepção em vez de um HTTP 500.
 */
export function validarSplit(
  totalReais: number,
  partes: Array<{ valor: number; nome?: string }>,
): { ok: true } | { erro: string } {
  const total = emCentavos(totalReais)
  let soma = 0
  for (const p of partes) {
    if (!(p.valor > 0)) {
      return { erro: `O split${p.nome ? ` de ${p.nome}` : ''} precisa de um valor maior que zero.` }
    }
    soma += emCentavos(p.valor)
  }
  if (soma > total) {
    const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return { erro: `A soma dos repasses (${fmt(soma)}) passa do valor da venda (${fmt(total)}).` }
  }
  return { ok: true }
}

/**
 * Converte percentual de comissão em valor absoluto, que é o que a API aceita —
 * ela não trabalha com percentual. A sobra de arredondamento fica com a
 * clínica, nunca com o beneficiário: dividir R$ 100 em 3 partes de 33,33 deixa
 * 1 centavo, e esse centavo não pode virar um repasse a mais.
 */
export function comissaoEmValor(totalReais: number, percentual: number): number {
  if (!(percentual > 0)) return 0
  const pct = Math.min(100, percentual)
  const centavos = Math.floor(emCentavos(totalReais) * pct / 100)
  return centavos / 100
}
