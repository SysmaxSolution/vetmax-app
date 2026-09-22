// Guarda o código de acesso de forma REVERSÍVEL (cifrado com chave do servidor)
// para poder reexibir mascarado + revelar sob demanda — sem deixar em texto no
// banco. A verificação de login continua pelo HASH (access-code.ts). Server-only.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

function key(): Buffer {
  const secret = process.env.PORTAL_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sysvet-dev-fallback'
  return scryptSync(secret, 'sysvet-code-v1', 32)
}

/** Cifra o código → base64(iv | tag | ciphertext). */
export function encryptCode(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Decifra; retorna null se inválido/violado. */
export function decryptCode(enc: string | null | undefined): string | null {
  if (!enc) return null
  try {
    const buf = Buffer.from(enc, 'base64')
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28)
    const d = createDecipheriv('aes-256-gcm', key(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch { return null }
}

function maskPart(s: string): string {
  if (s.length <= 2) return '••'
  return '•'.repeat(Math.max(2, s.length - 2)) + s.slice(-2)
}

/** Máscara para exibição: mostra a parte pública, esconde o segredo (últimos 2 à vista).
 *  'ABCDE-234567' → 'ABCDE-••••67' · 'ABCD2345' → 'AB••••45'. */
export function maskCode(code: string | null | undefined): string {
  if (!code) return ''
  if (code.includes('-')) {
    const [pub, sec] = code.split('-')
    return `${pub}-${maskPart(sec)}`
  }
  if (code.length <= 4) return maskPart(code)
  return code.slice(0, 2) + '•'.repeat(Math.max(2, code.length - 4)) + code.slice(-2)
}
