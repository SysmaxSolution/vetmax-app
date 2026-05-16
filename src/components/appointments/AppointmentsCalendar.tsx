'use client'

import { useState, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, type View, type SlotInfo } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { getUnifiedEventsForRange, type UnifiedCalendarEvent } from '@/lib/actions/calendar'
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2 } from 'lucide-react'

// ─── Localizer pt-BR ──────────────────────────────────────────────────────────

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales: { 'pt-BR': ptBR },
})

// ─── Mapeamento de cores ──────────────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  consultation: '#2563eb',
  follow_up:    '#6366f1',
  vaccination:  '#16a34a',
  surgery:      '#dc2626',
  exam:         '#7c3aed',
  emergency:    '#ea580c',
  grooming:     '#0d9488',
}

function eventColor(evt: UnifiedCalendarEvent): string {
  if (evt.type === 'grooming') return REASON_COLORS.grooming
  return REASON_COLORS[evt.reason ?? ''] ?? '#2563eb'
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RBCEvent {
  id:       string
  title:    string
  start:    Date
  end:      Date
  resource: UnifiedCalendarEvent
}

function toRBCEvents(raw: UnifiedCalendarEvent[]): RBCEvent[] {
  return raw.map(e => {
    const start = new Date(e.datetime.replace(' ', 'T'))
    // appointment = 30 min, grooming = 2 h
    const durationMs = e.type === 'grooming' ? 2 * 60 * 60 * 1000 : 30 * 60 * 1000
    return {
      id:       e.id,
      title:    `${e.petName} — ${e.type === 'grooming' ? 'B&T' : e.reason ?? 'Consulta'}`,
      start,
      end:      new Date(start.getTime() + durationMs),
      resource: e,
    }
  })
}

const MESSAGES = {
  allDay:     'Dia todo',
  previous:   '‹ Anterior',
  next:       'Próximo ›',
  today:      'Hoje',
  month:      'Mês',
  week:       'Semana',
  day:        'Dia',
  agenda:     'Agenda',
  date:       'Data',
  time:       'Hora',
  event:      'Evento',
  showMore:   (n: number) => `+${n} mais`,
  noEventsInRange: 'Sem eventos neste período',
}

// ─── Props do componente ──────────────────────────────────────────────────────

interface Props {
  initialEvents: UnifiedCalendarEvent[]
  initialDate:   Date
}

export default function AppointmentsCalendar({ initialEvents, initialDate }: Props) {
  const [events,    setEvents]    = useState<RBCEvent[]>(toRBCEvents(initialEvents))
  const [view,      setView]      = useState<View>('month')
  const [date,      setDate]      = useState(initialDate)
  const [loading,   setLoading]   = useState(false)
  const [selected,  setSelected]  = useState<UnifiedCalendarEvent | null>(null)

  const fetchRange = useCallback(async (newDate: Date, newView: View) => {
    setLoading(true)
    let start: Date, end: Date
    if (newView === 'month') {
      start = startOfMonth(newDate)
      end   = endOfMonth(newDate)
    } else if (newView === 'week') {
      start = startOfWeek(newDate, { locale: ptBR })
      end   = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
    } else {
      start = newDate
      end   = newDate
    }

    const result = await getUnifiedEventsForRange(
      format(start, 'yyyy-MM-dd'),
      format(end,   'yyyy-MM-dd'),
    )
    if (!('error' in result)) setEvents(toRBCEvents(result))
    setLoading(false)
  }, [])

  function handleNavigate(newDate: Date) {
    setDate(newDate)
    fetchRange(newDate, view)
  }

  function handleView(newView: View) {
    setView(newView)
    fetchRange(date, newView)
  }

  function handleSelectEvent(evt: RBCEvent) {
    setSelected(evt.resource)
  }

  function handleSelectSlot(_slot: SlotInfo) {
    setSelected(null)
  }

  const eventPropGetter = (evt: RBCEvent) => ({
    style: {
      backgroundColor: eventColor(evt.resource),
      borderRadius:    '6px',
      border:          'none',
      color:           '#fff',
      fontSize:        '12px',
      fontWeight:      600,
      padding:         '2px 6px',
    },
  })

  return (
    <div className="space-y-4">
      {/* Legenda de cores */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: 'Consulta',     color: '#2563eb' },
          { label: 'Vacinação',    color: '#16a34a' },
          { label: 'Cirurgia',     color: '#dc2626' },
          { label: 'Exame',        color: '#7c3aed' },
          { label: 'Emergência',   color: '#ea580c' },
          { label: 'Banho & Tosa', color: '#0d9488' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 ml-2" />}
      </div>

      {/* Calendário */}
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        style={{ height: 680 }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={handleView}
          onNavigate={handleNavigate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventPropGetter}
          messages={MESSAGES}
          culture="pt-BR"
          style={{ height: '100%', fontFamily: 'inherit' }}
          popup
          showAllEvents
        />
      </div>

      {/* Painel lateral de detalhe do evento */}
      {selected && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900 text-base">{selected.petName}</p>
              <p className="text-sm text-slate-500 mt-0.5">Tutor: {selected.tutorName}</p>
            </div>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
              style={{ backgroundColor: eventColor(selected) }}
            >
              {selected.type === 'grooming' ? 'Banho & Tosa' : selected.reason ?? 'Consulta'}
            </span>
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-medium">Horário:</span> {format(new Date(selected.datetime.replace(' ', 'T')), "dd/MM/yyyy 'às' HH:mm")}</p>
            <p><span className="font-medium">Status:</span> {selected.status}</p>
            {selected.services && selected.services.length > 0 && (
              <p><span className="font-medium">Serviços:</span> {selected.services.join(', ')}</p>
            )}
          </div>
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-slate-400 hover:text-slate-600 mt-2"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
