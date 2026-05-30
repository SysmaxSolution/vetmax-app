'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import OmnisearchPalette from './OmnisearchPalette'

/**
 * Botão no header que abre o command palette de busca universal. Atalho
 * global Ctrl/Cmd+K. Em mobile vira só o ícone (sem texto/atalho).
 */
export default function OmnisearchTrigger() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Busca universal (Ctrl/Cmd+K)"
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Buscar</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px] text-slate-500">
          Ctrl K
        </kbd>
      </button>
      <OmnisearchPalette open={open} onClose={() => setOpen(false)} />
    </>
  )
}
