/**
 * Normalização do CRMV.
 *
 * O banco exige `UF + número` (chk_crmv_format: ^[A-Z]{2}[0-9]{4,10}$), mas as
 * pessoas digitam o que está na carteirinha: "28856", "CRMV-SP 28856",
 * "SP/28856". Sem tratar isso, o UPDATE estourava a CHECK e a tela mostrava
 * "Os dados informados não atendem a uma regra do sistema." — o Dr. Vinícius
 * ficou preso nisso em 30/10/2026 tentando salvar o próprio cadastro.
 *
 * Aqui a entrada é limpa e, quando vem só o número, recebe a sigla do estado
 * da clínica. O que não der para resolver vira uma frase que diz o que fazer.
 */

/** Siglas válidas de unidade federativa — evita aceitar "CR12345" como UF. */
const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

export const EXEMPLO_CRMV = 'SP12345'

/**
 * @param valor    o que a pessoa digitou (pode ser vazio)
 * @param ufClinica sigla do estado da clínica, usada quando só vem o número
 */
export function normalizarCrmv(
  valor: string | null | undefined,
  ufClinica?: string | null,
): { crmv: string | null } | { error: string } {
  const bruto = (valor ?? '').trim()
  if (!bruto) return { crmv: null }

  // Tira o prefixo "CRMV" e tudo que não for letra ou número.
  const limpo = bruto.toUpperCase().replace(/CRMV/g, '').replace(/[^A-Z0-9]/g, '')
  if (!limpo) return { crmv: null }

  const so_numero = /^[0-9]{1,10}$/.test(limpo)
  if (so_numero) {
    const uf = (ufClinica ?? '').trim().toUpperCase()
    if (!UFS.has(uf)) {
      return { error: `Informe o CRMV com a sigla do estado, por exemplo ${EXEMPLO_CRMV}.` }
    }
    if (limpo.length < 4) {
      return { error: `O número do CRMV é curto demais. Informe como ${EXEMPLO_CRMV}.` }
    }
    return { crmv: uf + limpo }
  }

  const m = /^([A-Z]{2})([0-9]{1,10})$/.exec(limpo)
  if (!m) return { error: `CRMV inválido. Use a sigla do estado e o número, por exemplo ${EXEMPLO_CRMV}.` }
  const [, uf, numero] = m
  if (!UFS.has(uf)) return { error: `"${uf}" não é uma sigla de estado. Use, por exemplo, ${EXEMPLO_CRMV}.` }
  if (numero.length < 4) return { error: `O número do CRMV é curto demais. Informe como ${EXEMPLO_CRMV}.` }
  return { crmv: uf + numero }
}
