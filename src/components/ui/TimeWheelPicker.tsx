'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Check, X } from 'lucide-react'

/**
 * Picker de horário estilo "rolante" (similar ao definidor de alarmes
 * iOS/Android). Renderiza duas colunas (HH e MM com passo de 5 min)
 * e devolve um string 'HH:MM' quando o usuário confirma.
 *
 * Quando aberto, posiciona o scroll pré-carregado com `initialValue`
 * para que o usuário possa apenas ajustar e confirmar.
 */

interface TimeWheelPickerProps {
  initialValue: string                                   // 'HH:MM'
  onCancel:     () => void
  onConfirm:    (value: string) => void
  /** lista de janelas já bloqueadas no formato 'HH:MM' → 'HH:MM' (start incl., end excl.) */
  blockedRanges?: Array<{ start: string; end: string }>
  /** Duração (em minutos) que o novo agendamento ocupará — para validar colisão. */
  durationMinutes?: number
  title?: string
}

const ITEM_HEIGHT  = 44   // px
const VISIBLE_ROWS = 5    // ímpar — item central é o selecionado
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')) // 00,05,...,55

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function Wheel({
  items, value, onChange,
}: {
  items: string[]
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Posiciona no item correto ao montar / quando value muda externamente
  useEffect(() => {
    const idx = items.indexOf(value)
    if (idx < 0 || !ref.current) return
    ref.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'instant' as ScrollBehavior })
  }, [value, items])

  function handleScroll() {
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_HEIGHT)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      const next = items[clamped]
      if (next && next !== value) onChange(next)
      // snap exato
      ref.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' })
    }, 110)
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory"
      style={{
        height:         WHEEL_HEIGHT,
        scrollSnapType: 'y mandatory',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0, black 30%, black 70%, transparent 100%)',
        maskImage:
          'linear-gradient(to bottom, transparent 0, black 30%, black 70%, transparent 100%)',
      }}
    >
      {/* Padding superior/inferior para permitir o item central encostar no marker */}
      <div style={{ height: ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2) }} />
      {items.map(it => (
        <div
          key={it}
          onClick={() => {
            const idx = items.indexOf(it)
            ref.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })
          }}
          className={`flex items-center justify-center font-mono text-2xl tabular-nums snap-center select-none transition-colors ${
            it === value ? 'text-teal-600 font-bold' : 'text-slate-400'
          }`}
          style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center', cursor: 'pointer' }}
        >
          {it}
        </div>
      ))}
      <div style={{ height: ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2) }} />
    </div>
  )
}

export default function TimeWheelPicker({
  initialValue, onCancel, onConfirm, blockedRanges = [], durationMinutes = 60, title = 'Escolher horário',
}: TimeWheelPickerProps) {
  // Garante que o valor inicial caia em um múltiplo de 5min existente no wheel
  function snapTo5(t: string): string {
    const [h, m] = t.split(':').map(Number)
    const rounded = Math.round((m ?? 0) / 5) * 5
    const fixed = rounded === 60 ? { h: (h + 1) % 24, m: 0 } : { h, m: rounded }
    return `${String(fixed.h).padStart(2, '0')}:${String(fixed.m).padStart(2, '0')}`
  }

  const initial = snapTo5(initialValue || '09:00')
  const [hh, setHh] = useState(initial.split(':')[0])
  const [mm, setMm] = useState(initial.split(':')[1])

  const value     = `${hh}:${mm}`
  const startMin  = toMinutes(value)
  const endMin    = startMin + durationMinutes
  const conflict  = blockedRanges.find(b =>
    rangesOverlap(startMin, endMin, toMinutes(b.start), toMinutes(b.end))
  )

  function handleConfirm() {
    if (conflict) return
    onConfirm(value)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/60 p-3"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-xs bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-teal-50/40">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wheels */}
        <div className="relative px-6 py-4">
          {/* Marker do item central */}
          <div
            className="pointer-events-none absolute left-3 right-3 rounded-xl border border-teal-200 bg-teal-50/30"
            style={{ top: `calc(50% - ${ITEM_HEIGHT / 2}px)`, height: ITEM_HEIGHT }}
          />
          <div className="flex items-center gap-2">
            <Wheel items={HOURS}   value={hh} onChange={setHh} />
            <div className="flex items-center justify-center font-mono text-2xl text-slate-400" style={{ height: WHEEL_HEIGHT }}>:</div>
            <Wheel items={MINUTES} value={mm} onChange={setMm} />
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Bloco: <span className="font-semibold text-slate-600">{value}</span> – {(() => {
              const end = startMin + durationMinutes
              return `${String(Math.floor((end / 60) % 24)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
            })()}
          </p>
          {conflict && (
            <p className="mt-2 text-center text-xs font-semibold text-rose-600">
              Conflito com agendamento das {conflict.start} – {conflict.end}.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!!conflict}
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
