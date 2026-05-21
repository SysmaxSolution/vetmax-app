'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { shareAny } from '@/lib/capacitor/share'

type Variant = 'primary' | 'ghost' | 'icon-only'

interface Props {
  title?: string
  text?:  string
  url?:   string
  files?: string[]
  label?: string
  variant?: Variant
  className?: string
}

/**
 * Botão "Compartilhar" universal:
 *  - Em apps Capacitor → abre Share Sheet nativo (iOS) ou Intent.ACTION_SEND (Android).
 *  - Em browser com Web Share API → chama navigator.share.
 *  - Fallback → wa.me/?text=... ou clipboard.
 */
export function ShareButton({
  title, text, url, files,
  label = 'Compartilhar',
  variant = 'ghost',
  className = '',
}: Props) {
  const [feedback, setFeedback] = useState<null | 'success' | 'cancelled' | 'error'>(null)

  async function handleClick() {
    const result = await shareAny({ title, text, url, files, dialogTitle: title })
    if (result.ok) {
      setFeedback('success')
    } else if (result.reason === 'cancelled') {
      setFeedback('cancelled')
    } else {
      setFeedback('error')
    }
    setTimeout(() => setFeedback(null), 2000)
  }

  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all active:scale-95'
  const styles: Record<Variant, string> = {
    primary:    `${base} px-4 py-2.5 bg-teal-600 text-white hover:bg-teal-700 shadow-sm`,
    ghost:      `${base} px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200`,
    'icon-only':`${base} h-10 w-10 bg-slate-100 text-slate-700 hover:bg-slate-200`,
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${styles[variant]} ${className}`}
      aria-label={label}
      title={label}
    >
      {feedback === 'success' ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {variant !== 'icon-only' && (
        <span>
          {feedback === 'success'   ? 'Compartilhado!' :
           feedback === 'cancelled' ? 'Cancelado' :
           feedback === 'error'     ? 'Erro' :
           label}
        </span>
      )}
    </button>
  )
}
