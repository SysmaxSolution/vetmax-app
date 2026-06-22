'use client'

import { useState, useTransition } from 'react'
import { X, Check, AlertCircle, XCircle, CalendarClock, PawPrint, Clock } from 'lucide-react'
import {
  approveAppointmentRequest,
  proposeAlternativeSlot,
  rejectAppointmentRequest,
} from '@/lib/actions/appointment-requests'
import type { AppointmentRequest } from '@/types'

function fmt(date: string, time: string): string {
  const dt = new Date(`${date}T${time}`)
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
    ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

type Tab = 'approve' | 'propose' | 'reject'

export default function AppointmentValidationModal({
  request,
  onClose,
  onDone,
}: {
  request: AppointmentRequest
  onClose: () => void
  onDone:  () => void
}) {
  const [tab, setTab]             = useState<Tab>('approve')
  const [notes, setNotes]         = useState('')
  const [propDate, setPropDate]   = useState(request.preferred_date)
  const [propTime, setPropTime]   = useState(request.preferred_time)
  const [rejectMsg, setRejectMsg] = useState('')
  const [isPending, startTransition] = useTransition()
  const [err, setErr]             = useState<string | null>(null)

  const petLabel   = request.pet_name ?? request.pet_name_free ?? '—'
  const tutorLabel = request.tutor_name ?? '—'
  const phone      = request.tutor_phone

  function submit() {
    setErr(null)
    startTransition(async () => {
      let res: { ok?: true; error?: string } | { ok: true; appointmentId: string }
      if (tab === 'approve') {
        res = await approveAppointmentRequest(request.id, { notes: notes || undefined })
      } else if (tab === 'propose') {
        res = await proposeAlternativeSlot(request.id, propDate, propTime, notes || undefined)
      } else {
        if (!rejectMsg.trim()) { setErr('Informe o motivo da recusa.'); return }
        res = await rejectAppointmentRequest(request.id, rejectMsg)
      }
      if ('error' in res) { setErr(res.error); return }
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-sky-500" /> Validar Agendamento
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info do request */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-1.5 text-sm">
          <p className="flex items-center gap-2 text-slate-700">
            <PawPrint className="h-4 w-4 text-slate-400" />
            <span className="font-medium">{petLabel}</span>
            <span className="text-slate-400">· tutor: {tutorLabel}</span>
          </p>
          <p className="flex items-center gap-2 text-slate-600">
            <Clock className="h-4 w-4 text-slate-400" />
            Solicitado: {fmt(request.preferred_date, request.preferred_time)}
          </p>
          {request.preferred_date_alt && request.preferred_time_alt && (
            <p className="text-xs text-slate-400 pl-6">
              Alternativa: {fmt(request.preferred_date_alt, request.preferred_time_alt)}
            </p>
          )}
          {request.visit_reason && (
            <p className="text-xs text-slate-400 pl-6">Motivo: {request.visit_reason}</p>
          )}
          {phone && (
            <p className="text-xs text-slate-400 pl-6">WhatsApp: {phone}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {(['approve', 'propose', 'reject'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-2.5 text-xs font-semibold transition-colors',
                tab === t
                  ? t === 'approve' ? 'text-emerald-700 border-b-2 border-emerald-500'
                  : t === 'propose' ? 'text-sky-700 border-b-2 border-sky-500'
                  : 'text-rose-700 border-b-2 border-rose-500'
                  : 'text-slate-400 hover:text-slate-600',
              ].join(' ')}
            >
              {t === 'approve' ? 'Aprovar' : t === 'propose' ? 'Propor alternativa' : 'Recusar'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {tab === 'approve' && (
            <>
              <p className="text-sm text-slate-600">
                Confirma o agendamento no horário solicitado pelo tutor. O sistema cria o appointment e notifica via WhatsApp.
              </p>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Observações (opcional)</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="Ex: sala 2, trazer carteira de vacinação…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          {tab === 'propose' && (
            <>
              <p className="text-sm text-slate-600">Indique um horário disponível diferente do solicitado. O tutor será notificado.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Data</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    value={propDate}
                    onChange={e => setPropDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Horário</label>
                  <input
                    type="time"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    value={propTime}
                    onChange={e => setPropTime(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Observações (opcional)</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  placeholder="Ex: o MV solicitado só atende nas terças"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          {tab === 'reject' && (
            <>
              <p className="text-sm text-slate-600">O tutor receberá uma mensagem no WhatsApp informando a recusa.</p>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Motivo da recusa *</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="Ex: agenda lotada nessa semana. Ligue para verificar disponibilidade."
                  value={rejectMsg}
                  onChange={e => setRejectMsg(e.target.value)}
                />
              </div>
            </>
          )}

          {err && (
            <p className="text-sm text-rose-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className={[
              'px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-1.5 disabled:opacity-60',
              tab === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700'
              : tab === 'propose' ? 'bg-sky-600 hover:bg-sky-700'
              : 'bg-rose-600 hover:bg-rose-700',
            ].join(' ')}
          >
            {tab === 'approve' ? <><Check className="h-4 w-4" /> Aprovar</>
            : tab === 'propose' ? <><CalendarClock className="h-4 w-4" /> Propor</>
            : <><XCircle className="h-4 w-4" /> Recusar</>}
          </button>
        </div>
      </div>
    </div>
  )
}
