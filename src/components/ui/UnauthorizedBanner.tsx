'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShieldX } from 'lucide-react'

/**
 * Exibe um banner de "Acesso negado" quando a URL contém ?error=unauthorized.
 * Usado nos workspaces principais para feedback após redirect do middleware RBAC.
 * Desaparece após 5 segundos.
 */
export function UnauthorizedBanner() {
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 5_000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  if (!visible) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <ShieldX className="h-5 w-5 flex-shrink-0 text-rose-600" />
      <div>
        <p className="text-sm font-semibold text-rose-800">Acesso negado</p>
        <p className="text-xs text-rose-600">
          Seu perfil não tem permissão para acessar essa área.
        </p>
      </div>
    </div>
  )
}
