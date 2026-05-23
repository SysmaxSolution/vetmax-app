/**
 * Tick singleton para o scheduler de medicação.
 *
 * Filosofia: UM setInterval por aba, qualquer quantidade de cards subscribers.
 * Em vez de cada `HospitalizationCard` rodar seu próprio `setInterval(15s)`, o
 * Kanban pode ter 20 cards subscritos no MESMO tick — economiza CPU/timers no
 * navegador.
 *
 * O tick acontece a cada `TICK_MS` (15s) E também:
 *  - quando `window` recupera conexão (`online` event)
 *  - quando a aba volta a ser visível (`visibilitychange`)
 *  - manualmente via `forceTick()` (ex.: após registrar uma dose)
 *
 * Tolerância offline: como o cálculo do hook usa `Date.now()` no momento do
 * render, qualquer "buraco" causado por sleep/standby/desconexão é
 * automaticamente corrigido no próximo tick — o relógio do sistema já reflete
 * o tempo real.
 */

const TICK_MS = 15_000

type Listener = () => void

const listeners = new Set<Listener>()
let intervalId: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let tickCounter = 0

function notifyAll() {
  tickCounter++
  // Cópia defensiva — ouvintes podem se cancelar durante o notify.
  const snapshot = Array.from(listeners)
  for (const l of snapshot) {
    try { l() } catch { /* listener com erro não pode derrubar o store */ }
  }
}

function ensureRunning() {
  if (intervalId !== null) return
  intervalId = setInterval(notifyAll, TICK_MS)
  if (typeof window !== 'undefined' && !onlineListenerAttached) {
    onlineListenerAttached = true
    window.addEventListener('online', notifyAll)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) notifyAll()
    })
  }
}

export const medicationTickStore = {
  /** Inscreve um listener. Devolve a função de unsubscribe (compatível com useSyncExternalStore). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    ensureRunning()
    return () => { listeners.delete(listener) }
  },

  /** Snapshot estável — incrementa a cada tick. Usado pelo useSyncExternalStore. */
  getSnapshot(): number {
    return tickCounter
  },

  /** Snapshot para SSR — sempre 0; o efeito real só acontece no client. */
  getServerSnapshot(): number {
    return 0
  },

  /** Força um tick imediato sem esperar o setInterval (útil após aplicar dose). */
  forceTick(): void {
    notifyAll()
  },
}
