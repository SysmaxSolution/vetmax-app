'use client'

import { useState } from 'react'
import { Clock, Save, Loader2, ToggleLeft, ToggleRight, Sun } from 'lucide-react'
import { updateClinicConfig, type BusinessHours, type ClinicConfig } from '@/lib/actions/clinic-settings'
import { TimePicker } from '@/components/ui/DatePicker'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: keyof BusinessHours; label: string; iso: number }[] = [
  { key: 'monday',    label: 'Segunda-feira', iso: 1 },
  { key: 'tuesday',   label: 'Terça-feira',   iso: 2 },
  { key: 'wednesday', label: 'Quarta-feira',  iso: 3 },
  { key: 'thursday',  label: 'Quinta-feira',  iso: 4 },
  { key: 'friday',    label: 'Sexta-feira',   iso: 5 },
  { key: 'saturday',  label: 'Sábado',        iso: 6 },
  { key: 'sunday',    label: 'Domingo',       iso: 7 },
]

const DEFAULT_HOURS = { open: '08:00', close: '18:00' }

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BusinessHoursTab({ initialConfig, onToast }: Props) {
  const [hours, setHours] = useState<BusinessHours>(
    initialConfig?.business_hours ?? {
      monday:    DEFAULT_HOURS,
      tuesday:   DEFAULT_HOURS,
      wednesday: DEFAULT_HOURS,
      thursday:  DEFAULT_HOURS,
      friday:    DEFAULT_HOURS,
      saturday:  { open: '08:00', close: '12:00' },
      sunday:    null,
    }
  )
  const [holidayWork, setHolidayWork] = useState(initialConfig?.holiday_work ?? false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  function toggleDay(key: keyof BusinessHours) {
    setHours(prev => ({
      ...prev,
      [key]: prev[key] ? null : { ...DEFAULT_HOURS },
    }))
  }

  function setTime(key: keyof BusinessHours, field: 'open' | 'close', value: string) {
    setHours(prev => ({
      ...prev,
      [key]: prev[key] ? { ...(prev[key] as { open: string; close: string }), [field]: value } : null,
    }))
  }

  function validateHours(): string | null {
    for (const day of DAYS) {
      const entry = hours[day.key]
      if (!entry) continue
      if (entry.open >= entry.close) {
        return `${day.label}: horário de fechamento deve ser após o de abertura.`
      }
    }
    return null
  }

  async function handleSave() {
    const validationError = validateHours()
    if (validationError) { onToast('error', validationError); return }

    setSaving(true)
    setSavedMsg('Horário comercial salvo com sucesso!')
    const res = await updateClinicConfig({ business_hours: hours, holiday_work: holidayWork })
    setSaving(false)
    if ('error' in res) {
      setSavedMsg('')
      onToast('error', res.error)
      return
    }
    onToast('success', 'Horário comercial salvo!')
    setTimeout(() => setSavedMsg(''), 8000)
  }

  const workingDays = DAYS.filter(d => hours[d.key] !== null).map(d => d.iso)

  return (
    <div className="space-y-6">
      {/* ── Horários por Dia ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Horário de Funcionamento</h3>
            <p className="text-xs text-slate-500">
              Dias ativos: {workingDays.length} — usados para validar agendamentos
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {DAYS.map(day => {
            const entry = hours[day.key]
            const isOpen = entry !== null

            return (
              <div
                key={day.key}
                data-testid={`day-row-${day.key}`}
                className={`px-4 sm:px-6 py-3 transition-colors ${isOpen ? 'bg-white' : 'bg-slate-50'}`}
              >
                {/* Linha superior: toggle + nome do dia */}
                <div className="flex items-center gap-3">
                  <button
                    id={`toggle-day-${day.key}`}
                    data-testid={`toggle-day-${day.key}`}
                    onClick={() => toggleDay(day.key)}
                    className={`flex-shrink-0 transition-colors ${isOpen ? 'text-teal-600' : 'text-slate-300'}`}
                    title={isOpen ? 'Clique para fechar este dia' : 'Clique para abrir este dia'}
                  >
                    {isOpen
                      ? <ToggleRight className="h-6 w-6" />
                      : <ToggleLeft  className="h-6 w-6" />}
                  </button>

                  <span className={`min-w-[8rem] text-sm font-medium ${isOpen ? 'text-slate-800' : 'text-slate-400'}`}>
                    {day.label}
                  </span>

                  {/* Desktop: horários inline; mobile: "Fechado" inline */}
                  {!isOpen && (
                    <span className="text-xs text-slate-400 italic">Fechado</span>
                  )}
                  {isOpen && (
                    <div className="hidden sm:flex items-center gap-2">
                      <label className="text-xs text-slate-500">Abre</label>
                      <TimePicker
                        id={`open-${day.key}`}
                        value={entry!.open}
                        onChange={v => setTime(day.key, 'open', v)}
                        className="w-24"
                      />
                      <span className="text-slate-400 text-xs">até</span>
                      <label className="text-xs text-slate-500">Fecha</label>
                      <TimePicker
                        id={`close-${day.key}`}
                        value={entry!.close}
                        onChange={v => setTime(day.key, 'close', v)}
                        className="w-24"
                      />
                    </div>
                  )}
                </div>

                {/* Mobile: horários abaixo do nome do dia */}
                {isOpen && (
                  <div className="sm:hidden mt-2 pl-9 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-slate-500">Abre</label>
                      <TimePicker
                        id={`open-${day.key}-m`}
                        value={entry!.open}
                        onChange={v => setTime(day.key, 'open', v)}
                        className="w-24"
                      />
                    </div>
                    <span className="text-slate-400 text-xs">até</span>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-slate-500">Fecha</label>
                      <TimePicker
                        id={`close-${day.key}-m`}
                        value={entry!.close}
                        onChange={v => setTime(day.key, 'close', v)}
                        className="w-24"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Feriados ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Sun className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Atendimento em Feriados</h3>
              <p className="text-xs text-slate-500">
                {holidayWork
                  ? 'A clínica funciona em feriados nacionais'
                  : 'Agendamentos em feriados serão bloqueados automaticamente'}
              </p>
            </div>
          </div>
          <button
            id="toggle-holiday-work"
            data-testid="toggle-holiday-work"
            onClick={() => setHolidayWork(v => !v)}
            className={`transition-colors ${holidayWork ? 'text-amber-500' : 'text-slate-300'}`}
          >
            {holidayWork
              ? <ToggleRight className="h-7 w-7" />
              : <ToggleLeft  className="h-7 w-7" />}
          </button>
        </div>
      </div>

      {/* ── Salvar ───────────────────────────────────────────────────────────── */}
      <button
        id="btn-save-business-hours"
        data-testid="btn-save-business-hours"
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {saving
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
          : <><Save className="h-4 w-4" /> Salvar Horário Comercial</>}
      </button>

      {savedMsg && (
        <div
          data-testid="business-hours-saved-msg"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 font-medium text-center"
        >
          {savedMsg}
        </div>
      )}
    </div>
  )
}
