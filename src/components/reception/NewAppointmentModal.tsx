'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Search, CalendarDays, Scissors, Tag, DollarSign, Loader2, Save, Calendar, MessageCircle } from 'lucide-react'
import { getPatientsList, type PatientsListItem } from '@/lib/actions/timeline'
import { createAppointment } from '@/lib/actions/appointments'
import { createGroomingSession, getGroomingCatalog, updateGroomingPricing, type GroomingCatalogItem, type GroomingServicePrice } from '@/lib/actions/grooming'
import { sendWhatsAppMessage } from '@/lib/actions/whatsapp'
import { useModules } from '@/components/providers/ModulesProvider'
import { DateInput, TimePicker, DateTimePicker } from '@/components/ui/DatePicker'
import { getClinicProfessionals, checkProfessionalAvailability, type ClinicProfessional } from '@/lib/actions/professionals'

// ─── Constants ────────────────────────────────────────────────────────────────

const VISIT_REASON_OPTIONS = [
  { value: 'consultation', label: 'Consulta',         moduleKey: 'consultation' },
  { value: 'follow_up',    label: 'Retorno',          moduleKey: 'consultation' },
  { value: 'emergency',    label: 'Emergência',       moduleKey: null },
  { value: 'vaccination',  label: 'Vacinação',        moduleKey: null },
  { value: 'exam',         label: 'Exame',            moduleKey: 'exams' },
  { value: 'surgery',      label: 'Cirurgia',         moduleKey: 'consultation' },
  { value: 'grooming',     label: '✂️ Banho e Tosa', moduleKey: 'grooming' },
]

const DEFAULT_SERVICES = [
  'Banho Simples', 'Banho Completo', 'Tosa Higiênica', 'Tosa Completa',
  'Tosa na Tesoura', 'Tosa Bebê', 'Hidratação', 'Escovação',
  'Limpeza de Ouvidos', 'Corte de Unhas', 'Secagem Completa', 'Perfume', 'Bandana / Laço',
]

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DefaultPet {
  id:        string
  name:      string
  species:   string
  tutorId:   string
  tutorName: string
}

interface Props {
  onClose:       () => void
  onSuccess?:    (petName: string) => void
  defaultPet?:   DefaultPet
  defaultDate?:  string
  defaultReason?: string
}

function mapMotivoToReason(motivo: string): string {
  const m = motivo.toLowerCase()
  if (m === 'retorno')                        return 'follow_up'
  if (m === 'vacinação' || m === 'vacinacao') return 'vaccination'
  if (m === 'exame')                          return 'exam'
  if (m === 'cirurgia')                       return 'surgery'
  if (m === 'banho e tosa' || m === 'grooming') return 'grooming'
  return 'consultation'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewAppointmentModal({ onClose, onSuccess, defaultPet, defaultDate, defaultReason }: Props) {
  const activeModules = useModules()
  const [step, setStep]               = useState<'search' | 'form'>(defaultPet ? 'form' : 'search')
  const [selectedPet, setSelectedPet] = useState<PatientsListItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults]         = useState<PatientsListItem[]>([])
  const [searching, setSearching]     = useState(false)

  const [date,       setDate]       = useState(defaultDate ?? '')
  const [time,       setTime]       = useState('09:00')
  const [reason,     setReason]     = useState(defaultReason ? mapMotivoToReason(defaultReason) : 'consultation')
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [error,      setError]              = useState<string | null>(null)
  const [sendConfirmation, setSendConfirmation] = useState(true)
  const [professionalId, setProfessionalId]             = useState('')
  const [professionals, setProfessionals]               = useState<ClinicProfessional[]>([])
  const [availabilityWarning, setAvailabilityWarning]   = useState<string | null>(null)

  // Load professionals on mount
  useEffect(() => {
    getClinicProfessionals().then(res => {
      if (!('error' in res)) setProfessionals(res)
    })
  }, [])

  // G-11: valida disponibilidade quando profissional + data + hora mudam
  useEffect(() => {
    if (!professionalId || !date || !time) { setAvailabilityWarning(null); return }
    checkProfessionalAvailability(professionalId, date, time).then(res => {
      if ('error' in res) { setAvailabilityWarning(null); return }
      setAvailabilityWarning(res.available ? null : (res.reason ?? 'Profissional pode não estar disponível neste horário.'))
    })
  }, [professionalId, date, time])

  // ── Grooming inline fields ──
  const [groomingServices,  setGroomingServices]  = useState<string[]>([])
  const [groomingDate,      setGroomingDate]      = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [groomingBox,       setGroomingBox]       = useState('')
  const [groomingNotes,     setGroomingNotes]     = useState('')
  const [groomingGroomerId, setGroomingGroomerId] = useState('')
  const [catalog,           setCatalog]           = useState<GroomingCatalogItem[]>([])
  const [catalogLoaded,     setCatalogLoaded]     = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isGrooming = reason === 'grooming'

  // Load grooming catalog when grooming is selected
  useEffect(() => {
    if (reason !== 'grooming' || catalogLoaded) return
    getGroomingCatalog().then(res => {
      if (!('error' in res)) setCatalog(res)
      setCatalogLoaded(true)
    })
  }, [reason, catalogLoaded])

  // Debounced pet search
  useEffect(() => {
    if (step !== 'search') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (searchQuery.trim().length < 2) { setResults([]); return }

    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const res = await getPatientsList(searchQuery.trim())
      setSearching(false)
      if (!('error' in res)) setResults(res)
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery, step])

  function handleSelectPet(p: PatientsListItem) {
    setSelectedPet(p)
    setResults([])
    setStep('form')
  }

  // ── Grooming helpers ──
  const catalogNames    = catalog.map(c => c.name)
  const extraDefaults   = DEFAULT_SERVICES.filter(s => !catalogNames.includes(s))
  const servicesDisplay = catalogLoaded
    ? [...catalog.map(c => c.name), ...extraDefaults]
    : DEFAULT_SERVICES

  function getPriceForService(name: string): number | null {
    const item = catalog.find(c => c.name.toLowerCase() === name.toLowerCase())
    return item ? item.price : null
  }

  function getServicePrices(): GroomingServicePrice[] {
    return groomingServices.map(svc => ({ name: svc, price: getPriceForService(svc) ?? 0 }))
  }

  const subtotal  = getServicePrices().reduce((sum, s) => sum + s.price, 0)
  const hasPrices = subtotal > 0

  function toggleService(svc: string) {
    setGroomingServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc])
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const petId      = defaultPet?.id        ?? selectedPet?.id
    const tutorId    = defaultPet?.tutorId   ?? selectedPet?.tutor.id
    const petName    = defaultPet?.name      ?? selectedPet?.name ?? 'Pet'
    const petSpecies = defaultPet?.species   ?? selectedPet?.species ?? ''
    const tutorName  = defaultPet?.tutorName ?? selectedPet?.tutor.name ?? ''

    if (!petId || !tutorId) { setError('Selecione um pet válido.'); return }

    // ── Fluxo Banho e Tosa ──
    if (isGrooming) {
      if (groomingServices.length === 0) { setError('Selecione ao menos um serviço.'); return }
      setSubmitting(true)
      setError(null)

      const result = await createGroomingSession({
        patient_id:         petId,
        tutor_id:           tutorId,
        services_requested: groomingServices,
        box_number:         groomingBox.trim() || undefined,
        notes:              groomingNotes.trim() || undefined,
        scheduled_at:       groomingDate || undefined,
        groomer_id:         groomingGroomerId || undefined,
      })

      if ('error' in result) { setSubmitting(false); setError(result.error); return }

      if (hasPrices) await updateGroomingPricing(result.id, getServicePrices(), 0)

      setSubmitting(false)
      onSuccess?.(petName)
      onClose()
      return
    }

    // ── Fluxo Consulta ──
    if (!date || !time) { setError('Selecione a data e horário.'); return }

    setSubmitting(true)
    setError(null)

    const result = await createAppointment({
      pet_id:               petId,
      tutor_id:             tutorId,
      appointment_datetime: `${date}T${time}:00`,
      reason,
      notes:                notes.trim() || undefined,
      professional_id:      professionalId || undefined,
    })

    setSubmitting(false)
    if ('error' in result) { setError(result.error); return }

    const tutorPhone = selectedPet?.tutor.phone ?? ''
    if (sendConfirmation && tutorPhone) {
      const [yyyy, mm, dd] = date.split('-')
      const dateLabel = `${dd}/${mm}/${yyyy}`
      const reasonLabel = VISIT_REASON_OPTIONS.find(o => o.value === reason)?.label ?? reason
      const msg = `Olá, ${tutorName}! 🐾\nAgendamento confirmado: *${petName}* (${reasonLabel}) em *${dateLabel}* às *${time}*.\nEm caso de dúvidas, entre em contato conosco. Até breve!`
      sendWhatsAppMessage({ phone: tutorPhone, message: msg, trigger: 'appointment_scheduled', tutorId, tutorName })
        .catch(() => {/* best-effort */})
    }

    onSuccess?.(petName); onClose()
  }

  const currentPetName   = defaultPet?.name      ?? selectedPet?.name
  const currentTutorName = defaultPet?.tutorName ?? selectedPet?.tutor.name
  const currentSpecies   = defaultPet?.species   ?? selectedPet?.species ?? ''

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={`flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 ${isGrooming && step === 'form' ? 'bg-teal-50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isGrooming && step === 'form' ? 'bg-teal-600' : 'bg-teal-100'}`}>
              {isGrooming && step === 'form'
                ? <Scissors className="h-5 w-5 text-white" />
                : <CalendarDays className="h-5 w-5 text-teal-600" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isGrooming && step === 'form' ? 'Agendar Banho e Tosa' : 'Novo Agendamento'}
              </h2>
              {currentPetName && (
                <p className="text-xs text-slate-500">
                  {SPECIES_EMOJI[currentSpecies] ?? '🐾'} {currentPetName}
                  {currentTutorName && ` · ${currentTutorName}`}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Search pet */}
        {step === 'search' && (
          <div className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Buscar Animal</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  {searching
                    ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    : <Search className="h-4 w-4 text-slate-400" />}
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Nome do animal..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  autoFocus
                />
              </div>
            </div>

            {results.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
                {results.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPet(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left transition-colors"
                  >
                    <span className="text-xl">{SPECIES_EMOJI[p.species] ?? '🐾'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">Tutor: {p.tutor.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">Nenhum animal encontrado</p>
            )}
          </div>
        )}

        {/* Step 2: Form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {!defaultPet && (
              <button
                type="button"
                onClick={() => setStep('search')}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
              >
                ← Trocar animal
              </button>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Motivo da Visita</label>
              <select
                value={reason}
                onChange={e => { setReason(e.target.value); setError(null) }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {VISIT_REASON_OPTIONS
                  .filter(o => !o.moduleKey || activeModules.length === 0 || activeModules.includes(o.moduleKey))
                  .map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
              </select>
            </div>

            {/* Professional selector (non-grooming only) */}
            {!isGrooming && professionals.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Profissional (opcional)</label>
                <select
                  value={professionalId}
                  onChange={e => setProfessionalId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Sem preferência</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} {p.crmv ? `(CRMV: ${p.crmv})` : `(${p.role === 'vet' ? 'MV' : 'Aux.'})`}
                    </option>
                  ))}
                </select>
                {availabilityWarning && (
                  <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    ⚠️ {availabilityWarning}
                  </p>
                )}
              </div>
            )}

            {/* ══ BANHO E TOSA — campos inline ══ */}
            {isGrooming && (
              <>
                {/* Serviços */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                    Serviços <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {servicesDisplay.map(svc => {
                      const selected = groomingServices.includes(svc)
                      const price    = getPriceForService(svc)
                      return (
                        <button
                          key={svc}
                          type="button"
                          onClick={() => toggleService(svc)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1 ${
                            selected
                              ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'
                          }`}
                        >
                          {svc}
                          {price !== null && price > 0 && (
                            <span className={`text-[9px] font-bold ${selected ? 'text-teal-100' : 'text-teal-600'}`}>
                              R${price.toFixed(0)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Tosador */}
                {professionals.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Tosador / Banhista (opcional)
                    </label>
                    <select
                      value={groomingGroomerId}
                      onChange={e => setGroomingGroomerId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="">Sem preferência</option>
                      {professionals.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Data/hora do agendamento */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Data e Horário
                  </label>
                  <DateTimePicker
                    value={groomingDate}
                    onChange={setGroomingDate}
                    placeholder="Selecionar data e hora"
                  />
                  <p className="text-[10px] text-teal-600 mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Aparecerá na agenda e no Kanban de Banho e Tosa
                  </p>
                </div>

                {/* Box */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Box / Banheiro (opcional)
                  </label>
                  <input
                    type="text"
                    value={groomingBox}
                    onChange={e => setGroomingBox(e.target.value)}
                    placeholder="Ex: Box 1, Banheiro A..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Observações grooming */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Observações (opcional)
                  </label>
                  <textarea
                    value={groomingNotes}
                    onChange={e => setGroomingNotes(e.target.value)}
                    placeholder="Ex: Pet agressivo, alergia a perfume..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Resumo de preços */}
                {groomingServices.length > 0 && (
                  <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 space-y-2">
                    <p className="text-[10px] font-bold text-teal-600 uppercase flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Serviços selecionados
                    </p>
                    {hasPrices ? (
                      <div className="space-y-1">
                        {getServicePrices().map(sp => (
                          <div key={sp.name} className="flex justify-between text-xs">
                            <span className="text-teal-800">{sp.name}</span>
                            <span className="font-bold text-teal-700">
                              {sp.price > 0 ? `R$ ${sp.price.toFixed(2)}` : '—'}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-teal-300 pt-1 flex justify-between text-sm font-bold">
                          <span className="text-teal-800 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> Total
                          </span>
                          <span className="text-teal-700">R$ {subtotal.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-teal-800 font-medium">{groomingServices.join(', ')}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ══ CONSULTA — campos de data/hora e notas ══ */}
            {!isGrooming && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data</label>
                    <DateInput
                      value={date}
                      onChange={setDate}
                      min={todayStr()}
                      required
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Horário</label>
                    <TimePicker
                      value={time}
                      onChange={setTime}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações (opcional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ex: Pet com histórico de ansiedade, trazer resultado de exame..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-none focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </>
            )}

            {/* Toggle confirmação WhatsApp (apenas consultas) */}
            {!isGrooming && (
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setSendConfirmation(p => !p)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sendConfirmation ? 'bg-teal-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${sendConfirmation ? 'translate-x-4' : 'translate-x-1'}`} />
                </div>
                <span className="flex items-center gap-1.5 text-sm text-slate-600">
                  <MessageCircle className="h-3.5 w-3.5 text-teal-500" />
                  Enviar confirmação ao tutor via WhatsApp
                </span>
              </label>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || (!isGrooming && !date)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  isGrooming ? 'bg-teal-600 hover:bg-teal-700' : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                  : isGrooming
                    ? <><Scissors className="h-4 w-4" /> Agendar Banho e Tosa</>
                    : <><Save className="h-4 w-4" /> Confirmar Agendamento</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
