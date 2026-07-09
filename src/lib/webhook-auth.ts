import { timingSafeEqual } from 'crypto'

/**
 * Comparação de segredos em tempo constante e FAIL-CLOSED.
 * Retorna false se qualquer lado for vazio/ausente (segredo não configurado no
 * ambiente → rejeita), evitando o antipadrão fail-open `if (expected && ...)`.
 */
export function safeSecretEqual(
  incoming: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!incoming || !expected) return false
  const a = Buffer.from(incoming)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
