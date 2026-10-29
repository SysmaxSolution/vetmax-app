// Núcleo PURO de boleto bancário (padrão FEBRABAN) — cálculo do código de barras
// (44 dígitos) e da linha digitável (47 dígitos). Determinístico e testável.
// Em produção usamos a linha/código retornados PELO BANCO; isto serve para o
// preview do layout (ex.: sandbox) e para o desenho do boleto na tela.

const DAY = 86400000
const onlyDigits = (s: string) => (s ?? '').replace(/\D/g, '')
const pad = (v: string | number, n: number) => onlyDigits(String(v)).padStart(n, '0').slice(-n)

/** Fator de vencimento FEBRABAN (base 07/10/1997; rollover 9999→1000 em 22/02/2025). */
export function fatorVencimento(dueISO: string): string {
  const [y, m, d] = dueISO.slice(0, 10).split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const base = Date.UTC(1997, 9, 7)
  let f = Math.floor((due - base) / DAY)
  if (f > 9999) f -= 9000            // ciclo FEBRABAN (comunicado 2025)
  return pad(f, 4)
}

/** Valor em centavos → 10 dígitos (reais com 2 casas, sem separador). */
export function valorBarras(reais: number): string {
  return pad(Math.round(reais * 100), 10)
}

/** Dígito verificador Módulo 10 (linha digitável — campos). */
export function mod10(num: string): number {
  const s = onlyDigits(num)
  let sum = 0, mult = 2
  for (let i = s.length - 1; i >= 0; i--) {
    let p = Number(s[i]) * mult
    if (p > 9) p = Math.floor(p / 10) + (p % 10)
    sum += p
    mult = mult === 2 ? 1 : 2
  }
  const dv = 10 - (sum % 10)
  return dv === 10 ? 0 : dv
}

/** Dígito verificador geral Módulo 11 do código de barras (posição 5). */
export function mod11Barras(num: string): number {
  const s = onlyDigits(num)
  let sum = 0, weight = 2
  for (let i = s.length - 1; i >= 0; i--) {
    sum += Number(s[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const resto = sum % 11
  const dv = 11 - resto
  return (dv === 0 || dv === 10 || dv === 11) ? 1 : dv
}

export interface BarcodeParts {
  banco: string          // 3 (ex.: 756 Sicoob)
  moeda?: string         // 1 (default 9)
  dueISO: string         // vencimento
  valor: number          // reais
  campoLivre: string     // 25 dígitos
}

/** Monta o código de barras de 44 dígitos (com DV geral na posição 5). */
export function codigoBarras(p: BarcodeParts): string {
  const banco = pad(p.banco, 3)
  const moeda = pad(p.moeda ?? '9', 1)
  const fator = fatorVencimento(p.dueISO)
  const valor = valorBarras(p.valor)
  const campo = pad(p.campoLivre, 25)
  const semDV = banco + moeda + fator + valor + campo   // 43 dígitos
  const dv = mod11Barras(semDV)
  return banco + moeda + String(dv) + fator + valor + campo   // 44
}

/** Deriva a linha digitável (47 dígitos, sem pontuação) do código de barras. */
export function linhaDigitavel(cb: string): string {
  const c = onlyDigits(cb)
  if (c.length !== 44) throw new Error('Código de barras deve ter 44 dígitos.')
  const banco = c.slice(0, 4)       // banco+moeda (posições 1-4)
  const dvGeral = c[4]              // posição 5
  const fatorValor = c.slice(5, 19) // fator(4)+valor(10)
  const campo = c.slice(19)        // campo livre (25)

  const c1 = banco + campo.slice(0, 5)   // 9
  const c2 = campo.slice(5, 15)          // 10
  const c3 = campo.slice(15, 25)         // 10
  return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + dvGeral + fatorValor
}

/** Formata a linha digitável para exibição (com os pontos e espaços do boleto). */
export function formatLinhaDigitavel(ld: string): string {
  const s = onlyDigits(ld)
  if (s.length !== 47) return s
  return `${s.slice(0, 5)}.${s.slice(5, 10)} ${s.slice(10, 15)}.${s.slice(15, 21)} ${s.slice(21, 26)}.${s.slice(26, 32)} ${s.slice(32, 33)} ${s.slice(33)}`
}

// ─── Sicoob (756) ─────────────────────────────────────────────────────────────
export interface SicoobBoletoData {
  agencia: string        // cooperativa (4)
  codigoCliente: string  // nº do beneficiário / cedente (até 10)
  carteira?: string      // 1 (default '1')
  modalidade?: string    // 2 (default '01')
  nossoNumero: string    // sequencial (até 7)
}

/**
 * Campo livre do Sicoob (25 dígitos). Layout usual:
 * carteira(1) + cooperativa(4) + modalidade(2) + código do cliente(7) +
 * nosso número(10) + parcela(1). ⚠ Validar com um boleto real de produção.
 */
export function sicoobCampoLivre(d: SicoobBoletoData): string {
  const carteira = pad(d.carteira ?? '1', 1)
  const coop = pad(d.agencia, 4)
  const modalidade = pad(d.modalidade ?? '01', 2)
  const cliente = pad(d.codigoCliente, 7)
  const nn = pad(d.nossoNumero, 10)
  const parcela = '1'
  return carteira + coop + modalidade + cliente + nn + parcela   // 25
}

/** DV do "nosso número" do Sicoob (módulo 11, pesos 3,1,9,7). */
export function sicoobNossoNumeroDV(agencia: string, codigoCliente: string, nossoNumero: string): number {
  const base = pad(agencia, 4) + pad(codigoCliente, 10) + pad(nossoNumero, 7)  // 21
  const pesos = [3, 1, 9, 7]
  let sum = 0
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * pesos[i % 4]
  const resto = sum % 11
  const dv = 11 - resto
  return dv >= 10 ? 0 : dv
}

export interface BoletoComputed {
  codigoBarras: string
  linhaDigitavel: string
  linhaDigitavelFmt: string
  nossoNumeroDV: number
  nossoNumeroFmt: string
}

/** Gera código de barras + linha digitável de um boleto Sicoob (para preview/desenho). */
export function gerarBoletoSicoob(input: {
  agencia: string; codigoCliente: string; carteira?: string; modalidade?: string
  nossoNumero: string; valor: number; dueISO: string
}): BoletoComputed {
  const campoLivre = sicoobCampoLivre(input)
  const cb = codigoBarras({ banco: '756', dueISO: input.dueISO, valor: input.valor, campoLivre })
  const ld = linhaDigitavel(cb)
  const dv = sicoobNossoNumeroDV(input.agencia, input.codigoCliente, input.nossoNumero)
  return {
    codigoBarras: cb,
    linhaDigitavel: ld,
    linhaDigitavelFmt: formatLinhaDigitavel(ld),
    nossoNumeroDV: dv,
    nossoNumeroFmt: `${input.nossoNumero}-${dv}`,
  }
}
