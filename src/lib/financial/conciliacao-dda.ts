// Casamento entre o boleto que veio do banco e o título que já está no sistema.
//
// Nasceu de um caso real (23/10/2026): a mesma compra, com valor e vencimento
// idênticos, não foi reconhecida porque os nomes divergem —
//
//   título (do XML da NF-e) : "L.P.S. AGROFARMA LTDA"
//   boleto (do banco)       : "LPS AGROFARMA LTDA EPP"
//
// A regra antiga comparava os 8 primeiros caracteres, que no título davam
// "l.p.s. a". Não casava, e o operador via "não está no sistema" para um
// título que estava lá — e lançaria a duplicata.
//
// A lição não é melhorar a comparação de texto: é parar de depender dela.
// O boleto traz o CNPJ do beneficiário e o título tem fornecedor cadastrado —
// CNPJ é identidade, nome é aparência.
//
// Módulo puro — sem I/O, testável.

/** O que o banco mandou. */
export interface BoletoDoBanco {
  barcode?:         string | null
  beneficiary?:     string | null
  /** CNPJ do beneficiário, como o banco informa. */
  beneficiary_doc?: string | null
  amount?:          number | null
  due_date?:        string | null
}

/** O que já existe no sistema. */
export interface TituloNoSistema {
  id:            string
  amount:        number
  due_date:      string | null
  description?:  string | null
  beneficiary?:  string | null
  barcode?:      string | null
  /** CNPJ do fornecedor do título, quando houver fornecedor cadastrado. */
  supplier_cnpj?: string | null
}

export type ForcaDoVinculo = 'codigo_barras' | 'cnpj' | 'nome' | null

export interface Casamento {
  titulo: TituloNoSistema | null
  por:    ForcaDoVinculo
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * CNPJ comparável: 14 dígitos, com os zeros à esquerda de volta.
 *
 * Medido em produção: o fornecedor da LPS Agrofarma estava gravado como
 * "4852370000108" — 13 dígitos. O zero inicial se perde quando o CNPJ passa
 * por um campo numérico em algum ponto do caminho, e aí a comparação com o
 * que o banco manda ("04852370000108") falha em silêncio.
 *
 * Comparar com padding não corrige o cadastro, mas impede que um zero
 * perdido quebre a conciliação — que é o que importa aqui.
 */
export function cnpjComparavel(v: unknown): string {
  const d = digitos(v)
  if (!d || d.length > 14) return ''
  return d.padStart(14, '0')
}

/**
 * Nome comparável: sem acento, sem pontuação e sem o sufixo societário.
 *
 * "L.P.S. AGROFARMA LTDA" e "LPS AGROFARMA LTDA EPP" viram ambos
 * "LPS AGROFARMA" — que é o que uma pessoa reconheceria à primeira vista.
 */
export function nomeComparavel(bruto: string | null | undefined): string {
  return String(bruto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
    .toUpperCase()
    // O ponto some SEM virar espaço: é assim que "L.P.S." volta a ser "LPS",
    // como o banco escreve. Trocar por espaço deixaria "L P S", que não casa
    // com nada. Os demais sinais viram espaço, porque ali separam palavras
    // de verdade ("OXI-RIBER").
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A|CIA|COMERCIO|COM|E|DE|DA|DO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Diferença em dias entre duas datas ISO. Null quando alguma falta. */
function diasEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null
}

/** Centavos, para não comparar float com float. */
const emCentavos = (v: unknown) => Math.round((Number(v) || 0) * 100)

/** Tolerância de vencimento: o banco às vezes ajusta para o dia útil seguinte. */
const DIAS_TOLERADOS = 3

/**
 * Acha o título que corresponde ao boleto.
 *
 * A ordem é da identidade para a aparência, e é deliberada:
 *
 *   1. código de barras — é o mesmo documento, sem dúvida possível;
 *   2. CNPJ + valor + vencimento — identidade do fornecedor;
 *   3. nome normalizado + valor + vencimento — último recurso, para o
 *      fornecedor que ainda não tem cadastro com CNPJ.
 *
 * `jaUsados` impede que dois boletos do mesmo fornecedor, mesmo valor e mesmo
 * vencimento (parcelas iguais) apontem para o mesmo título.
 */
export function casarBoleto(
  boleto: BoletoDoBanco,
  titulos: TituloNoSistema[],
  jaUsados: Set<string> = new Set(),
): Casamento {
  const livres = titulos.filter(t => !jaUsados.has(t.id))

  // 1. Código de barras — prova direta.
  const codigo = digitos(boleto.barcode)
  if (codigo) {
    const exato = livres.find(t => digitos(t.barcode) === codigo)
    if (exato) return { titulo: exato, por: 'codigo_barras' }
  }

  const valor = emCentavos(boleto.amount)
  const mesmoValorEData = (t: TituloNoSistema) => {
    if (emCentavos(t.amount) !== valor) return false
    const dias = diasEntre(boleto.due_date, t.due_date)
    // Sem data dos dois lados, valor sozinho não basta para afirmar.
    return dias !== null && dias <= DIAS_TOLERADOS
  }

  // 2. CNPJ do beneficiário — identidade, não aparência.
  const cnpj = cnpjComparavel(boleto.beneficiary_doc)
  if (cnpj) {
    const porCnpj = livres.find(t => cnpjComparavel(t.supplier_cnpj) === cnpj && mesmoValorEData(t))
    if (porCnpj) return { titulo: porCnpj, por: 'cnpj' }
  }

  // 3. Nome normalizado — para quem ainda não tem CNPJ no cadastro.
  const nomeBanco = nomeComparavel(boleto.beneficiary)
  if (nomeBanco) {
    const porNome = livres.find(t => {
      if (!mesmoValorEData(t)) return false
      const nomeTitulo = nomeComparavel(t.beneficiary ?? t.description)
      if (!nomeTitulo) return false
      // Um contém o outro: o banco trunca em 40 caracteres e acrescenta
      // sufixos que o XML não traz (e vice-versa).
      return nomeTitulo.includes(nomeBanco) || nomeBanco.includes(nomeTitulo)
    })
    if (porNome) return { titulo: porNome, por: 'nome' }
  }

  return { titulo: null, por: null }
}
