// Dicionário de correção de transcrição (Frente 2 / council 2026-06-24).
//
// A Web Speech API erra termos veterinários e nomes de fármacos ("dirofilariose"
// → "giro filar i ose"). Este módulo aplica substituições determinísticas na
// transcrição ANTES de mandá-la ao Haiku — corrige o que alimenta a extração e
// o prontuário, sem depender de trocar o STT.
//
// As regras vêm de dois níveis (ver getActiveCorrectionsForClinic): o dicionário
// da própria clínica + a camada global anonimizada. A aplicação aqui é pura e
// determinística; o aprendizado/promoção fica nas fases seguintes.

export type CorrectionRule = { wrong: string; right: string }

/**
 * Aplica as regras de correção ao texto.
 * - Casamento case-insensitive com fronteira de palavra Unicode (respeita
 *   acentos PT-BR: "medicação", "dirofilariose").
 * - Preserva a capitalização do trecho original (TRAMADOL → mantém caixa alta).
 * - Regras mais longas primeiro, para "dirofilariose" vencer "diro".
 */
export function applyCorrections(text: string, rules: CorrectionRule[]): string {
  if (!text || rules.length === 0) return text

  const sorted = [...rules]
    .filter(r => r.wrong.trim() && r.right.trim())
    .sort((a, b) => b.wrong.length - a.wrong.length)

  let out = text
  for (const rule of sorted) {
    // Fronteira de palavra Unicode-aware: não casa no meio de outra palavra.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(rule.wrong)}(?![\\p{L}\\p{N}])`, 'giu')
    out = out.replace(re, match => preserveCase(match, rule.right))
  }
  return out
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Espelha a caixa do trecho casado no termo corrigido:
 * - tudo maiúsculo → corrigido em maiúsculo;
 * - Primeira-maiúscula → corrigido capitalizado;
 * - caso contrário → corrigido como cadastrado.
 */
function preserveCase(match: string, replacement: string): string {
  const hasLetters = match.toLowerCase() !== match.toUpperCase()
  if (hasLetters && match === match.toUpperCase()) return replacement.toUpperCase()
  if (hasLetters && match[0] === match[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}
