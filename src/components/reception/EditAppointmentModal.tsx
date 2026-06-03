'use client'

import { useState, useEffect } from 'react'
import { X, CalendarDays, Loader2, Save, MessageCircle } from 'lucide-react'
import { getAppointmentById, updateAppointment } from '@/lib/actions/appointments'
import { getProfessionalSlots, checkProfessionalAvailability } from '@/lib/actions/appointment-slots'
import { getClinicProfessionals, type ClinicProfessional } from '@/lib/actions/professionals'
import { sendWhatsAppMessage } from '@/lib/actions/whatsapp'
import { DateInput, TimePicker } from '@/components/ui/DatePicker'
import { localDateTimeToISO } from '@/lib/utils/datetime'
import TimeWheelPicker from '@/components/ui/TimeWheelPicker'
import type { BookedRange } from '@/lib/actions/appointment-slots'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

import { VISIT_REASON_LABELS } from '@/lib/visit-reasons'

const REASON_LABELS: Record<string, string> = VISIT_REASON_LABELS

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

interface Props {
  appointmentId: string
  onClose:       () => void
  onSuccess?:    () => void
}

export default function EditAppointmentModal({ appointmentId, onClose, onSuccess }: Props) {
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState<string | null>(null)
  const [saving,  setSaving]    = useState(false)

  // Appointment data
  const [petName,    setPetName]    = useState('')
  const [petSpecies, setPetSpecies] = useState('dog')
  const [tutorName,  setTutorName]  = useState('')
  const [tutorPhone, setTutorPhone] = useState('')
  const [tutorId,    setTutorId]    = useState('')
  const [reason,     setReason]     = useState('')
  const [origDate,   setOrigDate]   = useState('')
  const [origTime,   setOrigTime]   = useState('')
  const [origProfId, setOrigProfId] = useState<string | null>(null)

  // Edit fields
  const [date,           setDate]           = useState('')
  const [time,           setTime]           = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [notes,          setNotes]          = useState('')

  // Slots
  const [professionals,    setProfessionals]    = useState<ClinicProfessional[]>([])
  const [bookedTimes,      setBookedTimes]      = useState<string[]>([])
  const [bookedRanges,     setBookedRanges]     = useState<BookedRange[]>([])
  const [intervalMinutes,  setIntervalMinutes]  = useState(60)
  const [loadingSlots,     setLoadingSlots]     = useState(false)
  const [loadingProfs,     setLoadingProfs]     = useState(true)
  const [wheelTime,        setWheelTime]        = useState<string | null>(null)

  // Post-save WhatsApp
  const [saved,           setSaved]           = useState(false)
  const [sendWpp,         setSendWpp]         = useState(true)
  const [sendingWpp,      setSendingWpp]      = useState(false)

  // ── Load appointment ──────────────────────────────────────────────────────────
  useEffect(() => {
    getAppointmentById(appointmentId).then(res => {
      setLoading(false)
      if ('error' in res) { setError(res.error); return }

      const dt = new Date(res.appointment_datetime)
      const d  = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const t  = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`

      setPetName(res.patient.name)
      setPetSpecies(res.patient.species)
      setTutorName(res.tutor.name)
      setTutorPhone(res.tutor.phone)
      setTutorId(res.tutor_id)
      setReason(res.reason)
      setNotes(res.notes ?? '')
      setOrigDate(d); setDate(d)
      setOrigTime(t); setTime(t)
      setOrigProfId(res.professional_id)
      setProfessionalId(res.professional_id ?? '')
    })

    getClinicProfessionals().then(res => {
      setLoadingProfs(false)
      if ('error' in res) { console.error('Erro ao buscar profissionais:', res.error); return }
      setProfessionals(res)
    })
  }, [appointmentId])

  // ── Load slots ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!professionalId || !date) { setBookedTimes([]); setBookedRanges([]); return }
    setLoadingSlots(true)
    getProfessionalSlots(professionalId, date, appointmentId).then(res => {
      setLoadingSlots(false)
      if ('error' in res) return
      setBookedTimes(res.bookedTimes)
      setBookedRanges(res.bookedRanges)
      setIntervalMinutes(res.intervalMinutes)
    })
  }, [professionalId, date, appointmentId])

  // ── Time slots grid (grade + starts quebrados) ────────────────────────────────
  function buildTimeSlots(): string[] {
    const step = intervalMinutes > 0 ? intervalMinutes : 60
    const set  = new Set<string>()
    for (let m = 7 * 60; m <= 19 * 60; m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0')
      const mm = String(m % 60).padStart(2, '0')
      set.add(`${hh}:${mm}`)
    }
    for (const r of bookedRanges) set.add(r.start)
    // Garante que o horário atual do appointment editado apareça na grade
    if (time) set.add(time)
    return Array.from(set).sort()
  }
  const timeSlots = buildTimeSlots()

  function rangeFor(slot: string): { start: string; end: string } {
    const [h, m] = slot.split(':').map(Number)
    const start = h * 60 + m
    const end = Math.min(start + intervalMinutes, 24 * 60 - 1)
    return {
      start: slot,
      end:   `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
    }
  }

  // ── Detect changes ────────────────────────────────────────────────────────────
  const dateChanged = date !== origDate
  const timeChanged = time !== origTime
  const profChanged = professionalId !== (origProfId ?? '')
  const hasChanges  = dateChanged || timeChanged || profChanged

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!date || !time) { setError('Selecione data e horário.'); return }

    if (professionalId && hasChanges) {
      const check = await checkProfessionalAvailability(professionalId, date, time, appointmentId)
      if ('error' in check) { setError(check.error); return }
      if (!check.available) {
        setError('Horário indisponível para este profissional.')
        return
      }
    }

    setSaving(true); setError(null)
    const res = await updateAppointment(appointmentId, {
      appointment_datetime: localDateTimeToISO(date, time),
      professional_id:      professionalId || null,
      notes:                notes.trim() || null,
    })
    setSaving(false)

    if ('error' in res) { setError(res.error); return }
    setSaved(true)
    onSuccess?.()
  }

  // ── Send WhatsApp & close ─────────────────────────────────────────────────────
  async function handleFinish() {
    if (sendWpp && tutorPhone && hasChanges) {
      setSendingWpp(true)
      const [yyyy, mm, dd] = date.split('-')
      const dateLabel = `${dd}/${mm}/${yyyy}`
      const profName  = professionals.find(p => p.id === professionalId)?.full_name
      const profPart  = profName ? ` com ${profName}` : ''
      const msg =
        `Olá, ${tutorName}! 🐾\n` +
        `O agendamento do *${petName}* foi atualizado para *${dateLabel}* às *${time}*${profPart}.\n` +
        `Em caso de dúvidas, entre em contato conosco.`
      await sendWhatsAppMessage({
        phone: tutorPhone, message: msg,
        trigger: 'appointment_scheduled', tutorId, tutorName,
      }).catch(() => {/* best-effort */})
      setSendingWpp(false)
    }
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Editar Agendamento</h2>
              {petName && (
                <p className="text-xs text-slate-500">
                  {SPECIES_EMOJI[petSpecies] ?? '🐾'} {petName} · {tutorName}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        )}

        {/* Error on load */}
        {!loading && error && !saved && (
          <div className="px-5 py-5 text-sm text-red-600 bg-red-50">{error}</div>
        )}

        {/* Post-save: WhatsApp confirmation */}
        {saved && (
          <div className="px-5 py-5 space-y-4">
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm font-semibold text-green-800">Agendamento atualizado!</p>
            </div>

            {hasChanges && tutorPhone && (
              <>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setSendWpp(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sendWpp ? 'bg-teal-500' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${sendWpp ? 'translate-x-4' : 'translate-x-1'}`} />
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <MessageCircle className="h-3.5 w-3.5 text-teal-500" />
                    Notificar tutor via WhatsApp
                  </span>
                </label>

                {sendWpp && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-0.5">
                    <p className="font-semibold text-slate-700 mb-1">Prévia da mensagem:</p>
                    <p>Olá, {tutorName}! 🐾</p>
                    <p>O agendamento do <b>{petName}</b> foi atualizado para <b>{date.split('-').reverse().join('/')}</b> às <b>{time}</b>
                      {professionalId && professionals.find(p => p.id === professionalId)
                        ? ` com ${professionals.find(p => p.id === professionalId)!.full_name}`
                        : ''}.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
              {hasChanges && tutorPhone && (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={sendingWpp}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sendingWpp
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                    : sendWpp ? <><MessageCircle className="h-4 w-4" /> Enviar e Fechar</> : 'Fechar'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Edit form */}
        {!loading && !saved && !error && (
          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Motivo (read-only) */}
            {reason && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                Motivo: <span className="font-semibold">{REASON_LABELS[reason] ?? reason}</span>
              </div>
            )}

            {/* Profissional */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                Profissional
                {loadingProfs && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              </label>
              <select
                value={professionalId}
                onChange={e => { setProfessionalId(e.target.value); setTime('') }}
                disabled={loadingProfs}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 bg-white"
              >
                <option value="">Sem preferência</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.crmv ? `(CRMV: ${p.crmv})` : `(${p.role === 'vet' ? 'MV' : 'Aux.'})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data</label>
              <DateInput
                value={date}
                onChange={d => { setDate(d); setTime('') }}
                min={todayStr()}
                required
                placeholder="DD/MM/AAAA"
              />
            </div>

            {/* Horário */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                Horário <span className="text-[10px] text-slate-400 font-normal">· bloco de {intervalMinutes}min</span>
                {loadingSlots && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              </label>
              {professionalId && date ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {timeSlots.map(slot => {
                      const occupied = slot !== time && bookedTimes.includes(slot)
                      const selected = time === slot
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={occupied}
                          onClick={() => setWheelTime(slot)}
                          title={occupied
                            ? `Ocupado (${slot} – ${rangeFor(slot).end})`
                            : `Clique para ajustar (${slot} – ${rangeFor(slot).end})`
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            selected
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                              : occupied
                                ? 'bg-slate-100 border-slate-200 text-slate-300 line-through cursor-not-allowed'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-700'
                          }`}
                        >
                          {slot}
                        </button>
                      )
                    })}
                  </div>
                  {time && (
                    <p className="mt-2 text-[11px] text-blue-700">
                      Selecionado: <span className="font-semibold">{time} – {rangeFor(time).end}</span>
                      {' · '}
                      <button type="button" onClick={() => setWheelTime(time)} className="underline hover:text-blue-800">
                        ajustar minutos
                      </button>
                    </p>
                  )}
                </>
              ) : (
                <TimePicker value={time} onChange={setTime} />
              )}
            </div>

            {wheelTime !== null && (
              <TimeWheelPicker
                initialValue={wheelTime}
                durationMinutes={intervalMinutes}
                blockedRanges={bookedRanges}
                onCancel={() => setWheelTime(null)}
                onConfirm={(v) => { setTime(v); setWheelTime(null) }}
              />
            )}

            {/* Notas */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações (opcional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !date || !time}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                  : <><Save className="h-4 w-4" /> Salvar Alterações</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
