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
