// Lógica PURA de resolução do boleto a partir do retorno do banco.
// Sem 'use server', sem acesso a banco — 100% testável em tests/unit.
//
// Contexto: `nosso_numero` é sequencial POR CONTA BANCÁRIA (migration 0462,
// `next_nosso_numero` começa em 1 para cada conta). Portanto ele NÃO identifica
// uma clínica. Quem identifica é (a) o token de callback da conta na URL do
// webhook ou (b) os dados da carteira presentes no payload do banco.
// Quando nada desambigua, a regra é FALHAR — nunca adivinhar.

/** Dados de carteira extraídos do payload do banco, usados para desempate. */
export interface AccountHints {
  agencia?: string
  conta?: string
  codigoCliente?: string
  carteira?: string
  modalidade?: string
}

/** Um boleto candidato, já com a config da conta bancária dele anexada. */
export interface BoletoCandidate {
  id: string
  clinicId: string
  bankAccountId: string | null
  /** Config da carteira (bank_accounts.boleto_config) da conta do boleto. */
  accountConfig?: AccountHints | null
}

export type ResolveResult =
  | { ok: true; boleto: BoletoCandidate }
  | { ok: false; reason: 'not_found' | 'ambiguous'; message: string; candidates: number }

/** Normaliza identificadores bancários: só dígitos, sem zeros à esquerda. */
export function normalizeBankId(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const digits = s.replace(/\D+/g, '')
  if (!digits) return s.toLowerCase()
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

/**
 * Extrai os dados de carteira do payload do Sicoob, tolerante às variações de
 * nome de campo entre os ambientes/versões da API.
 */
export function extractAccountHints(payload: unknown): AccountHints {
  const r = (payload ?? {}) as Record<string, unknown>
  const nested = (r.resultado ?? r.boleto ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = r[k] ?? nested[k]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    return undefined
  }
  const hints: AccountHints = {
    agencia: pick('agencia', 'numeroAgencia', 'numero_agencia', 'cooperativa', 'numeroCooperativa'),
    conta: pick('conta', 'numeroContaCorrente', 'numero_conta', 'contaCorrente'),
    codigoCliente: pick('codigoCliente', 'numeroCliente', 'codigo_cliente', 'numeroContrato', 'numeroConvenio', 'convenio'),
    carteira: pick('codigoModalidade', 'carteira', 'numeroCarteira'),
    modalidade: pick('modalidade', 'codigoTipoModalidade'),
  }
  for (const k of Object.keys(hints) as (keyof AccountHints)[]) if (!hints[k]) delete hints[k]
  return hints
}

/**
 * Quantos campos de carteira batem entre o payload e a config da conta.
 * Retorna -1 quando há CONFLITO (um campo presente nos dois lados com valores
 * diferentes) — nesse caso o candidato é descartado, não apenas despriorizado.
 */
export function matchScore(hints: AccountHints, cfg: AccountHints | null | undefined): number {
  if (!cfg) return 0
  const fields: (keyof AccountHints)[] = ['agencia', 'conta', 'codigoCliente', 'carteira', 'modalidade']
  let score = 0
  for (const f of fields) {
    const a = normalizeBankId(hints[f])
    const b = normalizeBankId(cfg[f])
    if (!a || !b) continue
    if (a === b) score += 1
    else return -1
  }
  return score
}

/**
 * Escolhe o boleto correto entre os candidatos de MESMO nosso número.
 *
 * Regras, em ordem:
 *  1. Um único candidato → resolve.
 *  2. Vários candidatos → descarta os que conflitam com o payload e fica com os
 *     de maior pontuação de compatibilidade.
 *  3. Se ainda sobrar mais de um (ou nenhum compatível) → ERRO `ambiguous`.
 *     Jamais escolher "o mais recente": isso é dar baixa no título da clínica
 *     errada.
 */
export function resolveBoletoCandidate(candidates: BoletoCandidate[], hints: AccountHints = {}): ResolveResult {
  if (!candidates.length) {
    return { ok: false, reason: 'not_found', message: 'Nenhum boleto com esse nosso número.', candidates: 0 }
  }
  if (candidates.length === 1) return { ok: true, boleto: candidates[0] }

  const scored = candidates
    .map((c) => ({ c, score: matchScore(hints, c.accountConfig) }))
    .filter((x) => x.score >= 0)

  const best = scored.reduce((m, x) => Math.max(m, x.score), -1)
  const winners = scored.filter((x) => x.score === best && x.score > 0)

  if (winners.length === 1) return { ok: true, boleto: winners[0].c }

  const clinics = new Set(candidates.map((c) => c.clinicId)).size
  return {
    ok: false,
    reason: 'ambiguous',
    message:
      `Nosso número ambíguo: ${candidates.length} boletos em ${clinics} clínica(s) e os dados da carteira ` +
      `no retorno do banco não identificam a conta. Registre a URL do webhook com o token da conta ` +
      `(&conta=<token>) para que a baixa seja automática.`,
    candidates: candidates.length,
  }
}
