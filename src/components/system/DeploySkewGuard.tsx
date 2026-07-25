'use client'

import { useEffect } from 'react'

/**
 * Recupera abas que ficaram com build antigo após um deploy (skew).
 *
 * Sintoma em produção: aba aberta há horas → deploy novo no Vercel → qualquer
 * server action dispara POST com um action-id que não existe mais no build
 * atual → a promise rejeita ("Failed to find Server Action ..."), o estado de
 * loading da tela nunca reseta e o router fica preso atrás da action pendente.
 * Para o usuário: spinner infinito e navegação morta (incidente Pacientes 24/07).
 *
 * Recarregar a página busca os chunks novos e resolve. Fazemos isso uma única
 * vez por minuto (guarda em sessionStorage) para nunca entrar em loop de reload
 * caso o erro tenha outra causa.
 */
const SKEW_PATTERNS = /failed to find server action|older or newer deployment|unexpected response from server action/i
const RELOAD_GUARD_KEY = 'vetmax_skew_reload_at'

function maybeReload(message: string) {
  if (!SKEW_PATTERNS.test(message)) return
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch { /* sessionStorage indisponível: recarrega mesmo assim */ }
  window.location.reload()
}

export default function DeploySkewGuard() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      maybeReload(String(e.reason?.message ?? e.reason ?? ''))
    }
    const onError = (e: ErrorEvent) => {
      maybeReload(e.message ?? '')
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
