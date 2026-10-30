/**
 * CRMV — campo livre.
 *
 * Até 30/10/2026 o banco exigia "UF + número" (chk_crmv_format). O Dr. Vinícius
 * digitou "28856", o número da carteirinha dele, e a tela respondeu "Os dados
 * informados não atendem a uma regra do sistema". A Aline então pediu o campo
 * livre: na clínica o número vem antes da sigla, e cada profissional escreve do
 * jeito que o registro dele usa. A migration 0529 soltou a regra de formato.
 *
 * Sobra aqui a higiene mínima (espaços) e a leitura da sigla do estado, que os
 * documentos usam como UF padrão.
 */

/** Siglas de unidade federativa, para achar o estado dentro do texto livre. */
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

/** Limite que a CHECK do banco aceita (0529). */
export const CRMV_MAX = 30

/**
 * Tira espaços das pontas e colapsa os do meio. Não muda maiúscula/minúscula
 * nem reordena nada: o que a pessoa escreveu é o que fica gravado.
 */
export function limparCrmv(valor: string | null | undefined): string | null {
  const s = (valor ?? '').replace(/\s+/g, ' ').trim()
  return s || null
}

/** `true` se o valor cabe no campo (a única regra que sobrou no banco). */
export function crmvCabe(valor: string | null | undefined): boolean {
  const s = limparCrmv(valor)
  return s === null || (s.length >= 2 && s.length <= CRMV_MAX)
}

/**
 * Sigla do estado dentro do CRMV escrito livremente — serve para preencher a
 * UF padrão nos documentos. Aceita "SP28856", "28856-SP", "CRMV/SP 28856".
 * Devolve `''` quando não dá para afirmar.
 */
export function ufDoCrmv(valor: string | null | undefined): string {
  const s = (valor ?? '').toUpperCase()
  // "CRMV" contém "MV", que não é UF, mas pode esconder a sigla seguinte.
  const semPrefixo = s.replace(/CRMV/g, ' ')
  const achadas = (semPrefixo.match(/[A-Z]{2}/g) ?? []).filter(x => UFS.includes(x))
  return achadas.length === 1 ? achadas[0] : (achadas[0] ?? '')
}
