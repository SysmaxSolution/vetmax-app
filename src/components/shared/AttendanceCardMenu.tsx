'use client'

import { useState, useRef, useEffect } from 'react'
import { MoreVertical, XCircle } from 'lucide-react'
import CancelAttendanceModal from './CancelAttendanceModal'
import type { AttendanceEntity } from '@/lib/actions/attendance-cancel'

interface Props {
  entity:        AttendanceEntity
  id:            string
  patientName?:  string | null
  onCancelled?:  () => void
}

/**
 * Botão kebab (3 pontinhos) com ação "Cancelar Atendimento". Fica posicionado
 * no canto superior direito do card. Usa stopPropagation para não disparar o
 * <Link> do card e evita render server-side mismatch usando portal-free modal.
 */
export default function AttendanceCardMenu({ entity, id, patientName, onCancelled }: Props) {
  const [open, setOpen]     = useState(false)
  const [modal, setModal]   = useState(false)
  const wrapperRef          = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <>
      <div
        ref={wrapperRef}
        className="relative"
        onClick={e => { e.preventDefault(); e.stopPropagation() }}
      >
        <button
          type="button"
          aria-label="Mais ações"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-9 z-30 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
                setModal(true)
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Cancelar Atendimento
            </button>
          </div>
        )}
      </div>

      {modal && (
        <CancelAttendanceModal
          entity={entity}
          id={id}
          patientName={patientName ?? null}
          onClose={() => setModal(false)}
          onCancelled={onCancelled}
        />
      )}
    </>
  )
}
