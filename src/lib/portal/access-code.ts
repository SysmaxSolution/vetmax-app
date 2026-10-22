// Código de acesso do tutor (login permanente por CPF + código). Server-only
// (usa crypto). O código é curto, legível, sem caracteres ambíguos, e é
// guardado só como HASH (scrypt) — nunca em texto.
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1
export const CODE_LEN = 8
export const MAX_FAILS = 5
export const LOCK_MINUTES = 15

/** Gera um código legível a partir de bytes aleatórios. */
export function generateAccessCode(bytes: Buffer = randomBytes(CODE_LEN), len = CODE_LEN): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i % bytes.length] % ALPHABET.length]
  return out
}

/** Normaliza a entrada do usuário: maiúsculas, só alfanumérico. */
export function normalizeCode(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Hash "salt:hash" (scrypt). */
export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex')
  const h = scryptSync(normalizeCode(code), salt, 32).toString('hex')
  return `${salt}:${h}`
}

/** Verifica um código contra o hash guardado (timing-safe). */
export function verifyCode(code: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false
  const [salt, h] = stored.split(':')
  try {
    const cand = scryptSync(normalizeCode(code), salt, 32)
    const ref = Buffer.from(h, 'hex')
    return cand.length === ref.length && timingSafeEqual(cand, ref)
  } catch { return false }
}

// ── Lockout (anti brute-force) ────────────────────────────────────────────────
export function isLocked(lockedUntil: string | null | undefined, nowISO: string): boolean {
  if (!lockedUntil) return false
  return new Date(lockedUntil).getTime() > new Date(nowISO).getTime()
}

/** Novo estado após uma tentativa falha: incrementa e trava ao atingir MAX_FAILS. */
export function onFail(currentCount: number, nowISO: string): { count: number; lockedUntil: string | null } {
  const next = (currentCount || 0) + 1
  if (next >= MAX_FAILS) {
    const until = new Date(new Date(nowISO).getTime() + LOCK_MINUTES * 60 * 1000).toISOString()
    return { count: 0, lockedUntil: until }
  }
  return { count: next, lockedUntil: null }
}
