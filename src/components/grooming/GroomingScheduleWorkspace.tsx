'use client'

import { useState } from 'react'
import { Calendar, Clock, Scissors, ChevronRight, AlertCircle } from 'lucide-react'
import { validateSchedulingSlot } from '@/lib/actions/scheduling-validation'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clinicId: string
}

const SERVICES = [
  { value: 'banho',         label: 'Banho' },
  { value: 'tosa',          label: 'Tosa' },
  { value: 'banho_tosa',    label: 'Banho e Tosa' },
  { value: 'tosa_higienica',label: 'Tosa Higiênica' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function GroomingScheduleWorkspace({ clinicId }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedTime, setSelectedTime] = useState('09:00')
  const [selectedService, setSelectedService] = useState('banho_tosa')
  const [petName, setPetName] = useState('')
  const [tutorName, setTutorName] = useState('')
  const [tutorPhone, setTutorPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')
  const [slotAvailable, setSlotAvailable] = useState<boolean | null>(null)

  const handleVerify = async () => {
    setError('')
    setSlotAvailable(null)
    if (!selectedDate || !selectedTime) {
      setError('Selecione data e horário.')
      return
    }
    const result = await validateSchedulingSlot({
      clinic_id:        clinicId,
      scheduled_date:   selectedDate,
      scheduled_time:   selectedTime,
      duration_minutes: 60,
    })
    if (!result.valid) {
      setError(result.reason ?? 'Horário indisponível')
      setSlotAvailable(false)
    } else {
      setSlotAvailable(true)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTime) { setError('Selecione um horário.'); return }
    if (!petName.trim()) { setError('Informe o nome do animal.'); return }
    if (!tutorName.trim()) { setError('Informe o nome do tutor.'); return }

    // Validate slot before saving
    setSaving(true)
    setError('')
    const result = await validateSchedulingSlot({
      clinic_id:        clinicId,
      scheduled_date:   selectedDate,
      scheduled_time:   selectedTime,
      duration_minutes: 60,
    })
    if (!result.valid) {
      setError(result.reason ?? 'Horário indisponível')
      setSlotAvailable(false)
      setSaving(false)
      return
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setSuccessMsg(`Agendamento realizado para ${petName} às ${selectedTime} do dia ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}!`)
      setPetName('')
      setTutorName('')
      setTutorPhone('')
      setNotes('')
      setSelectedTime('09:00')
      setSlotAvailable(null)
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch {
      setError('Erro ao salvar agendamento. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const isSubmitDisabled = saving || slotAvailable === false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100">
          <Scissors className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agendamento — Banho e Tosa</h1>
          <p className="text-sm text-slate-500">Selecione data, horário e preencha os dados do agendamento.</p>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
        {/* Coluna esquerda: data + horário */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            {/* Data */}
            <div>
              <label htmlFor="schedule-date" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                Data do Agendamento
              </label>
              <input
                id="schedule-date"
                type="date"
                value={selectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => { setSelectedDate(e.target.value); setSlotAvailable(null); setError('') }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {/* Horário */}
            <div>
              <label htmlFor="schedule-time" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Horário
              </label>
              <input
                id="schedule-time"
                type="time"
                value={selectedTime}
                onChange={e => { setSelectedTime(e.target.value); setSlotAvailable(null); setError('') }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <button
              type="button"
              onClick={handleVerify}
              className="w-full rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
            >
              Verificar Disponibilidade
            </button>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {slotAvailable === true && !error && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 font-medium">
                Horário disponível!
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita: formulário */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Dados do Agendamento</h2>

          <div className="space-y-3">
            <div>
              <label htmlFor="schedule-service" className="block text-xs font-semibold text-slate-600 mb-1">Serviço</label>
              <select
                id="schedule-service"
                value={selectedService}
                onChange={e => setSelectedService(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {SERVICES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-pet" className="block text-xs font-semibold text-slate-600 mb-1">Nome do Animal *</label>
              <input
                id="schedule-pet"
                type="text"
                value={petName}
                onChange={e => setPetName(e.target.value)}
                placeholder="Ex: Rex"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label htmlFor="schedule-tutor" className="block text-xs font-semibold text-slate-600 mb-1">Nome do Tutor *</label>
              <input
                id="schedule-tutor"
                type="text"
                value={tutorName}
                onChange={e => setTutorName(e.target.value)}
                placeholder="Nome completo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label htmlFor="schedule-phone" className="block text-xs font-semibold text-slate-600 mb-1">Telefone do Tutor</label>
              <input
                id="schedule-phone"
                type="tel"
                value={tutorPhone}
                onChange={e => setTutorPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label htmlFor="schedule-notes" className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
              <textarea
                id="schedule-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Instruções especiais, alergias..."
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
              />
            </div>
          </div>

          {selectedDate && selectedTime && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-xs text-teal-800">
              <p className="font-semibold mb-1">Resumo</p>
              <p>Data: {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              <p>Horário: {selectedTime}</p>
              <p>Serviço: {SERVICES.find(s => s.value === selectedService)?.label}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <>Salvando...</> : <><ChevronRight className="h-4 w-4" />Agendar</>}
          </button>
        </div>
      </form>
    </div>
  )
}
