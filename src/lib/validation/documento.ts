// Dígito verificador de CPF e CNPJ.
//
// Existe porque o sistema emite NFS-e e boleto: documento inválido só aparece
// depois, como rejeição na prefeitura ou no banco, e aí já virou retrabalho
// para o financeiro. Conferir o dígito aqui custa nada.
//
// Não valida se o documento EXISTE na Receita — só se é um número bem formado.

/** Só os dígitos. */
export function apenasDigitos(v: string): string {
  return (v ?? '').replace(/\D+/g, '')
}

/**
 * CPF: 11 dígitos, dois verificadores pelo módulo 11.
 * Rejeita as sequências repetidas (000…, 111…), que passam no cálculo mas não
 * são CPF de ninguém.
 */
export function cpfValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  for (const [tamanho, posicao] of [[9, 9], [10, 10]] as const) {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    const dv = resto === 10 ? 0 : resto
    if (dv !== Number(d[posicao])) return false
  }
  return true
}

/**
 * CNPJ: 14 dígitos, dois verificadores pelo módulo 11 com pesos 2..9 ciclados.
 * Aceita só o formato numérico — o CNPJ alfanumérico (2026) ainda não entrou
 * em nenhum dos nossos fluxos fiscais; quando entrar, é aqui que muda.
 */
export function cnpjValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const calcula = (base: string): number => {
    let peso = 2, soma = 0
    for (let i = base.length - 1; i >= 0; i--) {
      soma += Number(base[i]) * peso
      peso = peso === 9 ? 2 : peso + 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  if (calcula(d.slice(0, 12)) !== Number(d[12])) return false
  if (calcula(d.slice(0, 13)) !== Number(d[13])) return false
  return true
}

/** CPF (11) ou CNPJ (14), decidido pelo comprimento. */
export function cpfOuCnpjValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

export function formataCpfCnpj(valor: string): string {
  const d = apenasDigitos(valor)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return valor
}
