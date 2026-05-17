/**
 * URL canônica da aplicação — single source of truth para links externos
 * (e-mail, WhatsApp, webhooks da Evolution API, links de convite, etc.).
 *
 * Em produção, deve apontar para o domínio corporativo:
 *   https://sysvetmax.sysmaxsolutions.com
 *
 * Configure NEXT_PUBLIC_APP_URL no .env.local e nas variáveis da Vercel.
 */

const PRODUCTION_DOMAIN = 'https://sysvetmax.sysmaxsolutions.com'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Resolve a URL pública da aplicação. Pode ser chamada em server e client.
 *
 * Prioridade:
 *   1. NEXT_PUBLIC_APP_URL (explícita — recomendada em produção)
 *   2. VERCEL_PROJECT_PRODUCTION_URL (auto-provida pela Vercel — fallback)
 *   3. PRODUCTION_DOMAIN (domínio corporativo final)
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured && configured.startsWith('http')) {
    return stripTrailingSlash(configured)
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl}`

  return PRODUCTION_DOMAIN
}

/**
 * Variante para uso no client (browser). Prefere o domínio canônico configurado
 * em NEXT_PUBLIC_APP_URL e cai em window.location.origin como último recurso.
 *
 * Use para gerar links partilháveis (vacinas, laudos, convites, etc.) — garante
 * que o link sempre aponta para o domínio corporativo mesmo se o usuário acessar
 * via URL alternativa da Vercel.
 */
export function getClientAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured && configured.startsWith('http')) {
    return stripTrailingSlash(configured)
  }
  if (typeof window !== 'undefined') return window.location.origin
  return PRODUCTION_DOMAIN
}
