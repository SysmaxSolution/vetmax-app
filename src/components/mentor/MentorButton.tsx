'use client'

import { useState, useEffect, useRef } from 'react'
import { X, HelpCircle } from 'lucide-react'

const IDLE_MS = 30_000

export function MentorButton() {
  const [open,       setOpen]       = useState(false)
  const [idleBubble, setIdleBubble] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function resetTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setIdleBubble(true), IDLE_MS)
  }

  function clearBubble() {
    setIdleBubble(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  useEffect(() => {
    const events = ['scroll', 'click', 'touchstart', 'mousemove', 'keydown'] as const
    const handler = () => {
      setIdleBubble(false)
      resetTimer()
    }
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function handleToggle() {
    setOpen(v => !v)
    clearBubble()
    resetTimer()
  }

  return (
    <>
      {/* Botão flutuante + balão de idle */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-2">

        {/* Balão de inatividade */}
        {idleBubble && !open && (
          <div className="relative flex items-start gap-2 rounded-2xl bg-blue-600 text-white text-xs font-medium px-3 py-2.5 shadow-xl max-w-[220px] animate-fade-in">
            <span className="leading-relaxed">Precisa de ajuda? Estou aqui para orientar!</span>
            <button
              onClick={clearBubble}
              aria-label="Fechar"
              className="shrink-0 mt-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Cauda do balão apontando para baixo */}
            <span className="absolute -bottom-[7px] right-6 h-3.5 w-3.5 rotate-45 bg-blue-600 rounded-sm" />
          </div>
        )}

        {/* Botão principal */}
        <button
          onClick={handleToggle}
          aria-label="Modo Mentor — ajuda guiada"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all duration-150"
        >
          {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
        </button>
      </div>

      {/* Painel popover */}
      {open && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-[288px] sm:w-72 rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <HelpCircle className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Modo Mentor</p>
              <p className="text-xs text-slate-500">Tour guiado passo a passo</p>
            </div>
          </div>

          <div className="px-4 py-3 space-y-2">
            <p className="text-xs text-slate-600 leading-relaxed">
              Explore cada fluxo clínico com orientações contextuais.
              Selecione um módulo para iniciar:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MENTOR_TOPICS.map(t => (
                <button
                  key={t.href}
                  onClick={() => { window.location.href = t.href; setOpen(false) }}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 px-4 py-2.5">
            <p className="text-[10px] text-slate-400 text-center">
              Modo Mentor — SysVetMax by Sysmax Solutions
            </p>
          </div>
        </div>
      )}
    </>
  )
}

const MENTOR_TOPICS = [
  { label: 'Recepção',     href: '/dashboard/reception' },
  { label: 'Triagem',      href: '/dashboard/triage' },
  { label: 'Consultório',  href: '/dashboard/vet' },
  { label: 'Exames',       href: '/dashboard/exams' },
  { label: 'Internação',   href: '/dashboard/hospitalization' },
  { label: 'Estoque',      href: '/dashboard/pharmacy' },
  { label: 'Banho e Tosa', href: '/dashboard/grooming' },
  { label: 'Gestão',       href: '/dashboard/management' },
]
