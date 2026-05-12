// instrumentation.ts — substitui Vercel Log Drains (plano Pro)
// onRequestError captura TODOS os erros server-side automaticamente:
// API Routes, Server Components, Server Actions, Middleware.

export function register() {
  // Ponto de inicialização do servidor — sem necessidade de setup extra
}

export async function onRequestError(
  err: unknown,
  request: {
    path:    string
    method:  string
    headers: Record<string, string>
  },
  context: {
    routePath:    string
    routerKind:   string  // 'App Router' | 'Pages Router'
    renderSource?: string
  }
) {
  // Ignora erros de rotas internas do Next.js e assets estáticos
  const path = context.routePath ?? request.path ?? ''
  if (
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/icon')
  ) return

  const error = err instanceof Error ? err : new Error(String(err))

  // Ignora erros de cancelamento de fetch/navegação (não são falhas reais)
  if (
    error.message.includes('NEXT_REDIRECT') ||
    error.message.includes('NEXT_NOT_FOUND') ||
    error.message.includes('AbortError')
  ) return

  try {
    const { logServerError } = await import('@/lib/error-logger')

    await logServerError({
      path,
      errorMessage: error.message,
      stackTrace:   error.stack,
      source:       'server',
      module:       inferModule(path),
    })
  } catch (loggingErr) {
    // Nunca deixar o logger derrubar a requisição
    console.error('[instrumentation] Falha ao registrar erro:', loggingErr)
  }
}

function inferModule(path: string): string | null {
  if (path.includes('/reception'))       return 'reception'
  if (path.includes('/triage'))          return 'triage'
  if (path.includes('/vet'))             return 'vet'
  if (path.includes('/exams'))           return 'exams'
  if (path.includes('/pharmacy'))        return 'pharmacy'
  if (path.includes('/hospitalization')) return 'hospitalization'
  if (path.includes('/grooming'))        return 'grooming'
  if (path.includes('/cashier'))         return 'cashier'
  if (path.includes('/management'))      return 'management'
  if (path.includes('/patients'))        return 'patients'
  if (path.includes('/mentor'))          return 'mentor'
  if (path.includes('/whatsapp'))        return 'whatsapp'
  if (path.includes('/api'))             return 'api'
  return null
}
