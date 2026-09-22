// Código público de verificação de laudo (aparece no QR e na URL /verificar).
// Curto, legível, sem caracteres ambíguos. Puro/testável.
import { randomBytes, createHash } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1
export const VERIFY_CODE_LEN = 10

/** Gera um código de verificação legível (ex.: 'K7Q2M9XR4T'). */
export function generateVerifyCode(bytes: Buffer = randomBytes(VERIFY_CODE_LEN)): string {
  let out = ''
  for (let i = 0; i < VERIFY_CODE_LEN; i++) out += ALPHABET[bytes[i % bytes.length] % ALPHABET.length]
  return out
}

/** Normaliza o código digitado (maiúsculas, só alfanumérico permitido). */
export function normalizeVerifyCode(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Formata para leitura humana em blocos: 'K7Q2M-9XR4T'. */
export function formatVerifyCode(code: string): string {
  const c = normalizeVerifyCode(code)
  return c.length === VERIFY_CODE_LEN ? `${c.slice(0, 5)}-${c.slice(5)}` : c
}

/** SHA-256 (hex) de um buffer. */
export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** JSON canônico (chaves ordenadas recursivamente) — hash estável
 *  independente da ordem em que o Postgres/JS serializam o objeto. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

/**
 * Hash de autenticidade de um documento do motor Canvas (não há PDF no
 * storage — o print é client-side). Cobre o layout congelado (snapshot) e
 * o conteúdo preenchido pelo MV. Qualquer alteração em um dos dois muda o
 * hash → /public/verificar acusa "Documento alterado".
 */
export function hashCanvasDocument(canvasStateSnapshot: unknown, contentJson: unknown): string {
  const payload = canonicalJson({ v: 1, canvas_state_snapshot: canvasStateSnapshot ?? null, content_json: contentJson ?? null })
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}
