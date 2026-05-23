'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import {
  format, parse, startOfWeek, getDay,
  startOfMonth, endOfMonth, startOfDay, endOfDay, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { getUnifiedEventsForRange, type UnifiedCalendarEvent, type CalendarProfessional } from '@/lib/actions/calendar'
import { listUnavailabilitiesInRange, deleteUnavailability } from '@/lib/actions/unavailabilities'
import PatientLink from '@/components/PatientLink'
import UnavailabilityModal from '@/components/appointments/UnavailabilityModal'
import {
  ChevronLeft, ChevronRight, Loader2, X,
  Clock, User, Scissors, Stethoscope, CalendarOff, Trash2, MessageCircle,
} from 'lucide-react'

// ─── Localizer pt-BR ──────────────────────────────────────────────────────────

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales: { 'pt-BR': ptBR },
})

// ─── Constantes de estilo ─────────────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  consultation: '#2563eb',
  follow_up:    '#6366f1',
  vaccination:  '#16a34a',
  surgery:      '#dc2626',
  exam:         '#7c3aed',
  emergency:    '#ea580c',
  grooming:     '#0d9488',
}

const REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  vaccination:  'Vacinação',
  surgery:      'Cirurgia',
  exam:         'Exame',
  emergency:    'Emergência',
  grooming:     'Banho & Tosa',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  scheduled:       { label: 'Agendado',          cls: 'bg-blue-100 text-blue-700' },
  confirmed:       { label: 'Confirmado',         cls: 'bg-teal-100 text-teal-700' },
  arrived:         { label: 'Em Atendimento',     cls: 'bg-amber-100 text-amber-700' },
  completed:       { label: 'Concluído',          cls: 'bg-green-100 text-green-700' },
  cancelled:       { label: 'Cancelado',          cls: 'bg-red-100 text-red-700' },
  received:        { label: 'Recebido',           cls: 'bg-slate-100 text-slate-600' },
  bathing:         { label: 'Banho',              cls: 'bg-blue-100 text-blue-700' },
  grooming_status: { label: 'Tosa',               cls: 'bg-indigo-100 text-indigo-700' },
  waiting_pickup:  { label: 'Aguard. Retirada',   cls: 'bg-amber-100 text-amber-700' },
  delivered:       { label: 'Entregue',           cls: 'bg-green-100 text-green-700' },
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  vet:     <Stethoscope className="h-3 w-3" />,
  groomer: <Scissors className="h-3 w-3" />,
}

const COLOR_LEGEND = [
  { label: 'Consulta',     color: '#2563eb' },
  { label: 'Vacinação',    color: '#16a34a' },
  { label: 'Cirurgia',     color: '#dc2626' },
  { label: 'Exame',        color: '#7c3aed' },
  { label: 'Emergência',   color: '#ea580c' },
  { label: 'Banho & Tosa', color: '#0d9488' },
]

const UNASSIGNED_ID = '__unassigned__'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventColor(e: UnifiedCalendarEvent): string {
  if (e.type === 'grooming') return REASON_COLORS.grooming
  return REASON_COLORS[e.reason ?? ''] ?? '#2563eb'
}

function serviceLabel(e: UnifiedCalendarEvent): string {
  if (e.type === 'grooming' && e.services && e.services.length > 0) return e.services.join(', ')
  if (e.type === 'grooming') return 'Banho & Tosa'
  return REASON_LABELS[e.reason ?? ''] ?? e.reason ?? 'Consulta'
}

// ─── RBC Event shape ──────────────────────────────────────────────────────────

interface UnavailabilityOccurrence {
  id:                string
  base_id:           string
  professional_id:   string
  professional_name: string | null
  title:             string | null
  notes:             string | null
  starts_at:         string
  ends_at:           string
  recurrence:        'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
}

type RBCEvent =
  | {
      kind:        'appointment'
      id:          string
      title:       string
      start:       Date
      end:         Date
      resourceId:  string
      resource:    UnifiedCalendarEvent
    }
  | {
      kind:        'unavailability'
      id:          string
      title:       string
      start:       Date
      end:         Date
      resourceId:  string
      resource:    UnavailabilityOccurrence
    }

function toRBCEvents(raw: UnifiedCalendarEvent[]): RBCEvent[] {
  return raw.map(e => {
    const start      = new Date(e.datetime.replace(' ', 'T'))
    const durationMs = (e.durationMinutes ?? (e.type === 'grooming' ? 120 : 60)) * 60000
    return {
      kind:       'appointment' as const,
      id:         e.id,
      title:      `${e.petName} — ${serviceLabel(e)}`,
      start,
      end:        new Date(start.getTime() + durationMs),
      resourceId: e.professionalId ?? UNASSIGNED_ID,
      resource:   e,
    }
  })
}

function toRBCUnavailabilities(raw: UnavailabilityOccurrence[]): RBCEvent[] {
  return raw.map(u => ({
    kind:       'unavailability' as const,
    id:         u.id,
    title:      `🚫 ${u.title ?? 'Indisponível'}`,
    start:      new Date(u.starts_at),
    end:        new Date(u.ends_at),
    resourceId: u.professional_id,
    resource:   u,
  }))
}

// ─── Toolbar customizada ──────────────────────────────────────────────────────

interface ToolbarProps {
  date:        Date
  view:        View
  onNavigate:  (action: 'PREV' | 'NEXT' | 'TODAY') => void
  onView:      (view: View) => void
  loading:     boolean
  onNewEvent:  () => void
}

function CustomToolbar({ date, view, onNavigate, onView, loading, onNewEvent }: ToolbarProps) {
  const label = useMemo(() => {
    if (view === 'month') return format(date, 'MMMM yyyy', { locale: ptBR })
    if (view === 'week') {
      const ws = startOfWeek(date, { locale: ptBR })
      const we = addDays(ws, 6)
      return `${format(ws, 'dd MMM', { locale: ptBR })} – ${format(we, "dd MMM yyyy", { locale: ptBR })}`
    }
    return format(date, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })
  }, [date, view])

  const VIEWS: { key: View; label: string }[] = [
    { key: 'day',   label: 'Dia' },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mês' },
  ]

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
      {/* Navegação de data */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('PREV')}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onNavigate('TODAY')}
          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
        >
          Hoje
        </button>
        <button
          onClick={() => onNavigate('NEXT')}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold text-slate-800 ml-1 capitalize">{label}</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      <div className="flex items-center gap-2">
        {/* Botão Evento */}
        <button
          onClick={onNewEvent}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-sm transition-colors"
          title="Bloquear horários do profissional"
        >
          <CalendarOff className="h-3.5 w-3.5" />
          Evento
        </button>

        {/* Seletor de vista */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 text-xs font-semibold">
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              onClick={() => onView(v.key)}
              className={`px-4 py-2 transition-all ${i > 0 ? 'border-l border-slate-200' : ''} ${
                view === v.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {v.label}
              {v.key === 'day' && view === 'day' && (
                <span className="ml-1.5 text-[10px] bg-white/20 rounded-full px-1">por profissional</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Card de detalhes rico ────────────────────────────────────────────────────

function EventDetailCard({ event, onClose }: { event: UnifiedCalendarEvent; onClose: () => void }) {
  const color   = eventColor(event)
  const status  = STATUS_LABELS[event.status] ?? { label: event.status, cls: 'bg-slate-100 text-slate-600' }
  const service = serviceLabel(event)
  const time    = format(new Date(event.datetime.replace(' ', 'T')), 'HH:mm')
  const dateStr = format(new Date(event.datetime.replace(' ', 'T')), "dd 'de' MMMM yyyy", { locale: ptBR })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      {/* Faixa colorida topo */}
      <div className="h-1.5" style={{ backgroundColor: color }} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {event.type === 'grooming'
                ? <Scissors className="h-4 w-4 text-teal-600" />
                : <Stethoscope className="h-4 w-4 text-blue-600" />
              }
              <span className="font-bold text-slate-900 text-base">{event.petName}</span>
            </div>
            {event.petId && (
              <PatientLink id={event.petId} name={event.petName} size="sm" className="ml-6" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid de informações */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tutor</p>
            <p className="text-sm font-medium text-slate-800">{event.tutorName || '—'}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Serviço</p>
            <p className="text-sm font-medium text-slate-800">{service}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Clock className="h-3 w-3" /> Horário
            </p>
            <p className="text-sm font-medium text-slate-800">{time}</p>
            <p className="text-xs text-slate-400">{dateStr}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <User className="h-3 w-3" /> Profissional
            </p>
            <p className="text-sm font-medium text-slate-800">
              {event.professionalName || 'Não atribuído'}
            </p>
          </div>
        </div>

        {/* Status + badge */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${status.cls}`}>
              {status.label}
            </span>
            {event.botConfirmationStatus && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                title="Atualizado automaticamente pelo Bot WhatsApp"
              >
                <MessageCircle className="h-3 w-3" />
                {event.botConfirmationStatus === 'confirmed'   && 'Confirmado pelo Bot'}
                {event.botConfirmationStatus === 'rescheduled' && 'Remarcado pelo Bot'}
                {event.botConfirmationStatus === 'cancelled'   && 'Cancelado pelo Bot'}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">
            {event.source === 'whatsapp' && '📱 via WhatsApp · '}
            {event.type === 'grooming' ? 'Banho & Tosa' : 'Consulta'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Resource {
  id:    string
  title: string
  role?: string
}

interface Props {
  initialEvents: UnifiedCalendarEvent[]
  initialDate:   Date
  professionals: CalendarProfessional[]
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AppointmentsCalendar({ initialEvents, initialDate, professionals }: Props) {
  const [events,         setEvents]         = useState<RBCEvent[]>(() => toRBCEvents(initialEvents))
  const [unavailEvents,  setUnavailEvents]  = useState<RBCEvent[]>([])
  const [view,           setView]           = useState<View>('month')
  const [date,           setDate]           = useState(initialDate)
  const [loading,        setLoading]        = useState(false)
  const [selected,       setSelected]       = useState<UnifiedCalendarEvent | null>(null)
  const [selectedUnavail, setSelectedUnavail] = useState<UnavailabilityOccurrence | null>(null)
  const [showEventModal, setShowEventModal] = useState(false)

  const allEvents = useMemo<RBCEvent[]>(() => [...events, ...unavailEvents], [events, unavailEvents])

  // Lista de recursos (profissionais + coluna geral)
  const resources = useMemo<Resource[]>(() => [
    { id: UNASSIGNED_ID, title: 'Geral' },
    ...professionals.map(p => ({ id: p.id, title: p.name, role: p.role })),
  ], [professionals])

  const fetchRange = useCallback(async (newDate: Date, newView: View) => {
    setLoading(true)
    let start: Date, end: Date
    if (newView === 'month') {
      start = startOfMonth(newDate)
      end   = endOfMonth(newDate)
    } else if (newView === 'week') {
      start = startOfWeek(newDate, { locale: ptBR })
      end   = addDays(start, 6)
    } else {
      start = startOfDay(newDate)
      end   = endOfDay(newDate)
    }
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr   = format(end,   'yyyy-MM-dd')
    const [evResult, unavailResult] = await Promise.all([
      getUnifiedEventsForRange(startStr, endStr),
      listUnavailabilitiesInRange(startStr, endStr),
    ])
    if (!('error' in evResult)) setEvents(toRBCEvents(evResult))
    if (Array.isArray(unavailResult)) setUnavailEvents(toRBCUnavailabilities(unavailResult))
    setLoading(false)
  }, [])

  // Carga inicial dos bloqueios para o mês atual
  useEffect(() => {
    fetchRange(initialDate, 'month')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleNavigate(newDate: Date) {
    setDate(newDate)
    fetchRange(newDate, view)
  }

  function handleView(newView: View) {
    setView(newView)
    fetchRange(date, newView)
  }

  // Resource props apenas na vista Dia
  const resourceProps = view === 'day' ? {
    resources,
    resourceIdAccessor: 'id'    as const,
    resourceTitleAccessor: 'title' as const,
  } : {}

  return (
    <div className="space-y-4">
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 px-1">
        {COLOR_LEGEND.map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        {view === 'day' && professionals.length > 0 && (
          <span className="ml-auto text-xs text-blue-600 font-semibold">
            {resources.length} colunas · Visão por Profissional
          </span>
        )}
      </div>

      {/* Calendário */}
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        style={{ height: 700 }}
      >
        <Calendar
          localizer={localizer}
          events={allEvents}
          view={view}
          date={date}
          onView={handleView}
          onNavigate={handleNavigate}
          onSelectEvent={(evt: RBCEvent) => {
            if (evt.kind === 'unavailability') { setSelectedUnavail(evt.resource); setSelected(null) }
            else { setSelected(evt.resource); setSelectedUnavail(null) }
          }}
          eventPropGetter={(evt: RBCEvent) => ({
            style: {
              backgroundColor: evt.kind === 'unavailability' ? '#9ca3af' : eventColor(evt.resource),
              borderRadius:    '6px',
              border:          'none',
              color:           '#fff',
              fontSize:        '11px',
              fontWeight:      600,
              padding:         '2px 6px',
              cursor:          'pointer',
              backgroundImage: evt.kind === 'unavailability'
                ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 4px, transparent 4px 8px)'
                : undefined,
            },
          })}
          messages={{
            allDay:           'Dia todo',
            previous:         '',
            next:             '',
            today:            '',
            month:            'Mês',
            week:             'Semana',
            day:              'Dia',
            agenda:           'Agenda',
            date:             'Data',
            time:             'Hora',
            event:            'Evento',
            showMore:         (n: number) => `+${n} mais`,
            noEventsInRange:  'Sem eventos neste período',
          }}
          culture="pt-BR"
          style={{ height: '100%', fontFamily: 'inherit' }}
          popup
          showAllEvents
          components={{
            toolbar: (props: any) => (
              <CustomToolbar
                date={props.date}
                view={props.view}
                onNavigate={props.onNavigate}
                onView={props.onView}
                loading={loading}
                onNewEvent={() => setShowEventModal(true)}
              />
            ),
          }}
          {...resourceProps}
        />
      </div>

      {/* Card de detalhe do evento selecionado */}
      {selected && (
        <EventDetailCard event={selected} onClose={() => setSelected(null)} />
      )}

      {/* Card de detalhe da indisponibilidade selecionada */}
      {selectedUnavail && (
        <UnavailabilityDetailCard
          occurrence={selectedUnavail}
          onClose={() => setSelectedUnavail(null)}
          onDeleted={() => { setSelectedUnavail(null); fetchRange(date, view) }}
        />
      )}

      {/* Modal de criação de Evento / Indisponibilidade */}
      {showEventModal && (
        <UnavailabilityModal
          onClose={() => setShowEventModal(false)}
          onSuccess={() => { setShowEventModal(false); fetchRange(date, view) }}
        />
      )}
    </div>
  )
}

// ─── Card de detalhe da Indisponibilidade ─────────────────────────────────────

function UnavailabilityDetailCard({
  occurrence, onClose, onDeleted,
}: {
  occurrence: UnavailabilityOccurrence
  onClose:    () => void
  onDeleted:  () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const start = new Date(occurrence.starts_at)
  const end   = new Date(occurrence.ends_at)
  const dateStr = format(start, "dd 'de' MMMM yyyy", { locale: ptBR })
  const timeStr = `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`

  const RECURRENCE_LABEL: Record<string, string> = {
    none: 'Não se repete', daily: 'Diariamente', weekly: 'Semanalmente',
    monthly: 'Mensalmente', yearly: 'Anualmente',
  }

  async function handleDelete() {
    if (!confirm(occurrence.recurrence === 'none'
      ? 'Excluir este bloqueio?'
      : 'Excluir TODAS as ocorrências desta recorrência?')) return
    setDeleting(true)
    const res = await deleteUnavailability(occurrence.base_id)
    setDeleting(false)
    if ('error' in res) { alert(res.error); return }
    onDeleted()
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      <div className="h-1.5 bg-rose-500" />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-rose-600" />
            <span className="font-bold text-slate-900 text-base">
              {occurrence.title ?? 'Indisponível'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <User className="h-3 w-3" /> Profissional
            </p>
            <p className="text-sm font-medium text-slate-800">{occurrence.professional_name ?? '—'}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Clock className="h-3 w-3" /> Horário
            </p>
            <p className="text-sm font-medium text-slate-800">{timeStr}</p>
            <p className="text-xs text-slate-400">{dateStr}</p>
          </div>
        </div>

        {occurrence.notes && (
          <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 whitespace-pre-wrap">
            {occurrence.notes}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
            {RECURRENCE_LABEL[occurrence.recurrence] ?? occurrence.recurrence}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Excluir{occurrence.recurrence !== 'none' && ' série'}
          </button>
        </div>
      </div>
    </div>
  )
}
