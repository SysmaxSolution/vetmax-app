'use client'

import { useState, useCallback, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import {
  format, parse, startOfWeek, getDay,
  startOfMonth, endOfMonth, startOfDay, endOfDay, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import {
  ChevronLeft, ChevronRight, Plus, Scissors, X, MessageCircle,
  Clock, User, Stethoscope, Loader2, CheckCircle2, AlertCircle,
  CalendarOff, Trash2,
} from 'lucide-react'
import {
  confirmArrival, cancelAppointment,
  getTodayCountsByProfessional, type ProfessionalCount,
} from '@/lib/actions/appointments'
import { cancelGroomingSession } from '@/lib/actions/grooming'
import {
  getUnifiedEventsForRange, getClinicProfessionals,
  type UnifiedCalendarEvent, type CalendarProfessional,
} from '@/lib/actions/calendar'
import { sendDailyScheduleToVets } from '@/lib/actions/daily-schedule-whatsapp'
import { listUnavailabilitiesInRange, deleteUnavailability } from '@/lib/actions/unavailabilities'
import PatientLink from '@/components/PatientLink'
import NewAppointmentModal from './NewAppointmentModal'
import EditAppointmentModal from './EditAppointmentModal'
import ReceptionSubNav from './ReceptionSubNav'
import UnavailabilityModal from '@/components/appointments/UnavailabilityModal'

// ─── Localizer pt-BR ──────────────────────────────────────────────────────────

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales: { 'pt-BR': ptBR },
})

// ─── Constantes ───────────────────────────────────────────────────────────────

const UNASSIGNED_ID = '__unassigned__'

const EVENT_COLORS: Record<string, string> = {
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
  scheduled:      { label: 'Agendado',        cls: 'bg-blue-100 text-blue-700' },
  confirmed:      { label: 'Confirmado',       cls: 'bg-teal-100 text-teal-700' },
  arrived:        { label: 'Em Atendimento',   cls: 'bg-amber-100 text-amber-700' },
  completed:      { label: 'Concluído',        cls: 'bg-green-100 text-green-700' },
  cancelled:      { label: 'Cancelado',        cls: 'bg-red-100 text-red-700' },
  received:       { label: 'Recebido',         cls: 'bg-slate-100 text-slate-600' },
  bathing:        { label: 'Banho',            cls: 'bg-blue-100 text-blue-700' },
  waiting_pickup: { label: 'Aguard. Retirada', cls: 'bg-amber-100 text-amber-700' },
  delivered:      { label: 'Entregue',         cls: 'bg-green-100 text-green-700' },
}

const COLOR_LEGEND = [
  { label: 'Consulta',     color: '#2563eb' },
  { label: 'Vacinação',    color: '#16a34a' },
  { label: 'Cirurgia',     color: '#dc2626' },
  { label: 'Exame',        color: '#7c3aed' },
  { label: 'Emergência',   color: '#ea580c' },
  { label: 'Banho & Tosa', color: '#0d9488' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventColor(e: UnifiedCalendarEvent): string {
  if (e.type === 'grooming') return EVENT_COLORS.grooming
  return EVENT_COLORS[e.reason ?? ''] ?? '#2563eb'
}

function serviceLabel(e: UnifiedCalendarEvent): string {
  if (e.type === 'grooming' && e.services?.length) return e.services.join(', ')
  if (e.type === 'grooming') return 'Banho & Tosa'
  return REASON_LABELS[e.reason ?? ''] ?? e.reason ?? 'Consulta'
}

// ─── RBC Event ────────────────────────────────────────────────────────────────

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
      kind:       'appointment'
      id:         string
      title:      string
      start:      Date
      end:        Date
      resourceId: string
      resource:   UnifiedCalendarEvent
    }
  | {
      kind:       'unavailability'
      id:         string
      title:      string
      start:      Date
      end:        Date
      resourceId: string
      resource:   UnavailabilityOccurrence
    }

function toRBCEvents(raw: UnifiedCalendarEvent[]): RBCEvent[] {
  return raw.map(e => {
    const start = new Date(e.datetime.replace(' ', 'T'))
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
  date:           Date
  view:           View
  onNavigate:     (action: 'PREV' | 'NEXT' | 'TODAY') => void
  onView:         (view: View) => void
  loading:        boolean
  onNewAppt:      () => void
  onNewEvent:     () => void
  onSendSchedule: () => void
  sendingSchedule:boolean
}

function CustomToolbar({
  date, view, onNavigate, onView, loading,
  onNewAppt, onNewEvent, onSendSchedule, sendingSchedule,
}: ToolbarProps) {
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
      {/* Navegação */}
      <div className="flex items-center gap-2 flex-wrap">
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

      {/* Direita: views + ações */}
      <div className="flex items-center gap-2 flex-wrap">
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
                <span className="ml-1.5 text-[10px] bg-white/20 rounded-full px-1">profissionais</span>
              )}
            </button>
          ))}
        </div>

        {/* Botão: Agenda do Dia → WhatsApp */}
        <button
          onClick={onSendSchedule}
          disabled={sendingSchedule}
          title="Enviar agenda do dia para profissionais via WhatsApp"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {sendingSchedule
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            : <MessageCircle className="h-3.5 w-3.5 text-green-600" />}
          <span className="hidden sm:inline">Agenda do Dia</span>
        </button>

        {/* Evento / Indisponibilidade */}
        <button
          onClick={onNewEvent}
          title="Bloquear horários do profissional"
          className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
        >
          <CalendarOff className="h-3.5 w-3.5" />
          Evento
        </button>

        {/* Novo Agendamento */}
        <button
          onClick={onNewAppt}
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Agendamento
        </button>
      </div>
    </div>
  )
}

// ─── Card de detalhe do evento ────────────────────────────────────────────────

interface DetailCardProps {
  event:       UnifiedCalendarEvent
  onClose:     () => void
  onCheckIn:   (id: string) => void
  onCancel:    (id: string, type: 'appointment' | 'grooming') => void
  onEdit:      (id: string) => void
  isPending:   boolean
}

function EventDetailCard({ event, onClose, onCheckIn, onCancel, onEdit, isPending }: DetailCardProps) {
  const color   = eventColor(event)
  const status  = STATUS_LABELS[event.status] ?? { label: event.status, cls: 'bg-slate-100 text-slate-600' }
  const service = serviceLabel(event)
  const time    = format(new Date(event.datetime.replace(' ', 'T')), 'HH:mm')
  const dateStr = format(new Date(event.datetime.replace(' ', 'T')), "dd 'de' MMMM yyyy", { locale: ptBR })

  const isAppt       = event.type === 'appointment'
  const canCheckIn   = isAppt && (event.status === 'scheduled' || event.status === 'confirmed')
  const canCancelAppt = isAppt && (event.status === 'scheduled' || event.status === 'confirmed')
  const canCancelGroom = !isAppt && (event.status === 'received' || event.status === 'scheduled')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      <div className="h-1.5" style={{ backgroundColor: color }} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {isAppt
                ? <Stethoscope className="h-4 w-4 text-blue-600" />
                : <Scissors className="h-4 w-4 text-teal-600" />}
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

        {/* Info grid */}
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
            <p className="text-sm font-medium text-slate-800">{event.professionalName || 'Não atribuído'}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${status.cls}`}>
            {status.label}
          </span>
          <span className="text-xs text-slate-400">
            {event.source === 'whatsapp' && '📱 via WhatsApp · '}
            {isAppt ? 'Consulta' : 'Banho & Tosa'}
          </span>
        </div>

        {/* Ações */}
        {(canCheckIn || canCancelAppt || canCancelGroom || isAppt) && (
          <div className="flex gap-2 pt-1">
            {canCheckIn && (
              <button
                onClick={() => onCheckIn(event.sourceId)}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Check-in
              </button>
            )}
            {isAppt && (
              <button
                onClick={() => onEdit(event.sourceId)}
                disabled={isPending}
                className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Editar
              </button>
            )}
            {!isAppt && (
              <button
                onClick={() => window.location.href = '/dashboard/grooming'}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Ver no Kanban →
              </button>
            )}
            {(canCancelAppt || canCancelGroom) && (
              <button
                onClick={() => onCancel(event.sourceId, event.type)}
                disabled={isPending}
                className="flex items-center justify-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clinicName: string
  userName?:  string
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CalendarWorkspace({ clinicName }: Props) {
  const router = useRouter()
  const today  = new Date()

  const [events,        setEvents]        = useState<RBCEvent[]>([])
  const [unavailEvents, setUnavailEvents] = useState<RBCEvent[]>([])
  const [professionals, setProfessionals] = useState<CalendarProfessional[]>([])
  const [vetCounts,     setVetCounts]     = useState<ProfessionalCount[]>([])
  const [view,          setView]          = useState<View>('month')
  const [date,          setDate]          = useState(today)
  const [loading,       setLoading]       = useState(false)
  const [selected,      setSelected]      = useState<UnifiedCalendarEvent | null>(null)
  const [selectedUnavail, setSelectedUnavail] = useState<UnavailabilityOccurrence | null>(null)
  const [showNewAppt,   setShowNewAppt]   = useState(false)
  const [showNewEvent,  setShowNewEvent]  = useState(false)
  const [editApptId,    setEditApptId]    = useState<string | null>(null)
  const [sendingSchedule, setSendingSchedule] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [isPending, startTransition] = useTransition()

  const allEvents = useMemo<RBCEvent[]>(() => [...events, ...unavailEvents], [events, unavailEvents])

  function showToastMsg(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Recursos (profissionais + Geral) — só Day view usa
  const resources = useMemo(() => [
    { id: UNASSIGNED_ID, title: 'Geral' },
    ...professionals.map(p => ({ id: p.id, title: p.name, role: p.role })),
  ], [professionals])

  const fetchRange = useCallback(async (d: Date, v: View) => {
    setLoading(true)
    let start: Date, end: Date
    if (v === 'month') { start = startOfMonth(d); end = endOfMonth(d) }
    else if (v === 'week') { start = startOfWeek(d, { locale: ptBR }); end = addDays(start, 6) }
    else { start = startOfDay(d); end = endOfDay(d) }

    const startStr = format(start, 'yyyy-MM-dd')
    const endStr   = format(end,   'yyyy-MM-dd')
    const [result, unavailResult] = await Promise.all([
      getUnifiedEventsForRange(startStr, endStr),
      listUnavailabilitiesInRange(startStr, endStr),
    ])
    if (!('error' in result)) setEvents(toRBCEvents(result))
    if (Array.isArray(unavailResult)) setUnavailEvents(toRBCUnavailabilities(unavailResult))
    setLoading(false)
  }, [])

  // Carga inicial
  useEffect(() => {
    fetchRange(today, 'month')
    getClinicProfessionals().then(r => { if (Array.isArray(r)) setProfessionals(r) })
    getTodayCountsByProfessional().then(r => { if (!('error' in r)) setVetCounts(r) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNavigate(newDate: Date) {
    setDate(newDate)
    fetchRange(newDate, view)
  }

  function handleView(newView: View) {
    setView(newView)
    fetchRange(date, newView)
  }

  function handleCheckIn(apptId: string) {
    startTransition(async () => {
      const res = await confirmArrival(apptId)
      if ('error' in res) {
        showToastMsg(res.error, 'error')
      } else {
        showToastMsg('Check-in realizado! Pet está na fila de espera.')
        setSelected(null)
        fetchRange(date, view)
      }
    })
  }

  function handleCancel(id: string, type: 'appointment' | 'grooming') {
    startTransition(async () => {
      const res = type === 'appointment'
        ? await cancelAppointment(id)
        : await cancelGroomingSession(id)
      if ('error' in res) {
        showToastMsg(res.error, 'error')
      } else {
        showToastMsg(type === 'appointment' ? 'Agendamento cancelado.' : 'Banho e Tosa cancelado.')
        setSelected(null)
        fetchRange(date, view)
      }
    })
  }

  async function handleSendSchedule() {
    setSendingSchedule(true)
    const res = await sendDailyScheduleToVets()
    setSendingSchedule(false)
    if ('error' in res) {
      showToastMsg(res.error, 'error')
    } else {
      showToastMsg(
        res.sent === 0
          ? 'Nenhum profissional com telefone cadastrado.'
          : `Agenda enviada para ${res.sent} profissional${res.sent !== 1 ? 'is' : ''}!`,
        res.sent > 0 ? 'success' : 'error',
      )
    }
  }

  const resourceProps = view === 'day' ? {
    resources,
    resourceIdAccessor: 'id'    as const,
    resourceTitleAccessor: 'title' as const,
  } : {}

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {showNewAppt && (
        <NewAppointmentModal
          onClose={() => setShowNewAppt(false)}
          onSuccess={petName => {
            setShowNewAppt(false)
            showToastMsg(`Agendamento criado para ${petName}!`)
            fetchRange(date, view)
          }}
        />
      )}

      {editApptId && (
        <EditAppointmentModal
          appointmentId={editApptId}
          onClose={() => setEditApptId(null)}
          onSuccess={() => {
            setEditApptId(null)
            fetchRange(date, view)
          }}
        />
      )}

      {showNewEvent && (
        <UnavailabilityModal
          onClose={() => setShowNewEvent(false)}
          onSuccess={(count) => {
            setShowNewEvent(false)
            showToastMsg(`${count} bloqueio${count !== 1 ? 's' : ''} criado${count !== 1 ? 's' : ''}.`)
            fetchRange(date, view)
          }}
        />
      )}

      <ReceptionSubNav />

      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
          <p className="mt-0.5 text-sm text-slate-500">{clinicName}</p>
        </div>

        {/* Atendimentos hoje por profissional */}
        {vetCounts.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-slate-200 px-4 py-2.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Atendimentos hoje</span>
            {vetCounts.map(vc => (
              <span key={vc.vet_id} className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-700">{vc.vet_name}</span>
                <span className="bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-bold text-[10px]">{vc.count}</span>
              </span>
            ))}
            <span className="ml-auto text-xs font-bold text-slate-900">
              Total: {vetCounts.reduce((s, v) => s + v.count, 0)}
            </span>
          </div>
        )}

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
          style={{ height: 680 }}
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
              allDay:          'Dia todo',
              previous:        '',
              next:            '',
              today:           '',
              month:           'Mês',
              week:            'Semana',
              day:             'Dia',
              agenda:          'Agenda',
              date:            'Data',
              time:            'Hora',
              event:           'Evento',
              showMore:        (n: number) => `+${n} mais`,
              noEventsInRange: 'Sem eventos neste período',
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
                  onNewAppt={() => setShowNewAppt(true)}
                  onNewEvent={() => setShowNewEvent(true)}
                  onSendSchedule={handleSendSchedule}
                  sendingSchedule={sendingSchedule}
                />
              ),
            }}
            {...resourceProps}
          />
        </div>

        {/* Card de detalhe */}
        {selected && (
          <EventDetailCard
            event={selected}
            onClose={() => setSelected(null)}
            onCheckIn={handleCheckIn}
            onCancel={handleCancel}
            onEdit={id => { setSelected(null); setEditApptId(id) }}
            isPending={isPending}
          />
        )}

        {/* Card de detalhe da indisponibilidade */}
        {selectedUnavail && (
          <UnavailabilityDetailCard
            occurrence={selectedUnavail}
            onClose={() => setSelectedUnavail(null)}
            onDeleted={() => {
              setSelectedUnavail(null)
              showToastMsg('Bloqueio excluído.')
              fetchRange(date, view)
            }}
          />
        )}
      </div>
    </>
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
