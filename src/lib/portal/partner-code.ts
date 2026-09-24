// Código de acesso do portal do parceiro (login SÓ por código). Formato
// PPPPP-SSSSSS: PPPPP é a parte PÚBLICA (indexada, usada p/ localizar a conta) e
// SSSSSS é o SEGREDO (guardado só como hash). Assim dá para logar só com o código
// e ainda manter o segredo protegido. Parte pura; hash fica em access-code.ts.
import { generateAccessCode, normalizeCode } from '@/lib/portal/access-code'

export const CODE_PUBLIC_LEN = 5
export const CODE_SECRET_LEN = 6

export interface PartnerCodeParts { publicPart: string; secret: string }

/** Gera um código novo: { publicPart, secret, code }. */
export function generatePartnerCode(): { publicPart: string; secret: string; code: string } {
  const publicPart = generateAccessCode(undefined, CODE_PUBLIC_LEN)
  const secret = generateAccessCode(undefined, CODE_SECRET_LEN)
  return { publicPart, secret, code: `${publicPart}-${secret}` }
}

/** Separa a entrada do usuário em parte pública + segredo. Null se curto demais. */
export function splitPartnerCode(input: string | null | undefined): PartnerCodeParts | null {
  const norm = normalizeCode(input)
  if (norm.length < CODE_PUBLIC_LEN + 1) return null
  return { publicPart: norm.slice(0, CODE_PUBLIC_LEN), secret: norm.slice(CODE_PUBLIC_LEN) }
}

export function formatPartnerCode(publicPart: string, secret: string): string {
  return `${publicPart}-${secret}`
}
