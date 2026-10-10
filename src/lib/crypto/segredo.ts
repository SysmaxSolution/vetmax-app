// Cifra de segredos guardados no banco (AES-256-GCM).
//
// Estava dentro de `src/lib/integrations/bank-certificate.ts`, que importa
// `node-forge` no topo. Qualquer módulo que precisasse apenas cifrar/decifrar
// arrastava o forge inteiro junto — e o forge é a dependência mais pesada e a
// única com alerta de segurança aberto do projeto. Aqui não há dependência
// nenhuma além do `node:crypto`.
//
// `bank-certificate.ts` reexporta estas funções, então nada que já existia
// precisou mudar.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

/**
 * A chave deriva do segredo do ambiente. `BANK_CERT_SECRET` tem precedência; o
 * service role é o fallback histórico, e o literal só existe para o
 * desenvolvimento local não quebrar.
 *
 * O salt é fixo de propósito: trocá-lo tornaria ilegível tudo o que já está
 * cifrado no banco.
 */
function chave(): Buffer {
  const segredo = process.env.BANK_CERT_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'sysvet-dev-fallback'
  return scryptSync(segredo, 'sysvet-bankcert-v1', 32)
}

/** base64( iv | tag | texto cifrado ) */
export function encryptSecret(plain: Buffer | string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain
  const ct = Buffer.concat([c.update(dados), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

/** Devolve `null` quando não dá para decifrar — chave trocada, dado corrompido. */
export function decryptSecret(enc: string | null | undefined): Buffer | null {
  if (!enc) return null
  try {
    const buf = Buffer.from(enc, 'base64')
    const d = createDecipheriv('aes-256-gcm', chave(), buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()])
  } catch {
    return null
  }
}

/** Açúcar para o caso comum: segredo que é texto. */
export function decryptText(enc: string | null | undefined): string | null {
  const b = decryptSecret(enc)
  return b ? b.toString('utf8') : null
}
