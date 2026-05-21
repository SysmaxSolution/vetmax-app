'use client'

// ──────────────────────────────────────────────────────────────────────────────
// Adaptador de compartilhamento — Capacitor Share + Web Share API.
//
// Em apps nativos: usa @capacitor/share (Share Sheet do iOS, Intent Android).
// No browser:      usa navigator.share (Web Share API) quando disponível.
// Fallback final:  abre wa.me/?text=... (WhatsApp Web) ou copia o link.
// ──────────────────────────────────────────────────────────────────────────────

export type ShareTarget = {
  title?: string
  text?:  string
  url?:   string
  /** Caminho local OU URL pública de arquivo (para Share Sheet com anexo). */
  files?: string[]
  /** Diálogo do iOS — texto exibido (não usado no Android). */
  dialogTitle?: string
}

export type ShareResult =
  | { ok: true; channel: 'native' | 'web' | 'whatsapp' | 'clipboard' }
  | { ok: false; reason: string }

/**
 * Compartilha texto/link/arquivos via API disponível. Não joga erros — sempre
 * retorna ShareResult para a UI saber o que efetivamente ocorreu.
 */
export async function shareAny(target: ShareTarget): Promise<ShareResult> {
  // 1) Capacitor (nativo) — preferido em mobile
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share')
      const can = await Share.canShare()
      if (can.value) {
        await Share.share({
          title:       target.title,
          text:        target.text,
          url:         target.url,
          files:       target.files,
          dialogTitle: target.dialogTitle ?? target.title,
        })
        return { ok: true, channel: 'native' }
      }
    }
  } catch (err: any) {
    // Usuário cancelou ou erro do plugin — continua nos fallbacks.
    if (err?.message?.toLowerCase?.().includes('cancel')) {
      return { ok: false, reason: 'cancelled' }
    }
  }

  // 2) Web Share API (browsers modernos: Chrome Android, Safari iOS)
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({
        title: target.title,
        text:  target.text,
        url:   target.url,
      })
      return { ok: true, channel: 'web' }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' }
  }

  // 3) WhatsApp Web fallback — só funciona se houver texto/url
  if (target.url || target.text) {
    const msg = encodeURIComponent([target.text, target.url].filter(Boolean).join(' '))
    const waUrl = `https://wa.me/?text=${msg}`
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener')
      return { ok: true, channel: 'whatsapp' }
    }
  }

  // 4) Clipboard fallback — copia o que tiver
  try {
    const payload = [target.title, target.text, target.url].filter(Boolean).join('\n')
    if (payload && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload)
      return { ok: true, channel: 'clipboard' }
    }
  } catch { /* noop */ }

  return { ok: false, reason: 'no-channel-available' }
}

/**
 * Atalho específico para abrir o WhatsApp do usuário com texto/link prontos.
 * - Em mobile nativo, abre o app instalado via intent.
 * - Em web, abre wa.me/?text=... numa nova aba.
 */
export async function shareViaWhatsApp(opts: { text: string; phoneNumber?: string }) {
  const cleaned = (opts.phoneNumber ?? '').replace(/\D/g, '')
  const base    = cleaned ? `https://wa.me/${cleaned}` : 'https://wa.me/'
  const url     = `${base}?text=${encodeURIComponent(opts.text)}`
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener')
  }
}
