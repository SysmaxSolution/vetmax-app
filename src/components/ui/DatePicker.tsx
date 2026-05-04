'use client'

import { useState, useRef, useEffect } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const displayValue = selectedDate && isValid(selectedDate)
    ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })
    : ''

  const minDate = min ? parse(min, 'yyyy-MM-dd', new Date()) : undefined
  const maxDate = max ? parse(max, 'yyyy-MM-dd', new Date()) : undefined

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden input for form compatibility */}
      {name && <input type="hidden" name={name} value={value} />}

      <button
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

      {open && !disabled && (
        <div className="absolute z-[60] mt-1 rounded-xl border border-slate-200 bg-white shadow-lg p-3 animate-in fade-in slide-in-from-top-2 duration-150">
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
            classNames={{
              root:          'text-sm',
              months:        'flex flex-col',
              month:         'space-y-2',
              month_caption: 'flex justify-center pt-1 relative items-center',
              caption_label: 'text-sm font-semibold text-slate-900',
              nav:           'flex items-center gap-1',
              button_previous: 'absolute left-1 h-7 w-7 bg-transparent hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600',
              button_next:     'absolute right-1 h-7 w-7 bg-transparent hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600',
              weekdays:      'flex',
              weekday:       'text-slate-500 w-9 font-medium text-[0.8rem] text-center',
              week:          'flex mt-1',
              day:           'h-9 w-9 text-center text-sm relative flex items-center justify-center rounded-lg hover:bg-teal-50 transition-colors cursor-pointer',
              day_button:    'h-9 w-9 flex items-center justify-center rounded-lg',
              selected:      'bg-teal-600 text-white hover:bg-teal-700 font-semibold',
              today:         'font-bold text-teal-600',
              outside:       'text-slate-300',
              disabled:      'text-slate-300 cursor-not-allowed hover:bg-transparent',
            }}
            required={required}
          />
        </div>
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
  return (
    <input
      type="time"
      id={id}
      name={name}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
    />
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
