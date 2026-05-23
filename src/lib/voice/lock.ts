/**
 * voiceLock — singleton de arbitragem do canal de microfone do navegador.
 *
 * O Chrome só permite uma instância de SpeechRecognition (web speech API) ativa
 * por aba; quando uma segunda chama `.start()`, a primeira é abortada e ambas
 * costumam entrar num loop aborted→restart que faz o ícone "piscar".
 *
 * Este módulo arbitra quem pode usar o motor por meio de uma pilha de owners
 * ordenada por prioridade:
 *
 *   10  — ambient (escuta contínua: useClinicalVoiceAssistant, useGroomingVoiceAssistant)
 *   50  — focused (modais e campos focados: useFocusedVoiceCapture)
 *   90  — exclusive (janelas curtas como o "sim/não" do WhatsAppNotificationModal)
 *
 * Política:
 *  - `acquire(owner)`: se a prioridade do owner ativo for MENOR que a do novo,
 *    o ativo recebe `onSuspend` (deve parar limpo, sem disparar onFinal) e o
 *    novo passa a ser ativo. Se for MAIOR, o novo entra na pilha em suspenso
 *    e só receberá `onResume` quando o atual liberar.
 *  - `release(id)`: remove da pilha. Se era o ativo, o próximo do topo recebe
 *    `onResume`.
 *
 * Cada owner deve:
 *  - Em `onSuspend`: parar o motor (`r.stop()` ou `MediaRecorder.stop()`) sem
 *    chamar callbacks finais; PAUSAR timers que possam disparar enquanto
 *    suspenso (ex.: silenceTimer de auto-save).
 *  - Em `onResume`: reabrir o motor mantendo o buffer interno, retomar timers.
 *
 * Singleton é módulo — sobrevive a StrictMode double-mount em dev.
 */

export type VoiceOwner = {
  id:        string
  priority:  number
  onSuspend: () => void
  onResume:  () => void
}

class VoiceLock {
  private stack: VoiceOwner[] = []

  /**
   * Adquire um slot no lock.
   *
   * Retorna `{ isActive, release }`:
   *  - `isActive=true`  → o owner é o topo da pilha e PODE iniciar o motor agora.
   *  - `isActive=false` → o owner entrou em estado suspenso (alguém com priority
   *    maior está ativo). Quando esse alguém liberar, este owner receberá
   *    `onResume` — só ali deve iniciar o motor.
   *
   * Importante: quando `isActive=false`, o caller NÃO deve chamar startEngine —
   * o motor só pode ser aberto via `onResume`. Iniciar fora dessa janela
   * recria a colisão que o lock evita.
   */
  acquire(owner: VoiceOwner): { isActive: boolean; release: () => void } {
    // remove versões anteriores do mesmo id (reidempotência)
    this.stack = this.stack.filter(o => o.id !== owner.id)

    const prevTop = this.currentInternal()
    this.stack.push(owner)
    // mantém o stack ordenado por priority ascendente; topo = último com maior priority
    this.stack.sort((a, b) => a.priority - b.priority)
    const newTop = this.currentInternal()
    const isActive = newTop?.id === owner.id

    if (prevTop && newTop && prevTop.id !== newTop.id) {
      // troca de owner ativo — quem estava no topo pausa
      try { prevTop.onSuspend() } catch { /* dono falhou ao pausar — segue o jogo */ }
    }

    return { isActive, release: () => this.release(owner.id) }
  }

  release(id: string): void {
    const wasTopBefore = this.currentInternal()?.id === id
    this.stack = this.stack.filter(o => o.id !== id)
    if (wasTopBefore) {
      const next = this.currentInternal()
      if (next) {
        try { next.onResume() } catch { /* idem */ }
      }
    }
  }

  /** Owner atualmente "vivo" (topo da pilha). */
  current(): VoiceOwner | null {
    return this.currentInternal()
  }

  /** Útil para debug/telemetria. */
  size(): number {
    return this.stack.length
  }

  private currentInternal(): VoiceOwner | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
  }
}

export const voiceLock = new VoiceLock()

// ─── Constantes de prioridade — use estes em vez de números mágicos. ────────
export const VOICE_PRIORITY = {
  AMBIENT:   10,
  FOCUSED:   50,
  EXCLUSIVE: 90,
} as const

// Helper estável: gera um id por instância de hook (chamada no mount).
export function generateVoiceOwnerId(prefix: string): string {
  const rand = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${rand}`
}
