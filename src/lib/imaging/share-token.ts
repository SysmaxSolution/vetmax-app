// Lógica pura dos links de compartilhamento de estudo de imagem (token opaco
// expirável). Sem I/O — a aleatoriedade (bytes) e o "agora" entram por parâmetro
// para serem testáveis. Reutilizada pela action e pela rota pública /public/laudo.

export const SHARE_TOKEN_PREFIX = 'img_'

/** Monta o token a partir de bytes aleatórios em hex (gerados na action). */
export function formatShareToken(hex: string): string {
  return SHARE_TOKEN_PREFIX + (hex ?? '').replace(/[^a-f0-9]/gi, '').toLowerCase()
}

/** Valida o formato do token (prefixo + hex de tamanho suficiente). Não consulta o banco. */
export function isValidTokenFormat(token: string | null | undefined): boolean {
  if (!token) return false
  if (!token.startsWith(SHARE_TOKEN_PREFIX)) return false
  const hex = token.slice(SHARE_TOKEN_PREFIX.length)
  return /^[a-f0-9]{24,}$/.test(hex)
}

export interface ShareLinkLike {
  expires_at: string | null
  revoked_at: string | null
}

export function isLinkRevoked(link: ShareLinkLike): boolean {
  return !!link.revoked_at
}

export function isLinkExpired(link: ShareLinkLike, nowISO: string): boolean {
  if (!link.expires_at) return false // sem expiração
  return new Date(link.expires_at).getTime() <= new Date(nowISO).getTime()
}

export type LinkViewReason = 'revoked' | 'expired'

/** Um link só pode ser visto se não foi revogado e não expirou. */
export function canViewLink(
  link: ShareLinkLike,
  nowISO: string,
): { ok: boolean; reason?: LinkViewReason } {
  if (isLinkRevoked(link)) return { ok: false, reason: 'revoked' }
  if (isLinkExpired(link, nowISO)) return { ok: false, reason: 'expired' }
  return { ok: true }
}

/** Calcula o vencimento (ISO) a partir de um número de dias; null = sem expiração. */
export function computeExpiry(nowISO: string, days: number | null): string | null {
  if (days == null || days <= 0) return null
  const ms = new Date(nowISO).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString()
}
