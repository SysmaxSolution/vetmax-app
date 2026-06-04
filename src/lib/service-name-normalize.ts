/**
 * Normalização de nome de serviço/item para matching (fix B3, reunião
 * 04/06/2026 — "Consulta Veterinária" duplicada no catálogo).
 *
 * O find-or-create do importador Petlove usava ilike(name), que é
 * case-insensitive mas NÃO ignora acentos nem espaços extras — a planilha
 * vem com "CONSULTA VETERINARIA" e o catálogo tem "Consulta Veterinária",
 * então o importador criava um segundo registro (a UNIQUE(clinic_id, name)
 * compara o texto exato e não bloqueia).
 *
 * Mantém a MESMA regra do script scripts/petlove-merge-duplicate-services.mjs
 * (duplicada lá porque .mjs não importa TS) — alterar aqui exige alterar lá.
 */

export function normalizeServiceName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove acentos (combining marks pós-NFD)
    .toLowerCase()
    .replace(/\s+/g, ' ')            // colapsa espaços múltiplos/tabs
    .trim()
}

/**
 * Monta um índice nome-normalizado → id a partir de linhas (id, name).
 * Em caso de nomes que normalizam igual (duplicatas pré-existentes), vence a
 * PRIMEIRA ocorrência da lista — os callers ordenam por created_at ASC para
 * que o registro canônico (mais antigo) seja o escolhido.
 */
export function buildNormalizedNameIndex(
  rows: Array<{ id: string; name: string }>,
): Map<string, string> {
  const index = new Map<string, string>()
  for (const r of rows) {
    const key = normalizeServiceName(r.name ?? '')
    if (!key) continue
    if (!index.has(key)) index.set(key, r.id)
  }
  return index
}
