'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { getPortalFreeSlots, submitPortalBooking } from '@/lib/actions/portal-booking'

type Mode = 'reception' | 'direct'
interface Vet { id: string; name: string }
interface Service { id: string; name: string; durationMinutes: number | null }

interface Props {
  petId: string
  petName: string
  mode: Mode
  vets: Vet[]
  suggestedVetId: string | null
  services?: Service[]
}

const REASONS = ['Consulta', 'Retorno', 'Vacinação', 'Exame', 'Banho e Tosa', 'Outro']

export default function PortalBookingForm({ petId, petName, mode, vets, suggestedVetId, services = [] }: Props) {
  const router = useRouter()
  const [vetId, setVetId] = useState(suggestedVetId ?? (mode === 'reception' ? '' : vets[0]?.id ?? ''))
  const [serviceId, setServiceId] = useState('')
  const [reason, setReason] = useState('Consulta')
  const selectedDuration = services.find(s => s.id === serviceId)?.durationMinutes ?? null
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [altDate, setAltDate] = useState('')
  const [altTime, setAltTime] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ mode: 'reception' | 'direct'; when?: string } | null>(null)

  const today = new Date().toISOString().split('T')[0]

  // modo direto: carrega horários livres ao escolher vet + data
  useEffect(() => {
    if (mode !== 'direct' || !vetId || !date) { setSlots([]); return }
    let active = true
    setLoadingSlots(true); setTime('')
    getPortalFreeSlots(petId, vetId, date, selectedDuration).then(r => {
      if (!active) return
      setLoadingSlots(false)
      setSlots('slots' in r ? r.slots : [])
    })
    return () => { active = false }
  }, [mode, vetId, date, petId, selectedDuration])

  async function submit() {
    setError(null)
    if (mode === 'direct' && (!vetId || !date || !time)) { setError('Escolha o veterinário, a data e um horário.'); return }
    if (mode === 'reception' && (!date || !time)) { setError('Escolha uma data e um horário de preferência.'); return }
    setSubmitting(true)
    const res = await submitPortalBooking({ petId, vetId: vetId || null, reason, serviceId: serviceId || null, date, time, altDate: altDate || null, altTime: altTime || null })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); return }
    if (res.mode === 'direct') setDone({ mode: 'direct', when: `${date.split('-').reverse().join('/')} às ${time}` })
    else setDone({ mode: 'reception' })
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {done.mode === 'direct' ? 'Consulta agendada!' : 'Solicitação enviada!'}
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          {done.mode === 'direct'
            ? `${petName} está agendado para ${done.when}.`
            : 'A recepção vai confirmar o melhor horário e você receberá um aviso.'}
        </p>
        <button onClick={() => router.push(`/portal/pet/${petId}`)}
                className="mt-5 px-4 py-2 text-sm font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50">
          Voltar ao pet
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-emerald-600" />
        <h2 className="text-base font-semibold text-slate-900">Agendar — {petName}</h2>
      </div>

      {mode === 'reception' && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Você escolhe a data e o horário de preferência; a recepção confirma e define o veterinário.
        </p>
      )}

      {/* Motivo / serviço */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">{services.length > 0 ? 'Serviço' : 'Motivo'}</label>
        {services.length > 0 ? (
          <select value={serviceId} onChange={e => { setServiceId(e.target.value); const s = services.find(x => x.id === e.target.value); setReason(s?.name ?? 'Consulta') }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecione…</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.durationMinutes ? ` (~${s.durationMinutes} min)` : ''}</option>)}
          </select>
        ) : (
          <select value={reason} onChange={e => setReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {/* Veterinário (obrigatório no direto; opcional/sugestão no intermediado) */}
      {vets.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Veterinário {mode === 'reception' && <span className="text-slate-400 font-normal">(preferência — opcional)</span>}
          </label>
          <select value={vetId} onChange={e => setVetId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {mode === 'reception' && <option value="">Sem preferência</option>}
            {vets.map(v => <option key={v.id} value={v.id}>{v.name}{v.id === suggestedVetId ? ' (seu veterinário)' : ''}</option>)}
          </select>
        </div>
      )}

      {/* Data */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Data</label>
        <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)}
               className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {/* Horário */}
      {mode === 'direct' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Horários livres</label>
          {!vetId || !date ? (
            <p className="text-xs text-slate-400">Escolha o veterinário e a data para ver os horários.</p>
          ) : loadingSlots ? (
            <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando…</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-amber-600">Sem horários livres nesse dia. Tente outra data.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map(s => (
                <button key={s} type="button" onClick={() => setTime(s)}
                        className={`rounded-lg border px-2 py-2 text-sm font-medium ${time === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Horário de preferência</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
                   className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">2ª opção — data</label>
              <input type="date" min={today} value={altDate} onChange={e => setAltDate(e.target.value)}
                     className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">2ª opção — horário</label>
              <input type="time" value={altTime} onChange={e => setAltTime(e.target.value)}
                     className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <button onClick={submit} disabled={submitting}
              className="w-full px-4 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
        {mode === 'direct' ? 'Confirmar agendamento' : 'Enviar solicitação'}
      </button>
    </div>
  )
}
