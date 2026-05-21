'use client'

import { useEffect, useRef } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// useNativeKeepAwake
//
// Impede que o celular bloqueie a tela enquanto `active === true`.
//
// Em apps Capacitor nativos: usa @capacitor-community/keep-awake (WAKE_LOCK
// no Android e UIApplication.shared.isIdleTimerDisabled no iOS).
//
// No browser: cai para a Wake Lock API (navigator.wakeLock) quando disponível.
// Em browsers sem suporte (Safari iOS < 16.4), vira no-op silencioso — o
// veterinário continua usando, só perde o keep-awake.
// ──────────────────────────────────────────────────────────────────────────────

export function useNativeKeepAwake(active: boolean) {
  // Sentinel da Wake Lock API (browser).
  const sentinelRef = useRef<any>(null)
  // Flag que indica que o keep-awake do plugin Capacitor está ativo, para
  // não emitir release() duplicado em remount/StrictMode.
  const capacitorActiveRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function acquire() {
      // 1) Tenta Capacitor primeiro (apps nativos).
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (Capacitor.isNativePlatform()) {
          const { KeepAwake } = await import('@capacitor-community/keep-awake')
          await KeepAwake.keepAwake()
          if (!cancelled) capacitorActiveRef.current = true
          return
        }
      } catch {
        // Falha silenciosa — cai para browser.
      }

      // 2) Browser — Wake Lock API.
      try {
        const wl: any = (navigator as any).wakeLock
        if (wl?.request) {
          const sentinel = await wl.request('screen')
          if (cancelled) {
            try { await sentinel.release() } catch {}
            return
          }
          sentinelRef.current = sentinel
        }
      } catch {
        // Browser sem suporte ou denied — no-op.
      }
    }

    async function release() {
      if (capacitorActiveRef.current) {
        try {
          const { KeepAwake } = await import('@capacitor-community/keep-awake')
          await KeepAwake.allowSleep()
        } catch {}
        capacitorActiveRef.current = false
      }
      if (sentinelRef.current) {
        try { await sentinelRef.current.release() } catch {}
        sentinelRef.current = null
      }
    }

    if (active) acquire()
    else release()

    // O wake lock é perdido se o usuário voltar para o app após segundo plano;
    // re-adquire em visibilitychange. Isso é o comportamento recomendado pela
    // própria spec da Wake Lock API.
    function onVisibility() {
      if (active && document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active])
}
