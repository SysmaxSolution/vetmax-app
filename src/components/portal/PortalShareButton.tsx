'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

/** Copia um link (ex.: exame de imagem) para o tutor enviar ao veterinário dele. */
export default function PortalShareButton({ url, label = 'Compartilhar' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function share() {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && (nav as any).share) {
      (nav as any).share({ title: 'Exame do meu pet', url }).catch(() => {})
      return
    }
    nav?.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }
  return (
    <button onClick={share}
      className="text-xs font-medium text-[var(--pt-muted)] flex items-center gap-1 rounded-full border border-[var(--pt-border)] px-3 py-1.5 hover:border-[var(--pt-accent-ring)] whitespace-nowrap">
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--pt-primary)]" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : label}
    </button>
  )
}
