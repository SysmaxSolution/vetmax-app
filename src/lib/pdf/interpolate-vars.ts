/**
 * LEI 3 — Fim do Vazamento de Variaveis.
 *
 * Em qualquer momento que um texto chegue ao drawText do pdf-lib, ele DEVE
 * passar por esta funcao. Substitui literais como [professional_name],
 * [[professional_name]], {{professional_name}} ou ${professional_name} pelos
 * valores do contexto. Tokens nao encontrados viram string vazia (NUNCA
 * deixam o literal vazar para o PDF final).
 *
 * O contexto e construido na server action de geracao (document-generation.ts)
 * a partir do usuario logado e do perfil profissional.
 */

export type InterpolationContext = Record<string, string | number | null | undefined>

/**
 * Regex que captura QUALQUER um destes padroes:
 *   [token]
 *   [[token]]
 *   {{token}}
 *   {token}
 *   ${token}
 *
 * `token` aceita [a-zA-Z0-9_], comprimento >= 1.
 */
const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_]+)\s*\}|\[\[\s*([a-zA-Z0-9_]+)\s*\]\]|\[\s*([a-zA-Z0-9_]+)\s*\]|\{\s*([a-zA-Z0-9_]+)\s*\}/g

export function interpolateText(text: string, ctx: InterpolationContext): string {
  if (!text) return ''
  return text.replace(VAR_RE, (_match, t1, t2, t3, t4, t5) => {
    const token = t1 || t2 || t3 || t4 || t5
    if (!token) return ''
    const v = ctx[token]
    if (v === null || v === undefined) return ''
    return String(v)
  })
}

/** True se houver qualquer placeholder reconhecido no texto. */
export function hasPlaceholder(text: string): boolean {
  if (!text) return false
  VAR_RE.lastIndex = 0
  return VAR_RE.test(text)
}
