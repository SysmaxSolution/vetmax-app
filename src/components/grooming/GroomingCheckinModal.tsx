'use client'

import { useState, useEffect } from 'react'
import { X, Scissors, Loader2, Save, Calendar, DollarSign, Tag } from 'lucide-react'
import { createGroomingSession, getGroomingCatalog, updateGroomingPricing } from '@/lib/actions/grooming'
import type { GroomingCatalogItem, GroomingServicePrice } from '@/lib/actions/grooming'
import { getClinicProfessionals, type ClinicProfessional } from '@/lib/actions/professionals'
import { DateTimePicker } from '@/components/ui/DatePicker'

// ─── Serviços disponíveis (fallback sem catálogo) ─────────────────────────────

const DEFAULT_SERVICES = [
  'Banho Simples', 'Banho Completo', 'Tosa Higiênica', 'Tosa Completa',
  'Tosa na Tesoura', 'Tosa Bebê', 'Hidratação', 'Escovação',
  'Limpeza de Ouvidos', 'Corte de Unhas', 'Secagem Completa', 'Perfume', 'Bandana / Laço',
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patientId:   string
  patientName: string
  tutorId:     string
  tutorName:   string
  /** 'schedule' pré-abre o campo de data para forçar o usuário a escolher um horário futuro */
  initialMode?: 'checkin' | 'schedule'
  onClose:     () => void
  onSuccess:   (sessionId: string) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GroomingCheckinModal({
  patientId, patientName, tutorId, tutorName, initialMode = 'checkin', onClose, onSuccess,
}: Props) {
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [boxNumber, setBoxNumber]     = useState('')
  const [notes, setNotes]             = useState('')
  // Se modo 'schedule', pré-preenche com data de amanhã às 09:00
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    if (initialMode === 'schedule') {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      return tomorrow.toISOString().slice(0, 16)
    }
    return ''
  })
  const [isSaving, setIsSaving]       = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [groomerId, setGroomerId]     = useState('')
  const [professionals, setProfessionals] = useState<ClinicProfessional[]>([])

  // Catálogo de preços
  const [catalog, setCatalog]     = useState<GroomingCatalogItem[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)

  useEffect(() => {
    getGroomingCatalog().then(res => {
      if (!('error' in res)) setCatalog(res)
      setCatalogLoaded(true)
    })
    getClinicProfessionals().then(res => {
      if (!('error' in res)) setProfessionals(res)
    })
  }, [])

  // ─── Helpers de preço ──────────────────────────────────────────────────────

  function getPriceForService(name: string): number | null {
    const item = catalog.find(c => c.name.toLowerCase() === name.toLowerCase())
    return item ? item.price : null
  }

  function getServicePrices(): GroomingServicePrice[] {
    return selectedServices.map(svc => ({
      name:  svc,
      price: getPriceForService(svc) ?? 0,
    }))
  }

  const subtotal = getServicePrices().reduce((sum, s) => sum + s.price, 0)
  const hasPrices = subtotal > 0

  function toggleService(svc: string) {
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    )
  }

  // Serviços a exibir: catálogo (se existir) + defaults que não estão no catálogo
  const catalogNames    = catalog.map(c => c.name)
  const extraDefaults   = DEFAULT_SERVICES.filter(s => !catalogNames.includes(s))
  const servicesDisplay = catalogLoaded
    ? [...catalog.map(c => c.name), ...extraDefaults]
    : DEFAULT_SERVICES

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedServices.length === 0) {
      setError('Selecione ao menos um serviço.')
      return
    }

    setIsSaving(true)
    setError(null)

    const result = await createGroomingSession({
      patient_id:         patientId,
      tutor_id:           tutorId,
      services_requested: selectedServices,
      box_number:         boxNumber.trim() || undefined,
      notes:              notes.trim() || undefined,
      scheduled_at:       scheduledAt || undefined,
      groomer_id:         groomerId || undefined,
    })

    if ('error' in result) {
      setIsSaving(false)
      setError(result.error)
      return
    }

    // Salvar preços se houver catálogo
    if (hasPrices) {
      await updateGroomingPricing(result.id, getServicePrices(), 0)
    }

    setIsSaving(false)
    onSuccess(result.id)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const isScheduling = initialMode === 'schedule' || (!!scheduledAt && new Date(scheduledAt) > new Date())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-teal-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-teal-600 flex items-center justify-center">
              <Scissors className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isScheduling ? 'Agendar Banho e Tosa' : 'Check-in Banho e Tosa'}
              </h2>
              <p className="text-xs text-slate-500">{patientName} · Tutor: {tutorName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-teal-100 rounded-full transition-colors text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Serviços */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 block">
              Serviços Solicitados <span className="text-rose-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {servicesDisplay.map(svc => {
                const selected = selectedServices.includes(svc)
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
                      <span className={`text-[9px] font-bold font-mono tabular-nums ${selected ? 'text-teal-100' : 'text-teal-600'}`}>
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">
                Tosador / Banhista (opcional)
              </label>
              <select
                value={groomerId}
                onChange={e => setGroomerId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Sem preferência</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Agendamento */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Agendamento (opcional)
            </label>
            <DateTimePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              placeholder="Selecionar data e hora"
            />
            {isScheduling && (
              <p className="text-[10px] text-teal-600 mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Sessão será agendada — aparecerá na coluna Agendados até a data/hora
              </p>
            )}
          </div>

          {/* Box */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">
              Box / Banheiro (opcional)
            </label>
            <input
              type="text"
              value={boxNumber}
              onChange={e => setBoxNumber(e.target.value)}
              placeholder="Ex: Box 1, Banheiro A..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Pet agressivo, alergia a perfume..."
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5 border border-rose-200">
              {error}
            </p>
          )}

          {/* Resumo / Total */}
          {selectedServices.length > 0 && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold text-teal-600 uppercase flex items-center gap-1">
                <Tag className="h-3 w-3" /> Serviços selecionados
              </p>
              {hasPrices ? (
                <div className="space-y-1">
                  {getServicePrices().map(sp => (
                    <div key={sp.name} className="flex justify-between text-xs">
                      <span className="text-teal-800">{sp.name}</span>
                      <span className="font-bold text-teal-700 font-mono tabular-nums">
                        {sp.price > 0 ? `R$ ${sp.price.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-teal-300 pt-1 flex justify-between text-sm font-bold">
                    <span className="text-teal-800 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Total
                    </span>
                    <span className="text-teal-700 font-mono tabular-nums">R$ {subtotal.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-teal-800 font-medium">{selectedServices.join(', ')}</p>
              )}
              {!hasPrices && catalogLoaded && catalog.length === 0 && (
                <p className="text-[9px] text-teal-500">
                  💡 Cadastre preços em Gestão → Catálogo para ver o total automaticamente
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || selectedServices.length === 0}
              className="flex-1 py-2.5 rounded-lg bg-teal-600 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</>
                : isScheduling
                  ? <><Calendar className="h-4 w-4" /> Agendar</>
                  : <><Save className="h-4 w-4" /> Iniciar Atendimento</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
