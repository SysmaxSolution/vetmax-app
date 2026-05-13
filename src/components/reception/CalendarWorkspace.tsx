'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Scissors, X, MessageCircle, Pencil } from 'lucide-react'
import {
  confirmArrival,
  cancelAppointment,
  getTodayCountsByProfessional,
  type AppointmentItem,
  type ProfessionalCount,
} from '@/lib/actions/appointments'
import { cancelGroomingSession } from '@/lib/actions/grooming'
import {
  getUnifiedCalendarEvents,
  getUnifiedMonthCounts,
  type UnifiedCalendarEvent,
} from '@/lib/actions/calendar'
import { sendDailyScheduleToVets, type DailyScheduleResult } from '@/lib/actions/daily-schedule-whatsapp'
import NewAppointmentModal from './NewAppointmentModal'
import EditAppointmentModal from './EditAppointmentModal'
import ReceptionSubNav from './ReceptionSubNav'

// ─── Constants ────────────────────────────────────────────────────────────────

const PT_MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const PT_WEEKDAYS      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const PT_WEEKDAYS_LONG = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
  grooming:     'Banho e Tosa',
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendado',  color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  arrived:   { label: 'Chegou',    color: 'bg-teal-100 text-teal-700' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function buildGrid(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const grid: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) grid.push(d)
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

function apptTime(datetime: string): string {
  return datetime.split('T')[1]?.substring(0, 5) ?? ''
}

// ─── Appointment Card ─────────────────────────────────────────────────────────

function AppointmentCard({
  appt, isPending, onConfirmArrival, onCancel,
}: {
  appt:             AppointmentItem
  isPending:        boolean
  onConfirmArrival: () => void
  onCancel:         () => void
}) {
  const time      = apptTime(appt.appointment_datetime)
  const emoji     = SPECIES_EMOJI[appt.patient.species] ?? '🐾'
  const statusCfg = STATUS_CFG[appt.status] ?? { label: appt.status, color: 'bg-slate-100 text-slate-600' }
  const canAct    = appt.status === 'scheduled' || appt.status === 'confirmed'

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        {/* Time chip */}
        <div className="flex-shrink-0 rounded-lg bg-teal-100 px-2.5 py-1.5 text-center min-w-[52px]">
          <p className="text-xs font-bold text-teal-700 tabular-nums">{time || '—'}</p>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">
              {emoji} {appt.patient.name}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {appt.tutor.name} · {VISIT_REASON_LABELS[appt.reason] ?? appt.reason}
          </p>
          {appt.notes && (
            <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">{appt.notes}</p>
          )}
        </div>
      </div>
      {canAct && (
        <div className="flex gap-2">
          <button
            onClick={onConfirmArrival}
            disabled={isPending}
            className="flex-1 rounded-lg bg-teal-600 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            Confirmar Chegada (Check-in)
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

type FilterType = 'all' | 'appointment' | 'grooming'

function EventCard({
  event, isPending, onConfirmArrival, onCancel, onCancelGrooming, onGroomingClick, onEdit,
}: {
  event:              UnifiedCalendarEvent
  isPending:          boolean
  onConfirmArrival:   () => void
  onCancel:           () => void
  onCancelGrooming:   () => void
  onGroomingClick:    () => void
  onEdit:             () => void
}) {
  const time         = event.datetime.split('T')[1]?.substring(0, 5) ?? ''
  const emoji        = SPECIES_EMOJI[event.petSpecies] ?? '🐾'
  const isAppt       = event.type === 'appointment'
  const statusCfg    = STATUS_CFG[event.status] ?? { label: event.status, color: 'bg-slate-100 text-slate-600' }
  const canActAppt   = isAppt && (event.status === 'scheduled' || event.status === 'confirmed')
  // Grooming pode ser cancelado enquanto ainda não iniciou (status=received, que no board aparece como scheduled ou received)
  const canCancelGrooming = !isAppt && (event.status === 'received' || event.status === 'scheduled')

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${
      isAppt ? 'border-blue-100 bg-blue-50/40' : 'border-emerald-100 bg-emerald-50/40'
    }`}>
      <div className="flex items-start gap-2.5">
        {/* Time chip */}
        <div className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[52px] ${
          isAppt ? 'bg-blue-100' : 'bg-emerald-100'
        }`}>
          <p className={`text-xs font-bold tabular-nums ${isAppt ? 'text-blue-700' : 'text-emerald-700'}`}>
            {time || '—'}
          </p>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">
              {emoji} {event.petName}
            </span>
            {/* Type badge */}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-0.5 ${
              isAppt ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isAppt ? '🩺 Consulta' : <><Scissors className="h-2.5 w-2.5" /> Tosa</>}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {event.source === 'whatsapp' && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 flex items-center gap-0.5">
                <MessageCircle className="h-2.5 w-2.5" />WhatsApp
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {event.tutorName}
            {isAppt && event.reason ? ` · ${VISIT_REASON_LABELS[event.reason] ?? event.reason}` : ''}
            {!isAppt && event.services?.length ? ` · ${event.services.join(', ')}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {/* Ações para consulta agendada */}
        {canActAppt && (
          <>
            <button
              onClick={onConfirmArrival}
              disabled={isPending}
              className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Check-in
            </button>
            <button
              onClick={onEdit}
              disabled={isPending}
              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
            <button
              onClick={onCancel}
              disabled={isPending}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </>
        )}
        {/* Ações para grooming */}
        {!isAppt && (
          <button
            onClick={onGroomingClick}
            className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Ver no Kanban →
          </button>
        )}
        {canCancelGrooming && (
          <button
            onClick={onCancelGrooming}
            disabled={isPending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  clinicName: string
  userName?:  string
}

export default function CalendarWorkspace({ clinicName }: Props) {
  const router   = useRouter()
  const today    = new Date()
  const todayStr = padDate(today.getFullYear(), today.getMonth() + 1, today.getDate())

  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [selDate,   setSelDate]   = useState(todayStr)
  const [counts,    setCounts]    = useState<Record<string, number>>({})
  const [events,    setEvents]    = useState<UnifiedCalendarEvent[]>([])
  const [filter,    setFilter]    = useState<FilterType>('all')
  const [loadMonth, setLoadMonth] = useState(false)
  const [loadDay,   setLoadDay]   = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [kanbanMode, setKanbanMode] = useState(false)
  const [kanbanGroupBy, setKanbanGroupBy] = useState<'professional' | 'type'>('professional')
  const [toast,     setToast]     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [sendingSchedule, setSendingSchedule] = useState(false)
  const [scheduleResult, setScheduleResult]   = useState<DailyScheduleResult | null>(null)
  const [cancelGroomingTarget, setCancelGroomingTarget] = useState<UnifiedCalendarEvent | null>(null)
  const [editTargetId,         setEditTargetId]         = useState<string | null>(null)
  const [vetCounts, setVetCounts] = useState<ProfessionalCount[]>([])
  const [isPending, startTransition] = useTransition()

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSendDailySchedule() {
    setSendingSchedule(true)
    setScheduleResult(null)
    const res = await sendDailyScheduleToVets()
    setSendingSchedule(false)
    if ('error' in res) {
      showToast(res.error, 'error')
    } else {
      setScheduleResult(res)
      showToast(
        res.sent === 0
          ? 'Nenhum profissional com telefone cadastrado encontrado.'
          : `Agenda enviada para ${res.sent} profissional${res.sent !== 1 ? 'is' : ''}!`,
        res.sent > 0 ? 'success' : 'error',
      )
    }
  }

  async function refreshMonth() {
    const res = await getUnifiedMonthCounts(viewYear, viewMonth)
    if (!('error' in res)) setCounts(res)
  }

  async function refreshDay(date: string) {
    const res = await getUnifiedCalendarEvents(date)
    if (!('error' in res)) setEvents(res)
    else setEvents([])
  }

  useEffect(() => {
    setLoadMonth(true)
    getUnifiedMonthCounts(viewYear, viewMonth).then(res => {
      setLoadMonth(false)
      if (!('error' in res)) setCounts(res)
    })
    getTodayCountsByProfessional().then(res => {
      if (!('error' in res)) setVetCounts(res)
    })
  }, [viewYear, viewMonth])

  useEffect(() => {
    setLoadDay(true)
    getUnifiedCalendarEvents(selDate).then(res => {
      setLoadDay(false)
      if (!('error' in res)) setEvents(res)
      else setEvents([])
    })
  }, [selDate])

  const displayed = filter === 'all' ? events : events.filter(e => e.type === filter)

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  function handleConfirmArrival(apptId: string) {
    startTransition(async () => {
      const res = await confirmArrival(apptId)
      if ('error' in res) {
        showToast(res.error, 'error')
      } else {
        showToast(`Check-in realizado! Pet está na fila de espera.`)
        await Promise.all([refreshDay(selDate), refreshMonth()])
      }
    })
  }

  function handleCancel(apptId: string) {
    startTransition(async () => {
      const res = await cancelAppointment(apptId)
      if ('error' in res) {
        showToast(res.error, 'error')
      } else {
        showToast('Agendamento cancelado.')
        await Promise.all([refreshDay(selDate), refreshMonth()])
      }
    })
  }

  function handleCancelGrooming(sessionId: string) {
    startTransition(async () => {
      const res = await cancelGroomingSession(sessionId)
      if ('error' in res) {
        showToast(res.error, 'error')
      } else {
        showToast('Banho e Tosa cancelado.')
        await Promise.all([refreshDay(selDate), refreshMonth()])
      }
    })
  }

  function confirmCancelGroomingModal() {
    if (!cancelGroomingTarget) return
    const event = cancelGroomingTarget
    setCancelGroomingTarget(null)
    handleCancelGrooming(event.sourceId)
  }

  const grid       = buildGrid(viewYear, viewMonth)
  const selDateObj = new Date(selDate + 'T12:00:00')
  const selWeekday = PT_WEEKDAYS_LONG[selDateObj.getDay()]
  const selFormatted = selDateObj.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const apptCount     = displayed.filter(e => e.type === 'appointment').length
  const groomingCount = displayed.filter(e => e.type === 'grooming').length

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {showModal && (
        <NewAppointmentModal
          onClose={() => setShowModal(false)}
          onSuccess={petName => {
            setShowModal(false)
            showToast(`Agendamento criado para ${petName}!`)
            refreshDay(selDate)
            refreshMonth()
          }}
        />
      )}

      {editTargetId && (
        <EditAppointmentModal
          appointmentId={editTargetId}
          onClose={() => setEditTargetId(null)}
          onSuccess={() => {
            refreshDay(selDate)
            refreshMonth()
          }}
        />
      )}

      {/* Modal de Confirmação de Cancelamento — Banho e Tosa */}
      {cancelGroomingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <X className="h-5 w-5 text-red-500" />
                  Cancelar Agendamento
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
              <button
                onClick={() => setCancelGroomingTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">
                  {cancelGroomingTarget.petName}
                </p>
                <p className="text-xs text-slate-500">
                  Tutor: {cancelGroomingTarget.tutorName}
                </p>
                <p className="text-xs text-red-500 font-medium mt-0.5">
                  {new Date(cancelGroomingTarget.datetime).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {cancelGroomingTarget.services?.length
                    ? ` · ${cancelGroomingTarget.services.join(', ')}`
                    : ''}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Tem certeza que deseja cancelar o agendamento de{' '}
              <span className="font-semibold">Banho e Tosa</span> de{' '}
              <span className="font-semibold text-slate-900">{cancelGroomingTarget.petName}</span>?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setCancelGroomingTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Manter Agendamento
              </button>
              <button
                onClick={confirmCancelGroomingModal}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancelar Agendamento
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceptionSubNav />

      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
            <p className="mt-0.5 text-sm text-slate-500">{clinicName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendDailySchedule}
              disabled={sendingSchedule}
              title="Enviar agenda do dia para cada profissional via WhatsApp"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {sendingSchedule
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                : <MessageCircle className="h-4 w-4 text-green-600" />}
              <span className="hidden sm:inline">Agenda do Dia</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo Agendamento
            </button>
          </div>
        </div>

        {/* Atendimentos por profissional (hoje) */}
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

        {/* Calendar + Day panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Monthly Calendar ── */}
          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-6">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={prevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <h2 className="text-base font-semibold text-slate-900">
                {PT_MONTHS[viewMonth - 1]} {viewYear}
              </h2>
              <button
                onClick={nextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {PT_WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, i) => {
                if (!day) return <div key={i} />
                const dateStr  = padDate(viewYear, viewMonth, day)
                const count    = counts[dateStr] ?? 0
                const isToday  = dateStr === todayStr
                const isSel    = dateStr === selDate
                const isPast   = dateStr < todayStr

                return (
                  <button
                    key={i}
                    onClick={() => setSelDate(dateStr)}
                    onDoubleClick={() => { setSelDate(dateStr); setKanbanMode(true) }}
                    className={`relative flex flex-col items-center justify-center rounded-xl py-2 px-1 min-h-[52px] transition-all ${
                      isSel
                        ? 'bg-slate-900 text-white shadow-sm'
                        : isToday
                        ? 'ring-2 ring-teal-500 text-teal-700 font-bold hover:bg-teal-50'
                        : isPast
                        ? 'text-slate-300 hover:bg-slate-50 cursor-pointer'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm font-medium leading-none">{day}</span>
                    {count > 0 && (
                      <span className={`mt-1 text-[10px] font-bold leading-none rounded-full px-1.5 py-0.5 ${
                        isSel ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {loadMonth && (
              <p className="mt-3 text-center text-xs text-slate-400">Carregando...</p>
            )}

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
                Consulta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Banho e Tosa
              </span>
              <span className="ml-auto">
                <span className="bg-teal-100 text-teal-600 rounded-full px-1.5 text-[10px] font-bold">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
                {' '}no mês
              </span>
            </div>
          </div>

          {/* ── Day Events Panel ── */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-3">
            {/* Day header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{selWeekday}</p>
                <h3 className="text-sm font-bold text-slate-900">{selFormatted}</h3>
                {events.length > 0 && (
                  <button
                    onClick={() => setKanbanMode(v => !v)}
                    className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                      kanbanMode ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {kanbanMode ? '← Lista' : '▦ Kanban'}
                  </button>
                )}
              </div>
              {events.length > 0 && (
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-900 tabular-nums">{events.length}</p>
                  <p className="text-xs text-slate-400">evento{events.length !== 1 ? 's' : ''}</p>
                  <div className="flex gap-1.5 justify-end mt-0.5">
                    {apptCount > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-bold">{apptCount} consulta{apptCount !== 1 ? 's' : ''}</span>}
                    {groomingCount > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-bold">{groomingCount} tosa{groomingCount !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5">
              {(['all', 'appointment', 'grooming'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    filter === f
                      ? f === 'all'
                        ? 'bg-slate-900 text-white'
                        : f === 'appointment'
                        ? 'bg-blue-600 text-white'
                        : 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'appointment' ? '🩺 Consultas' : '✂️ Tosa'}
                </button>
              ))}
            </div>

            {/* Events list / Kanban */}
            <div className="flex-1">
              {kanbanMode && displayed.length > 0 ? (
                /* ── KANBAN MODE ── */
                <div className="space-y-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setKanbanGroupBy('professional')}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kanbanGroupBy === 'professional' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                    >
                      Por Especialidade
                    </button>
                    <button
                      onClick={() => setKanbanGroupBy('type')}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kanbanGroupBy === 'type' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                    >
                      Por Tipo
                    </button>
                  </div>
                  {(() => {
                    const groups: Record<string, UnifiedCalendarEvent[]> = {}
                    for (const ev of displayed) {
                      const key = kanbanGroupBy === 'type'
                        ? (ev.type === 'appointment' ? (VISIT_REASON_LABELS[ev.reason ?? ''] ?? 'Consulta') : 'Banho e Tosa')
                        : (ev.reason ? (VISIT_REASON_LABELS[ev.reason] ?? ev.reason) : 'Banho e Tosa')
                      if (!groups[key]) groups[key] = []
                      groups[key].push(ev)
                    }
                    return Object.entries(groups).map(([label, items]) => (
                      <div key={label} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-indigo-700">{label}</span>
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5">{items.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {items.map(ev => (
                            <div
                              key={ev.id}
                              className="rounded-lg bg-white border border-slate-100 px-3 py-2 cursor-pointer hover:border-indigo-200 transition-colors"
                              onClick={() => {
                                if (ev.type === 'appointment') handleConfirmArrival(ev.sourceId)
                                else router.push('/dashboard/grooming')
                              }}
                            >
                              <p className="text-xs font-semibold text-slate-900">
                                {SPECIES_EMOJI[ev.petSpecies] ?? '🐾'} {ev.petName}
                              </p>
                              <p className="text-[10px] text-slate-500">{ev.tutorName} · {ev.datetime.split('T')[1]?.substring(0, 5) ?? ''}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              ) : loadDay ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="h-6 w-6 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarDays className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-400">
                    {filter === 'all' ? 'Sem eventos' : filter === 'appointment' ? 'Sem consultas' : 'Sem tosas'}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">nenhum para este dia</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 text-xs text-teal-600 hover:text-teal-700 font-semibold transition-colors"
                  >
                    + Agendar consulta
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayed.map(event => (
                    <EventCard
                      key={event.id}
                      event={event}
                      isPending={isPending}
                      onConfirmArrival={() => handleConfirmArrival(event.sourceId)}
                      onCancel={() => handleCancel(event.sourceId)}
                      onCancelGrooming={() => setCancelGroomingTarget(event)}
                      onGroomingClick={() => router.push('/dashboard/grooming')}
                      onEdit={() => event.type === 'appointment' && setEditTargetId(event.sourceId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
