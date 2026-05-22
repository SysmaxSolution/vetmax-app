'use client'

import { useState, useEffect } from 'react'
import { X, CalendarOff, Loader2, Save, Plus, Trash2, RotateCw } from 'lucide-react'
import { DateInput, TimePicker } from '@/components/ui/DatePicker'
import { getClinicProfessionals, type ClinicProfessional } from '@/lib/actions/professionals'
import { createUnavailabilities, type Recurrence } from '@/lib/actions/unavailabilities'
import { localDateTimeToISO } from '@/lib/utils/datetime'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DateMode = 'range' | 'list'
type TimeMode = 'range' | 'blocks'

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return isoDateOnly(new Date())
}

function eachDay(start: string, end: string): string[] {
  if (!start || !end) return []
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  if (b.getTime() < a.getTime()) return []
  const out: string[] = []
  const cur = new Date(a)
  while (cur.getTime() <= b.getTime() && out.length < 400) {
    out.push(isoDateOnly(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none',    label: 'Não se repete' },
  { value: 'daily',   label: 'Diariamente' },
  { value: 'weekly',  label: 'Semanalmente' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'yearly',  label: 'Anualmente' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  defaultProfessionalId?: string
  onClose:    () => void
  onSuccess?: (count: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnavailabilityModal({ defaultProfessionalId, onClose, onSuccess }: Props) {
  const [professionals, setProfessionals] = useState<ClinicProfessional[]>([])
  const [loadingProfs, setLoadingProfs]   = useState(true)
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? '')
  const [title, setTitle]   = useState('')
  const [notes, setNotes]   = useState('')

  const [dateMode, setDateMode]     = useState<DateMode>('range')
  const [rangeStart, setRangeStart] = useState(todayStr())
  const [rangeEnd,   setRangeEnd]   = useState(todayStr())
  const [dateList,   setDateList]   = useState<string[]>([todayStr()])

  const [timeMode, setTimeMode]     = useState<TimeMode>('range')
  const [timeStart, setTimeStart]   = useState('08:00')
  const [timeEnd,   setTimeEnd]     = useState('18:00')
  const [timeBlocks, setTimeBlocks] = useState<{ start: string; end: string }[]>([
    { start: '08:00', end: '12:00' },
  ])

  const [recurrence, setRecurrence]               = useState<Recurrence>('none')
  const [recurrenceUntil, setRecurrenceUntil]     = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Load profissionais
  useEffect(() => {
    getClinicProfessionals().then(res => {
      setLoadingProfs(false)
      if ('error' in res) { setError(res.error); return }
      setProfessionals(res)
    })
  }, [])

  // Datas resultantes
  const resolvedDates: string[] = dateMode === 'range'
    ? eachDay(rangeStart, rangeEnd)
    : dateList.filter(Boolean)

  // Blocos de horário resultantes
  const resolvedBlocks: { start: string; end: string }[] = timeMode === 'range'
    ? [{ start: timeStart, end: timeEnd }]
    : timeBlocks.filter(b => b.start && b.end)

  const totalRows = resolvedDates.length * resolvedBlocks.length

  // ── Salvar ──
  async function handleSave() {
    setError(null)
    if (!professionalId) { setError('Selecione um profissional.'); return }
    if (resolvedDates.length === 0)  { setError('Adicione ao menos uma data.'); return }
    if (resolvedBlocks.length === 0) { setError('Adicione ao menos um horário.'); return }

    // Valida que todo bloco tem fim > início
    for (const b of resolvedBlocks) {
      if (b.start >= b.end) { setError(`Horário inválido: ${b.start} → ${b.end}.`); return }
    }

    const blocks = resolvedDates.flatMap(d =>
      resolvedBlocks.map(b => ({
        starts_at: localDateTimeToISO(d, b.start),
        ends_at:   localDateTimeToISO(d, b.end),
      }))
    )

    setSaving(true)
    const res = await createUnavailabilities({
      professional_id:  professionalId,
      title:            title.trim() || null,
      notes:            notes.trim() || null,
      blocks,
      recurrence,
      recurrence_until: recurrence !== 'none' ? (recurrenceUntil || null) : null,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess?.(res.count)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600">
              <CalendarOff className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Novo Evento / Indisponibilidade</h2>
              <p className="text-[11px] text-slate-500">Bloqueia horários na agenda do profissional</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Profissional */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              Profissional <span className="text-rose-500">*</span>
              {loadingProfs && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            </label>
            <select
              value={professionalId}
              onChange={e => setProfessionalId(e.target.value)}
              disabled={loadingProfs}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 bg-white"
            >
              <option value="">Selecione...</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.crmv ? `(CRMV: ${p.crmv})` : `(${p.role === 'vet' ? 'MV' : 'Aux.'})`}
                </option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Título (opcional)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Férias, Congresso, Almoço estendido..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* DATAS */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Datas</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`px-2.5 py-1 transition-colors ${dateMode === 'range' ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  Intervalo
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode('list')}
                  className={`px-2.5 py-1 transition-colors border-l border-slate-200 ${dateMode === 'list' ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  Datas específicas
                </button>
              </div>
            </div>

            {dateMode === 'range' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">De</p>
                  <DateInput value={rangeStart} onChange={setRangeStart} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Até</p>
                  <DateInput value={rangeEnd} onChange={setRangeEnd} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {dateList.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <DateInput value={d} onChange={(v) => setDateList(prev => prev.map((x, j) => j === i ? v : x))} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setDateList(prev => prev.filter((_, j) => j !== i))}
                      disabled={dateList.length === 1}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDateList(prev => [...prev, todayStr()])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  <Plus className="h-3 w-3" /> Adicionar data
                </button>
              </div>
            )}
          </div>

          {/* HORÁRIOS */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Horários</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setTimeMode('range')}
                  className={`px-2.5 py-1 transition-colors ${timeMode === 'range' ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  Intervalo
                </button>
                <button
                  type="button"
                  onClick={() => setTimeMode('blocks')}
                  className={`px-2.5 py-1 transition-colors border-l border-slate-200 ${timeMode === 'blocks' ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  Múltiplos blocos
                </button>
              </div>
            </div>

            {timeMode === 'range' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Das</p>
                  <TimePicker value={timeStart} onChange={setTimeStart} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Às</p>
                  <TimePicker value={timeEnd} onChange={setTimeEnd} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {timeBlocks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <TimePicker value={b.start} onChange={(v) => setTimeBlocks(prev => prev.map((x, j) => j === i ? { ...x, start: v } : x))} />
                      <TimePicker value={b.end}   onChange={(v) => setTimeBlocks(prev => prev.map((x, j) => j === i ? { ...x, end:   v } : x))} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setTimeBlocks(prev => prev.filter((_, j) => j !== i))}
                      disabled={timeBlocks.length === 1}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTimeBlocks(prev => [...prev, { start: '14:00', end: '18:00' }])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  <Plus className="h-3 w-3" /> Adicionar bloco
                </button>
              </div>
            )}
          </div>

          {/* RECORRÊNCIA */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <RotateCw className="h-3.5 w-3.5 text-slate-400" /> Recorrência
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {RECURRENCE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRecurrence(o.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    recurrence === o.value
                      ? 'bg-rose-600 border-rose-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {recurrence !== 'none' && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Repetir até (opcional)</p>
                <DateInput value={recurrenceUntil} onChange={setRecurrenceUntil} placeholder="Sem limite" />
                <p className="text-[10px] text-slate-400 mt-1">
                  Se vazio, repete por até 1 ano a partir da data inicial.
                </p>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Detalhes para a equipe..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-none focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* Resumo */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Resumo:</span>{' '}
            {totalRows > 0
              ? <>Serão criados <span className="font-bold text-rose-600">{totalRows}</span> bloqueio{totalRows !== 1 ? 's' : ''}
                  {' '}({resolvedDates.length} data{resolvedDates.length !== 1 ? 's' : ''} × {resolvedBlocks.length} bloco{resolvedBlocks.length !== 1 ? 's' : ''} de horário)
                  {recurrence !== 'none' && <> com repetição <span className="font-semibold">{RECURRENCE_OPTIONS.find(o => o.value === recurrence)?.label.toLowerCase()}</span></>}.
                </>
              : 'Adicione datas e horários para visualizar o resumo.'
            }
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || totalRows === 0 || !professionalId}
            onClick={handleSave}
            className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar Evento</>}
          </button>
        </div>
      </div>
    </div>
  )
}
