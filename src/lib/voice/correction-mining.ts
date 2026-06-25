// Mineração de correções (Frente 2 / fase 2.1).
//
// Dado o par (transcrição bruta da Web Speech, texto final que o MV deixou),
// extrai candidatos a regra de correção. A trava central: só captura
// substituições 1:1 foneticamente PRÓXIMAS (ex.: "tramado"→"tramadol"). Reescrita
// de conteúdo do MV (apagar parágrafo, adicionar frase) gera pares distantes que
// são descartados — não viram regra. Determinístico e testável.

import type { CorrectionRule } from './correction-dictionary'

/** Distância de edição (Levenshtein) entre dois caracteres-cadeia. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[n]
}

type AlignOp = { op: 'match' | 'sub' | 'ins' | 'del'; aTok?: string; bTok?: string }

function tokenize(s: string): string[] {
  return s
    .split(/\s+/)
    .map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
}

/** Alinha duas sequências de tokens via DP (edit distance) com backtrace. */
function alignTokens(a: string[], b: string[]): AlignOp[] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
    }
  }
  const ops: AlignOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        ops.push(cost === 0
          ? { op: 'match', aTok: a[i - 1], bTok: b[j - 1] }
          : { op: 'sub', aTok: a[i - 1], bTok: b[j - 1] })
        i--; j--; continue
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { ops.push({ op: 'del', aTok: a[i - 1] }); i--; continue }
    ops.push({ op: 'ins', bTok: b[j - 1] }); j--
  }
  return ops.reverse()
}

/**
 * É uma correção de transcrição plausível (par fonético próximo) e não uma
 * reescrita de conteúdo? Filtra ruído: tokens curtos, números, e palavras
 * totalmente diferentes (distância de edição grande = reescrita, não correção).
 */
export function isLikelyTranscriptionFix(wrong: string, right: string): boolean {
  if (wrong === right) return false
  if (wrong.length < 3 || right.length < 3) return false
  if (/^\p{N}+$/u.test(wrong) || /^\p{N}+$/u.test(right)) return false

  const dist = levenshtein(wrong, right)
  const maxLen = Math.max(wrong.length, right.length)
  // perto o suficiente para ser o mesmo termo mal transcrito
  const maxAllowed = Math.max(2, Math.floor(maxLen * 0.4))
  if (dist < 1 || dist > maxAllowed) return false
  const similarity = 1 - dist / maxLen
  return similarity >= 0.5
}

/** Extrai candidatos a regra do par (bruto, final). Deduplica por wrong→right. */
export function mineCorrections(raw: string, final: string): CorrectionRule[] {
  const a = tokenize(raw)
  const b = tokenize(final)
  if (a.length === 0 || b.length === 0) return []

  const ops = alignTokens(a, b)
  const out: CorrectionRule[] = []
  const seen = new Set<string>()

  for (const op of ops) {
    if (op.op !== 'sub' || !op.aTok || !op.bTok) continue
    const wrong = op.aTok.toLowerCase()
    const rightLower = op.bTok.toLowerCase()
    if (!isLikelyTranscriptionFix(wrong, rightLower)) continue
    const key = `${wrong}→${rightLower}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ wrong, right: op.bTok })
  }
  return out
}
