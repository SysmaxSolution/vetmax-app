'use client'

// ──────────────────────────────────────────────────────────────────────────────
// SysVetMax — Adaptador de runtime Capacitor.
//
// Centraliza a detecção de plataforma. Em browser puro, todas as funções caem
// para no-op silencioso (não exigem o pacote Capacitor importado dinamicamente).
//
// IMPORTANTE: nunca importe @capacitor/* no topo deste arquivo. O bundle do
// Next.js no servidor não consegue resolver módulos nativos. Use dynamic
// import() dentro das funções.
// ──────────────────────────────────────────────────────────────────────────────

export type NativePlatform = 'web' | 'android' | 'ios'

let cachedPlatform: NativePlatform | null = null

/**
 * Detecta a plataforma de execução. Resultado é cacheado após primeira chamada.
 * Em SSR retorna sempre 'web' (não há `window`).
 */
export async function getPlatform(): Promise<NativePlatform> {
  if (typeof window === 'undefined') return 'web'
  if (cachedPlatform) return cachedPlatform
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform()
      cachedPlatform = p === 'ios' ? 'ios' : 'android'
    } else {
      cachedPlatform = 'web'
    }
  } catch {
    cachedPlatform = 'web'
  }
  return cachedPlatform
}

/** Versão síncrona — útil em renderização React após o primeiro await. */
export function getCachedPlatform(): NativePlatform {
  return cachedPlatform ?? 'web'
}

export async function isNative(): Promise<boolean> {
  return (await getPlatform()) !== 'web'
}
