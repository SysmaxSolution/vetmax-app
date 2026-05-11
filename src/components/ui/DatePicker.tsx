'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, X } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

const DAY_PICKER_CLASSES = {
  root:            'text-sm',
  months:          'flex flex-col',
  month:           'space-y-2',
  month_caption:   'flex justify-center pt-1 relative items-center',
  caption_label:   'text-sm font-semibold text-slate-900',
  nav:             'flex items-center gap-1',
  button_previous: 'absolute left-1 h-7 w-7 bg-transparent hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600',
  button_next:     'absolute right-1 h-7 w-7 bg-transparent hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600',
  weekdays:        'flex',
  weekday:         'text-slate-500 w-9 font-medium text-[0.8rem] text-center',
  week:            'flex mt-1',
  day:             'h-9 w-9 text-center text-sm relative flex items-center justify-center rounded-lg hover:bg-teal-50 transition-colors cursor-pointer',
  day_button:      'h-9 w-9 flex items-center justify-center rounded-lg',
  selected:        'bg-teal-600 text-white hover:bg-teal-700 font-semibold',
  today:           'font-bold text-teal-600',
  outside:         'text-slate-300',
  disabled:        'text-slate-300 cursor-not-allowed hover:bg-transparent',
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecionar data',
  min,
  max,
  required,
  disabled,
  className = '',
  id,
  name,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef   = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const displayValue = selectedDate && isValid(selectedDate)
    ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })
    : ''

  const minDate = min ? parse(min, 'yyyy-MM-dd', new Date()) : undefined
  const maxDate = max ? parse(max, 'yyyy-MM-dd', new Date()) : undefined

  function calcPosition() {
    if (!triggerRef.current) return
    const rect    = triggerRef.current.getBoundingClientRect()
    const vp      = window.visualViewport
    const vpH     = vp ? vp.height : window.innerHeight
    const vpW     = window.innerWidth
    const popupH  = popupRef.current?.offsetHeight ?? 300
    const popupW  = Math.min(popupRef.current?.offsetWidth ?? 280, vpW - 16)
    const below   = vpH - rect.bottom
    const above   = rect.top
    const openBelow = below >= popupH + 4 || below >= above
    const rawTop  = openBelow ? rect.bottom + 4 : rect.top - popupH - 4
    const top     = Math.max(8, Math.min(rawTop, vpH - popupH - 8))
    const rawLeft = rect.left
    const left    = Math.max(8, Math.min(rawLeft, vpW - popupW - 8))
    setPopupStyle({ position: 'fixed', top, left, maxWidth: vpW - 16, zIndex: 9999 })
  }

  useEffect(() => {
    if (!open) return
    calcPosition()
    function handleOutside(e: Event) {
      const target = (e as PointerEvent).target as Node
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleScroll() { setOpen(false) }
    function handleResize() { calcPosition() }
    document.addEventListener('pointerdown', handleOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [open])

  function handleSelect(date: Date | undefined) {
    if (date) onChange(format(date, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 w-full rounded-xl border px-3 py-2.5 text-sm text-left transition-all
          ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300 hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 cursor-pointer'}
          ${!displayValue ? 'text-slate-400' : 'text-slate-900'}
        `}
      >
        <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <span className="flex-1 truncate">{displayValue || placeholder}</span>
        {value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && !disabled && typeof window !== 'undefined' && createPortal(
        <div ref={popupRef} style={popupStyle} className="rounded-xl border border-slate-200 bg-white shadow-xl p-3 animate-in fade-in duration-150">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate || new Date()}
            locale={ptBR}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={DAY_PICKER_CLASSES}
            required={required}
          />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── DateInput — digitação manual DD/MM/AAAA + calendário opcional ───────────

interface DateInputProps {
  value: string           // ISO yyyy-MM-dd (ou '' vazio)
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

/** Aplica máscara DD/MM/AAAA enquanto o usuário digita. */
function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** Converte DD/MM/AAAA → yyyy-MM-dd; retorna '' se inválida. */
function parseBrToIso(br: string): string {
  const parts = br.split('/')
  if (parts.length !== 3) return ''
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy || yyyy.length < 4) return ''
  const d = new Date(`${yyyy}-${mm}-${dd}`)
  if (!isValid(d)) return ''
  return format(d, 'yyyy-MM-dd')
}

export function DateInput({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  min,
  max,
  required,
  disabled,
  className = '',
  id,
  name,
}: DateInputProps) {
  const isoToDisplay = (iso: string) => {
    if (!iso) return ''
    const d = parse(iso, 'yyyy-MM-dd', new Date())
    return isValid(d) ? format(d, 'dd/MM/yyyy') : ''
  }

  const [inputVal, setInputVal] = useState(isoToDisplay(value))
  const [open, setOpen]         = useState(false)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const wrapperRef = useRef<HTMLDivElement>(null)
  const calBtnRef  = useRef<HTMLButtonElement>(null)
  const popupRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { setInputVal(isoToDisplay(value)) }, [value])

  function calcPosition() {
    const anchor = wrapperRef.current || calBtnRef.current
    if (!anchor) return
    const rect   = anchor.getBoundingClientRect()
    const vp     = window.visualViewport
    const vpH    = vp ? vp.height : window.innerHeight
    const vpW    = window.innerWidth
    const popupH = popupRef.current?.offsetHeight ?? 300
    const popupW = Math.min(popupRef.current?.offsetWidth ?? 280, vpW - 16)
    const below  = vpH - rect.bottom
    const above  = rect.top
    const openBelow = below >= popupH + 4 || below >= above
    const rawTop = openBelow ? rect.bottom + 4 : rect.top - popupH - 4
    const top    = Math.max(8, Math.min(rawTop, vpH - popupH - 8))
    // alinha borda direita do popup com borda direita do container
    const rawLeft = rect.right - popupW
    const left   = Math.max(8, Math.min(rawLeft, vpW - popupW - 8))
    setPopupStyle({ position: 'fixed', top, left, maxWidth: vpW - 16, zIndex: 9999 })
  }

  useEffect(() => {
    if (!open) return
    calcPosition()
    function handleOutside(e: Event) {
      const target = (e as PointerEvent).target as Node
      if (calBtnRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleScroll() { setOpen(false) }
    function handleResize() { calcPosition() }
    document.addEventListener('pointerdown', handleOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [open])

  const minDate = min ? parse(min, 'yyyy-MM-dd', new Date()) : undefined
  const maxDate = max ? parse(max, 'yyyy-MM-dd', new Date()) : undefined
  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = applyDateMask(e.target.value)
    setInputVal(masked)
    if (masked.length === 10) {
      const iso = parseBrToIso(masked)
      if (iso) onChange(iso)
    } else if (masked.length === 0) {
      onChange('')
    }
  }

  function handleSelect(date: Date | undefined) {
    if (date) {
      const iso = format(date, 'yyyy-MM-dd')
      onChange(iso)
      setInputVal(format(date, 'dd/MM/yyyy'))
    }
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <div ref={wrapperRef} className="flex items-center gap-1">
        <input
          type="text"
          id={id}
          value={inputVal}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          inputMode="numeric"
          maxLength={10}
          className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 ${
            disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white border-slate-300 text-slate-900 hover:border-teal-400'
          }`}
        />
        <button
          ref={calBtnRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className="shrink-0 p-2.5 rounded-xl border border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50 transition-colors disabled:opacity-50"
          title="Abrir calendário"
        >
          <Calendar className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {open && !disabled && typeof window !== 'undefined' && createPortal(
        <div ref={popupRef} style={popupStyle} className="rounded-xl border border-slate-200 bg-white shadow-xl p-3 animate-in fade-in duration-150">
          <DayPicker
            mode="single"
            selected={isValid(selectedDate) ? selectedDate : undefined}
            onSelect={handleSelect}
            defaultMonth={isValid(selectedDate) ? selectedDate : new Date()}
            locale={ptBR}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={DAY_PICKER_CLASSES}
          />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── TimePicker (simple input for time) ──────────────────────────────────────

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

export function TimePicker({ value, onChange, disabled, className = '', id, name }: TimePickerProps) {
  const [raw, setRaw] = useState(value || '09:00')
  useEffect(() => { setRaw(value || '09:00') }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
    let masked = digits
    if (digits.length > 2) masked = `${digits.slice(0, 2)}:${digits.slice(2)}`
    setRaw(masked)
    if (masked.length === 5) {
      const hh = parseInt(masked.slice(0, 2))
      const mm = parseInt(masked.slice(3, 5))
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) onChange(masked)
    }
  }

  function handleBlur() {
    const parts = raw.split(':')
    if (parts.length === 2 && parts[0].length === 2 && parts[1].length === 2) return
    setRaw(value || '09:00')
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <input
        id={id}
        type="text"
        value={raw}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="HH:MM"
        maxLength={5}
        inputMode="numeric"
        className={`rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 text-center font-mono focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
      />
    </>
  )
}

// ─── DateTimePicker (date + time combined) ───────────────────────────────────

interface DateTimePickerProps {
  value: string  // ISO datetime string e.g. "2025-05-03T14:30"
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Selecionar data e hora',
  disabled,
  className = '',
  id,
  name,
}: DateTimePickerProps) {
  const datePart = value ? value.split('T')[0] : ''
  const timePart = value ? (value.split('T')[1] ?? '08:00') : '08:00'

  function handleDateChange(newDate: string) {
    if (newDate) {
      onChange(`${newDate}T${timePart}`)
    } else {
      onChange('')
    }
  }

  function handleTimeChange(newTime: string) {
    if (datePart) {
      onChange(`${datePart}T${newTime}`)
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <DatePicker
        id={id}
        value={datePart}
        onChange={handleDateChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
      {datePart && (
        <TimePicker
          value={timePart}
          onChange={handleTimeChange}
          disabled={disabled}
          className="w-28"
        />
      )}
    </div>
  )
}
