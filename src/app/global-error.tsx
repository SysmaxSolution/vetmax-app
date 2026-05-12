'use client'

import { useEffect } from 'react'
import { logClientError } from '@/lib/actions/error-logs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logClientError({
      path:          window.location.pathname,
      error_message: error.message,
      stack_trace:   error.stack,
      severity:      'critical',
      module:        'layout',
    }).catch(() => {/* silencioso */})
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900">Algo deu errado</h1>
          <p className="text-sm text-slate-500">
            Ocorreu um erro inesperado. Nossa equipe já foi notificada automaticamente.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-slate-400">ID: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
