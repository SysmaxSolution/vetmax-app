// Certificado e-CNPJ A1 (mTLS) da clínica: cifra, decifra e valida.
// Server-only — nunca importar de componente de cliente.
//
// O certificado é a credencial mais sensível da integração bancária: com ele
// se autentica como a empresa no banco. Por isso fica cifrado em repouso
// (AES-256-GCM com chave do servidor) e nunca volta para o navegador — a tela
// recebe só metadados.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import tls from 'node:tls'

function key(): Buffer {
  const secret = process.env.BANK_CERT_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'sysvet-dev-fallback'
  return scryptSync(secret, 'sysvet-bankcert-v1', 32)
}

/** base64( iv | tag | ciphertext ) */
export function encryptSecret(plain: Buffer | string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const data = typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain
  const ct = Buffer.concat([c.update(data), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

export function decryptSecret(enc: string | null | undefined): Buffer | null {
  if (!enc) return null
  try {
    const buf = Buffer.from(enc, 'base64')
    const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()])
  } catch { return null }
}

export interface ValidacaoPfx { ok: boolean; erro?: string }

/**
 * Confere se o .pfx é utilizável ANTES de guardar.
 *
 * `createSecureContext` é a mesma rotina que o TLS usa de verdade, então ela
 * pega os dois problemas reais do onboarding:
 *  1. senha errada;
 *  2. arquivo emitido com algoritmo legado (RC2-40-CBC). Foi o caso do
 *     certificado da Animais: o OpenSSL 3 do Node recusa carregar, e o erro
 *     cru (`ERR_CRYPTO_UNSUPPORTED_OPERATION`) não diz nada a quem está
 *     configurando. Melhor barrar aqui, com instrução, do que descobrir na
 *     hora de puxar o extrato.
 */
export function validarPfx(pfx: Buffer, passphrase: string | undefined): ValidacaoPfx {
  if (!pfx || pfx.length < 500) return { ok: false, erro: 'Arquivo vazio ou muito pequeno para ser um certificado.' }
  try {
    tls.createSecureContext({ pfx, passphrase })
    return { ok: true }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION' || /unsupported/i.test(err.message)) {
      return {
        ok: false,
        erro: 'O certificado foi emitido com criptografia antiga (RC2-40), que o servidor não aceita mais. '
            + 'Peça à certificadora um arquivo com criptografia atual, ou reexporte o .pfx com AES-256.',
      }
    }
    if (/mac verify|incorrect password|wrong password/i.test(err.message)) {
      return { ok: false, erro: 'Senha do certificado incorreta.' }
    }
    return { ok: false, erro: `Não foi possível ler o certificado: ${err.message}` }
  }
}
