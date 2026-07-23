'use client'

import { useMemo, useState, useCallback, useTransition } from 'react'
import {
  AlertTriangle, CalendarClock, ChevronDown, ChevronRight, PawPrint, Syringe,
  Clock, CheckCircle2, XCircle, RotateCcw, CheckSquare, Square,
} from 'lucide-react'
import ReceptionSubNav from './ReceptionSubNav'
import AppointmentValidationModal from './AppointmentValidationModal'
import { setVaccineScheduleStatus } from '@/lib/actions/reception-schedule'
import type { VaccinationSchedule, VaccinationScheduleItem, VaccineScheduleStatus } from '@/lib/actions/reception-schedule'
import type { AppointmentRequest } from '@/types'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmt(date: string, time: string): string {
  const dt = new Date(`${date}T${time}`)
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
    ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Lista de vacinas com seleção + ações por item ────────────────────────────
function ScheduleList({
  items, tone, selected, onToggle, onItemStatus, busy,
}: {
  items: VaccinationScheduleItem[]
  tone: 'rose' | 'emerald'
  selected: Set<string>
  onToggle: (id: string) => void
  onItemStatus: (ids: string[], status: VaccineScheduleStatus) => void
  busy: boolean
}) {
  if (items.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-400">Nenhuma vacina nesta categoria.</p>
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map(it => {
        const isSel = selected.has(it.id)
        const contacted = it.schedule_status === 'contacted'
        return (
          <div key={it.id} className={`px-5 py-3 flex items-center gap-3 ${isSel ? 'bg-indigo-50/50' : ''}`}>
            <button
              onClick={() => onToggle(it.id)}
              className="flex-shrink-0 text-slate-400 hover:text-indigo-600"
              title={isSel ? 'Remover da seleção' : 'Selecionar'}
              data-testid={`vac-select-${it.id}`}
            >
              {isSel ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <PawPrint className="h-3.5 w-3.5 text-slate-400" /> {it.patient_name}
                <span className="text-xs font-normal text-slate-400">· {it.tutor_name ?? 'sem tutor'}</span>
                {contacted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-px">
                    <CheckCircle2 className="h-3 w-3" />
                    contatado{it.schedule_status_at ? ` em ${new Date(it.schedule_status_at).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Syringe className="h-3 w-3 text-slate-300" /> {it.vaccine_name}
                <span className={tone === 'rose' ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                  · {tone === 'rose' ? 'venceu em' : 'prevista p/'} {formatDate(it.next_due_date)}
                </span>
              </p>
            </div>

            <div className="flex-shrink-0 flex items-center gap-1.5">
              {it.tutor_phone && (
                <a
                  href={`https://wa.me/55${it.tutor_phone.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100"
                >
                  WhatsApp
                </a>
              )}
              {contacted ? (
                <button
                  onClick={() => onItemStatus([it.id], 'pending')}
                  disabled={busy}
                  title="Desfazer 'contatado'"
                  className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => onItemStatus([it.id], 'contacted')}
                  disabled={busy}
                  title="Marcar tutor como contatado"
                  className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Contatado
                </button>
              )}
              <button
                onClick={() => onItemStatus([it.id], 'dismissed')}
                disabled={busy}
                title="Descartar da fila (não notificar)"
                className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Seletor de período (seleção em massa) ────────────────────────────────────
function PeriodSelector({
  items, selected, setSelected,
}: {
  items: VaccinationScheduleItem[]
  selected: Set<string>
  setSelected: (s: Set<string>) => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const inRange = useCallback(() => items.filter(it =>
    (!from || it.next_due_date >= from) && (!to || it.next_due_date <= to)
  ), [items, from, to])

  const selectRange = () => {
    const next = new Set(selected)
    for (const it of inRange()) next.add(it.id)
    setSelected(next)
  }
  const selectAll = () => {
    const next = new Set(selected)
    for (const it of items) next.add(it.id)
    setSelected(next)
  }

  return (
    <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500 font-medium">Selecionar período:</span>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700" aria-label="De" />
      <span className="text-slate-400">até</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700" aria-label="Até" />
      <button onClick={selectRange}
        className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-100">
        Selecionar ({inRange().length})
      </button>
      <button onClick={selectAll} className="font-medium text-slate-500 hover:text-indigo-600 underline decoration-dotted">
        todas ({items.length})
      </button>
    </div>
  )
}

export default function ProgramacoesWorkspace({
  schedule: initialSchedule,
  appointmentRequests: initialRequests,
}: {
  schedule: VaccinationSchedule
  appointmentRequests: AppointmentRequest[]
}) {
  const [openOverdue, setOpenOverdue]     = useState(true)
  const [openUpcoming, setOpenUpcoming]   = useState(false)
  const [openDismissed, setOpenDismissed] = useState(false)
  const [openRequests, setOpenRequests]   = useState(true)

  const [schedule, setSchedule] = useState<VaccinationSchedule>(initialSchedule)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [requests, setRequests] = useState(initialRequests)
  const [selectedReq, setSelectedReq] = useState<AppointmentRequest | null>(null)

  const onDone = useCallback(() => {
    setSelectedReq(null)
    setRequests(prev => prev.filter(r => r.id !== selectedReq?.id))
  }, [selectedReq])

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  /** Aplica status a um conjunto de ids: server action + reclassificação local. */
  const applyStatus = useCallback((ids: string[], status: VaccineScheduleStatus) => {
    startTransition(async () => {
      const res = await setVaccineScheduleStatus(ids, status)
      if ('error' in res) { setFeedback(res.error); return }
      const idSet = new Set(ids)
      const now = new Date().toISOString()
      setSchedule(prev => {
        const all = [...prev.overdue, ...prev.upcoming, ...prev.dismissed]
        const overdue: VaccinationScheduleItem[] = []
        const upcoming: VaccinationScheduleItem[] = []
        const dismissed: VaccinationScheduleItem[] = []
        for (const raw of all) {
          const it = idSet.has(raw.id)
            ? { ...raw, schedule_status: status, schedule_status_at: status === 'pending' ? null : now }
            : raw
          if (it.schedule_status === 'dismissed') dismissed.push(it)
          else if (it.overdue) overdue.push(it)
          else upcoming.push(it)
        }
        return { overdue, upcoming, dismissed }
      })
      setSelected(prev => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      const verb = status === 'dismissed' ? 'descartada(s)' : status === 'contacted' ? 'marcada(s) como contatadas' : 'restaurada(s)'
      setFeedback(`${res.updated} programação(ões) ${verb}.`)
    })
  }, [])

  const selectedIds = useMemo(() => Array.from(selected), [selected])

  return (
    <>
      <ReceptionSubNav />

      <div className="space-y-4 pb-20">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Programações</h1>
          <p className="text-sm text-slate-500">Vacinas, agendamentos e solicitações pendentes.</p>
        </div>

        {feedback && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-indigo-400 hover:text-indigo-600">✕</button>
          </div>
        )}

        {/* Agendamentos aguardando confirmação */}
        <div className="rounded-2xl border border-sky-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setOpenRequests(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-sky-50/60 hover:bg-sky-50"
          >
            <span className="flex items-center gap-2 font-semibold text-sky-800">
              {openRequests ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CalendarClock className="h-4 w-4" /> Agendamentos aguardando confirmação
            </span>
            <span className="text-lg font-bold text-sky-700 tabular-nums">{requests.length}</span>
          </button>

          {openRequests && (
            requests.length === 0
              ? <p className="px-5 py-4 text-sm text-slate-400">Nenhuma solicitação pendente.</p>
              : (
                <div className="divide-y divide-slate-100">
                  {requests.map(req => (
                    <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          <PawPrint className="h-3.5 w-3.5 text-slate-400" />
                          {req.pet_name ?? req.pet_name_free ?? '—'}
                          <span className="text-xs font-normal text-slate-400">· {req.tutor_name ?? '—'}</span>
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-300" />
                          {fmt(req.preferred_date, req.preferred_time)}
                          {req.visit_reason && <span className="text-slate-400">· {req.visit_reason}</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedReq(req)}
                        className="flex-shrink-0 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1 hover:bg-sky-100"
                      >
                        Validar
                      </button>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>

        {/* Vacinas atrasadas */}
        <div className="rounded-2xl border border-rose-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => setOpenOverdue(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-rose-50/60 hover:bg-rose-50">
            <span className="flex items-center gap-2 font-semibold text-rose-800">
              {openOverdue ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <AlertTriangle className="h-4 w-4" /> Vacinas atrasadas
            </span>
            <span className="text-lg font-bold text-rose-700 tabular-nums">{schedule.overdue.length}</span>
          </button>
          {openOverdue && (
            <>
              {schedule.overdue.length > 0 && (
                <PeriodSelector items={schedule.overdue} selected={selected} setSelected={setSelected} />
              )}
              <ScheduleList items={schedule.overdue} tone="rose" selected={selected}
                onToggle={toggle} onItemStatus={applyStatus} busy={pending} />
            </>
          )}
        </div>

        {/* Vacinas programadas */}
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => setOpenUpcoming(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-emerald-50/60 hover:bg-emerald-50">
            <span className="flex items-center gap-2 font-semibold text-emerald-800">
              {openUpcoming ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CalendarClock className="h-4 w-4" /> Vacinas programadas
            </span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{schedule.upcoming.length}</span>
          </button>
          {openUpcoming && (
            <>
              {schedule.upcoming.length > 0 && (
                <PeriodSelector items={schedule.upcoming} selected={selected} setSelected={setSelected} />
              )}
              <ScheduleList items={schedule.upcoming} tone="emerald" selected={selected}
                onToggle={toggle} onItemStatus={applyStatus} busy={pending} />
            </>
          )}
        </div>

        {/* Descartadas (restauráveis) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => setOpenDismissed(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/60 hover:bg-slate-50">
            <span className="flex items-center gap-2 font-semibold text-slate-600">
              {openDismissed ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <XCircle className="h-4 w-4" /> Descartadas
            </span>
            <span className="text-lg font-bold text-slate-500 tabular-nums">{schedule.dismissed.length}</span>
          </button>
          {openDismissed && (
            schedule.dismissed.length === 0
              ? <p className="px-5 py-4 text-sm text-slate-400">Nenhuma programação descartada.</p>
              : (
                <div className="divide-y divide-slate-100">
                  {schedule.dismissed.map(it => (
                    <div key={it.id} className="px-5 py-3 flex items-center justify-between gap-3 opacity-70">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                          <PawPrint className="h-3.5 w-3.5 text-slate-400" /> {it.patient_name}
                          <span className="text-xs font-normal text-slate-400">· {it.tutor_name ?? 'sem tutor'}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {it.vaccine_name} · era p/ {formatDate(it.next_due_date)}
                        </p>
                      </div>
                      <button
                        onClick={() => applyStatus([it.id], 'pending')}
                        disabled={pending}
                        className="flex-shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Restaurar</span>
                      </button>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </div>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-xl">
          <span className="text-sm font-semibold text-slate-700 tabular-nums">{selected.size} selecionada{selected.size !== 1 ? 's' : ''}</span>
          <button
            onClick={() => applyStatus(selectedIds, 'contacted')}
            disabled={pending}
            className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
          >
            Marcar contatadas
          </button>
          <button
            onClick={() => applyStatus(selectedIds, 'dismissed')}
            disabled={pending}
            className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 hover:bg-rose-100 disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            Limpar
          </button>
        </div>
      )}

      {selectedReq && (
        <AppointmentValidationModal
          request={selectedReq}
          onClose={() => setSelectedReq(null)}
          onDone={onDone}
        />
      )}
    </>
  )
}
