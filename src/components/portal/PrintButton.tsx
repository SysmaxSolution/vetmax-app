'use client'

import { Printer } from 'lucide-react'

export default function PrintButton({ label = 'Imprimir / Salvar PDF', className }: { label?: string; className?: string }) {
  return (
    <button onClick={() => window.print()}
      className={className ?? 'inline-flex items-center gap-2 rounded-full bg-[var(--pt-primary-dark)] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[var(--pt-primary-mid)] print:hidden'}>
      <Printer className="h-4 w-4" />{label}
    </button>
  )
}
