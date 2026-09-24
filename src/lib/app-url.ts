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
 *   1. NEXT_PUBLIC_APP_URL — apenas se for domínio HTTPS público (não localhost).
 *      Útil para ambientes de staging com domínio próprio.
 *   2. PRODUCTION_DOMAIN — domínio corporativo canônico (sysvetmax.sysmaxsolutions.com).
 *
 * VERCEL_PROJECT_PRODUCTION_URL foi REMOVIDO da cascata: ele retorna o subdomínio
 * interno do projeto Vercel (`sysmax-2305.vercel.app`) que não é o link público
 * exposto a tutores em carteirinha de vacina, convites etc.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (
    configured &&
    configured.startsWith('https://') &&
    !configured.includes('localhost') &&
    (!configured.includes('vercel.app') || process.env.NEXT_PUBLIC_ALLOW_VERCEL_HOST === '1')
  ) {
    return stripTrailingSlash(configured)
  }
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
  if (
    configured &&
    configured.startsWith('https://') &&
    !configured.includes('localhost') &&
    (!configured.includes('vercel.app') || process.env.NEXT_PUBLIC_ALLOW_VERCEL_HOST === '1')
  ) {
    return stripTrailingSlash(configured)
  }
  // Em apps Capacitor, window.location.origin é o domínio remoto carregado
  // pelo WebView (sysvetmax.sysmaxsolutions.com), o que está correto.
  // No browser tradicional, segue o mesmo princípio.
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    // Exceto se for um subdomínio Vercel interno — força o canonical.
    if (!origin.includes('vercel.app')) return origin
  }
  return PRODUCTION_DOMAIN
}
