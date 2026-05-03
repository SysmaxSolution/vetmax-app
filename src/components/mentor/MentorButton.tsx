'use client'

import { useState } from 'react'
import { X, HelpCircle } from 'lucide-react'

/**
 * Botão flutuante "?" do Modo Mentor.
 * Aparece no canto inferior direito em todas as telas do dashboard
 * quando o módulo 'mentor' está ativo na clínica.
 */
export function MentorButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Modo Mentor — ajuda guiada"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all duration-150"
      >
        {open
          ? <X className="h-5 w-5" />
          : <HelpCircle className="h-5 w-5" />}
      </button>

      {/* Popover panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
              Modo Mentor — VetMax by Sysmax Solutions
            </p>
          </div>
        </div>
      )}
    </>
  )
}

const MENTOR_TOPICS = [
  { label: 'Recepção',   href: '/dashboard/reception' },
  { label: 'Triagem',    href: '/dashboard/triage' },
  { label: 'Consultório', href: '/dashboard/vet' },
  { label: 'Exames',     href: '/dashboard/exams' },
  { label: 'Internação', href: '/dashboard/hospitalization' },
  { label: 'Estoque',    href: '/dashboard/pharmacy' },
  { label: 'Banho e Tosa', href: '/dashboard/grooming' },
  { label: 'Gestão',     href: '/dashboard/management' },
]
