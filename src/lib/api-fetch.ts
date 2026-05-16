'use client'

import { logClientError } from '@/lib/actions/error-logs'

/**
 * Substitui `fetch()` para chamadas de API internas.
 * Quando a resposta não é 2xx, loga automaticamente no monitor de erros
 * antes de retornar a resposta ao chamador — sem bloquear o fluxo.
 */
export async function apiFetch(
  url: string,
  options?: RequestInit & { module?: string }
): Promise<Response> {
  const { module, ...fetchOptions } = options ?? {}
  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`
    try {
      const body = await response.clone().json()
      if (typeof body?.error === 'string') errorMessage = body.error
    } catch { /* body não é JSON */ }

    logClientError({
      path:          url,
      error_message: errorMessage,
      severity:      response.status >= 500 ? 'error' : 'warning',
      module,
    }).catch(() => { /* silencioso — nunca derrubar o fluxo principal */ })
  }

  return response
}
