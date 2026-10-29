'use client'

import { useEffect, useRef } from 'react'

/**
 * Auto-refresh por polling. Chama `fn` a cada `intervalMs` (padrão 15s), pausando
 * quando a aba está oculta (não gasta rede em background). Usa ref para sempre
 * chamar a versão mais recente de `fn` sem reprogramar o intervalo.
 */
export function useAutoRefresh(fn: () => void, intervalMs = 15000): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const tick = () => { if (typeof document === 'undefined' || !document.hidden) ref.current() }
    const t = setInterval(tick, intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
}
