'use client'

import { useState, useEffect, useRef } from 'react'
import { Syringe, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Calendar, X, Pencil, Check } from 'lucide-react'
import { addVaccine, deleteVaccine, updateVaccine, type PatientVaccine } from '@/lib/actions/vaccines'
import { searchGlobalCatalog } from '@/lib/actions/catalog'
import { DateInput } from '@/components/ui/DatePicker'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false
  return new Date(nextDueDate) < new Date()
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

// Desloca uma data YYYY-MM-DD por dias/meses (para presets de reforço).
function shiftDate(baseISO: string, opts: { days?: number; months?: number }): string {
  const [y, m, d] = baseISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (opts.days)   dt.setDate(dt.getDate() + opts.days)
  if (opts.months) dt.setMonth(dt.getMonth() + opts.months)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Presets de reforço/próxima dose.
const BOOSTER_PRESETS: { label: string; opts: { days?: number; months?: number } }[] = [
  { label: '21 dias', opts: { days: 21 } },
  { label: '28 dias', opts: { days: 28 } },
  { label: '30 dias', opts: { days: 30 } },
  { label: '45 dias', opts: { days: 45 } },
  { label: '6 meses', opts: { months: 6 } },
  { label: '1 ano',   opts: { months: 12 } },
]

// ─── Inline Toast ─────────────────────────────────────────────────────────────

type ToastState = { type: 'success' | 'error'; message: string } | null

function InlineToast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium ${
      toast.type === 'success'
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
        : 'bg-red-50 border border-red-200 text-red-800'
    }`}>
      <div className="flex items-center gap-2">
        {toast.type === 'success'
          ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          : <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        }
        {toast.message}
      </div>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patientId:         string
  consultationId?:   string   // optional when read-only (e.g. PetTimelineModal)
  initialVaccines:   PatientVaccine[]
  isFinalized?:      boolean
  /** Vaccines merged from voice AI — triggers local state merge */
  externalVaccines?: PatientVaccine[]
  onVaccineSaved?:   () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VaccinationCard({
  patientId,
  consultationId = '',
  initialVaccines,
  isFinalized = false,
  externalVaccines,
  onVaccineSaved,
}: Props) {
  const [vaccines, setVaccines] = useState<PatientVaccine[]>(initialVaccines)
  const [adding,   setAdding]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast,    setToast]    = useState<ToastState>(null)

  // Add form state
  const [name,    setName]    = useState('')
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0])
  const [nextDue, setNextDue] = useState('')
  const [notes,   setNotes]   = useState('')
  const [vType,        setVType]        = useState('')
  const [doseNum,      setDoseNum]      = useState('')
  const [doseTotal,    setDoseTotal]    = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [lot,          setLot]          = useState('')
  const [validity,     setValidity]     = useState('')
  const [route,        setRoute]        = useState('')

  // Autocomplete do catálogo de vacinas
  const [suggestions, setSuggestions] = useState<Array<{ name: string; manufacturer: string; type: string }>>([])
  const [showSug, setShowSug] = useState(false)
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function searchVaccineCatalog(q: string) {
    if (sugTimer.current) clearTimeout(sugTimer.current)
    if (q.trim().length < 2) { setSuggestions([]); setShowSug(false); return }
    sugTimer.current = setTimeout(async () => {
      const res = await searchGlobalCatalog(q.trim(), 'vaccine', 8)
      const list = Array.isArray(res) ? res : []
      setSuggestions(list.map((s: { name: string; common_brand?: string | null; brand?: string | null; subcategory?: string | null }) => ({
        name: s.name,
        manufacturer: s.common_brand ?? s.brand ?? '',
        type: s.subcategory ?? '',
      })))
      setShowSug(list.length > 0)
    }, 250)
  }

  function pickSuggestion(s: { name: string; manufacturer: string; type: string }) {
    setName(s.name)
    if (s.manufacturer) setManufacturer(s.manufacturer)
    if (s.type) setVType(s.type)
    setSuggestions([]); setShowSug(false)
  }

  // Aplica preset de reforço: nextDue = data de aplicação + intervalo.
  function applyBooster(opts: { days?: number; months?: number }) {
    setNextDue(shiftDate(date || new Date().toISOString().split('T')[0], opts))
  }

  // Edit state
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editName,       setEditName]       = useState('')
  const [editDate,       setEditDate]       = useState('')
  const [editNextDue,    setEditNextDue]    = useState('')
  const [editNotes,      setEditNotes]      = useState('')
  const [editVType,        setEditVType]        = useState('')
  const [editDoseNum,      setEditDoseNum]      = useState('')
  const [editDoseTotal,    setEditDoseTotal]    = useState('')
  const [editManufacturer, setEditManufacturer] = useState('')
  const [editLot,          setEditLot]          = useState('')
  const [editValidity,     setEditValidity]     = useState('')
  const [editRoute,        setEditRoute]        = useState('')
  const [isUpdating,     setIsUpdating]     = useState(false)

  function startEditVaccine(v: PatientVaccine) {
    setEditingId(v.id)
    setEditName(v.vaccine_name)
    setEditDate(v.date_administered)
    setEditNextDue(v.next_due_date ?? '')
    setEditNotes(v.notes ?? '')
    setEditVType(v.vaccine_type ?? '')
    setEditDoseNum(v.dose_number != null ? String(v.dose_number) : '')
    setEditDoseTotal(v.dose_total != null ? String(v.dose_total) : '')
    setEditManufacturer(v.manufacturer ?? '')
    setEditLot(v.lot_number ?? '')
    setEditValidity(v.validity_date ?? '')
    setEditRoute(v.administration_route ?? '')
  }

  function applyEditBooster(opts: { days?: number; months?: number }) {
    setEditNextDue(shiftDate(editDate || new Date().toISOString().split('T')[0], opts))
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim()) return
    setIsUpdating(true)
    setToast(null)
    try {
      const res = await updateVaccine(editingId, consultationId, {
        vaccine_name:      editName.trim(),
        date_administered: editDate,
        next_due_date:     editNextDue || undefined,
        notes:             editNotes.trim() || undefined,
        vaccine_type:      editVType.trim() || undefined,
        dose_number:       editDoseNum ? parseInt(editDoseNum) : undefined,
        dose_total:        editDoseTotal ? parseInt(editDoseTotal) : undefined,
        manufacturer:      editManufacturer.trim() || undefined,
        lot_number:        editLot.trim() || undefined,
        validity_date:     editValidity || undefined,
        administration_route: editRoute.trim() || undefined,
      })
      if ('error' in res) {
        setToast({ type: 'error', message: `Erro ao atualizar: ${res.error}` })
      } else {
        setVaccines(prev => prev.map(v => v.id === editingId ? res : v))
        setEditingId(null)
        setToast({ type: 'success', message: `Vacina "${res.vaccine_name}" atualizada!` })
        onVaccineSaved?.()
      }
    } catch {
      setToast({ type: 'error', message: 'Erro inesperado ao atualizar vacina.' })
    } finally {
      setIsUpdating(false)
    }
  }

  // Merge vaccines saved by voice AI without full remount
  useEffect(() => {
    if (!externalVaccines || externalVaccines.length === 0) return
    setVaccines(prev => {
      const existingIds = new Set(prev.map(v => v.id))
      const newOnes = externalVaccines.filter(v => !existingIds.has(v.id))
      return newOnes.length > 0 ? [...newOnes, ...prev] : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(externalVaccines?.map(v => v.id))])

  const overdueCount = vaccines.filter(v => isOverdue(v.next_due_date)).length

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!name.trim()) {
      setToast({ type: 'error', message: 'Informe o nome da vacina.' })
      return
    }
    setAdding(true)
    setToast(null)

    try {
      const res = await addVaccine({
        patient_id:        patientId,
        consultation_id:   consultationId,
        vaccine_name:      name.trim(),
        date_administered: date,
        next_due_date:     nextDue || undefined,
        notes:             notes.trim() || undefined,
        vaccine_type:      vType.trim() || undefined,
        dose_number:       doseNum ? parseInt(doseNum) : undefined,
        dose_total:        doseTotal ? parseInt(doseTotal) : undefined,
        manufacturer:      manufacturer.trim() || undefined,
        lot_number:        lot.trim() || undefined,
        validity_date:     validity || undefined,
        administration_route: route.trim() || undefined,
      })

      if ('error' in res) {
        setToast({ type: 'error', message: `Erro ao salvar: ${res.error}` })
        return
      }

      setVaccines(prev => [res, ...prev])
      setName(''); setDate(new Date().toISOString().split('T')[0])
      setNextDue(''); setNotes(''); setShowForm(false)
      setVType(''); setDoseNum(''); setDoseTotal(''); setManufacturer(''); setLot(''); setValidity(''); setRoute('')
      setToast({ type: 'success', message: `Vacina "${res.vaccine_name}" registrada com sucesso!` })
      onVaccineSaved?.()
    } catch {
      setToast({ type: 'error', message: 'Erro inesperado ao salvar vacina. Tente novamente.' })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await deleteVaccine(id, consultationId)
      if ('error' in res) {
        setToast({ type: 'error', message: `Erro ao remover vacina: ${res.error}` })
      } else {
        setVaccines(prev => prev.filter(v => v.id !== id))
      }
    } catch {
      setToast({ type: 'error', message: 'Erro inesperado ao remover vacina.' })
    } finally {
      setDeleting(null)
    }
  }

  // Bloqueia Enter nos inputs para não propagar para o form pai (TriageForm)
  function blockEnter(e: React.KeyboardEvent, onEnter?: () => void) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onEnter?.()
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
          <Syringe className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Carteira de Vacinação</h2>
          <p className="text-xs text-slate-500">Histórico de vacinas aplicadas nesta clínica</p>
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
            <AlertTriangle className="h-3 w-3" />
            {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
          </span>
        )}
        {!isFinalized && (
          <button
            type="button"
            onClick={() => { setShowForm(v => !v); setToast(null) }}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar
          </button>
        )}
      </div>

      {/* Toast inline */}
      {toast && (
        <div className="px-6 pt-3">
          <InlineToast toast={toast} onClose={() => setToast(null)} />
        </div>
      )}

      {/* Form (inline) */}
      {showForm && !isFinalized && (
        <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/30 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nova Vacinação</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Vacina *</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); searchVaccineCatalog(e.target.value) }}
                onFocus={() => { if (suggestions.length) setShowSug(true) }}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Busque no catálogo: V10, Antirrábica, Giardia..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {showSug && suggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button" onMouseDown={e => { e.preventDefault(); pickSuggestion(s) }}
                      className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 border-b border-slate-50 last:border-0">
                      <p className="text-sm text-slate-700">{s.name}</p>
                      {(s.manufacturer || s.type) && (
                        <p className="text-[10px] text-slate-400">{[s.type, s.manufacturer].filter(Boolean).join(' • ')}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo</label>
              <input type="text" value={vType} onChange={e => setVType(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Ex: polivalente, raiva..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Fabricante</label>
              <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Laboratório"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Dose atual</label>
              <input type="number" min="1" value={doseNum} onChange={e => setDoseNum(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Ex: 1"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Dose total</label>
              <input type="number" min="1" value={doseTotal} onChange={e => setDoseTotal(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Ex: 3"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Lote</label>
              <input type="text" value={lot} onChange={e => setLot(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Nº do lote"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Validade</label>
              <DateInput value={validity} onChange={setValidity} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Via de administração</label>
              <input type="text" value={route} onChange={e => setRoute(e.target.value)} onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="SC, IM, ID, oral..." list="vac-route-options"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
              <datalist id="vac-route-options">
                <option value="SC (subcutânea)" />
                <option value="IM (intramuscular)" />
                <option value="ID (intradérmica)" />
                <option value="Oral" />
                <option value="Intranasal" />
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Data de Aplicação</label>
              <DateInput value={date} onChange={setDate} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Próxima Dose / Reforço</label>
              <DateInput value={nextDue} onChange={setNextDue} />
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-medium text-slate-500 mb-1">Agendar reforço a partir da aplicação:</p>
              <div className="flex flex-wrap gap-1.5">
                {BOOSTER_PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => applyBooster(p.opts)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                    +{p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Reações, observações..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? 'Salvando...' : 'Salvar Vacina'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setToast(null) }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="divide-y divide-slate-100">
        {vaccines.length === 0 ? (
          <div className="px-6 py-6 text-center">
            <Syringe className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhuma vacina registrada</p>
          </div>
        ) : (
          vaccines.map(v => {
            const overdue = isOverdue(v.next_due_date)
            return (
              <div key={v.id}>
                {editingId === v.id ? (
                  <div className="px-6 py-4 bg-emerald-50/40 border-l-2 border-emerald-400 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Editar Vacina</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Vacina *</label>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUpdate() } }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo</label>
                        <input type="text" value={editVType} onChange={e => setEditVType(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Fabricante</label>
                        <input type="text" value={editManufacturer} onChange={e => setEditManufacturer(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Dose atual</label>
                        <input type="number" min="1" value={editDoseNum} onChange={e => setEditDoseNum(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Dose total</label>
                        <input type="number" min="1" value={editDoseTotal} onChange={e => setEditDoseTotal(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Lote</label>
                        <input type="text" value={editLot} onChange={e => setEditLot(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Validade</label>
                        <DateInput value={editValidity} onChange={setEditValidity} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Via de administração</label>
                        <input type="text" value={editRoute} onChange={e => setEditRoute(e.target.value)}
                          placeholder="SC, IM, ID, oral..." list="vac-route-options"
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Data de Aplicação</label>
                        <DateInput value={editDate} onChange={setEditDate} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Próxima Dose</label>
                        <DateInput value={editNextDue} onChange={setEditNextDue} />
                      </div>
                      <div className="col-span-2">
                        <div className="flex flex-wrap gap-1.5">
                          {BOOSTER_PRESETS.map(p => (
                            <button key={p.label} type="button" onClick={() => applyEditBooster(p.opts)}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                              +{p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Observações</label>
                        <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          placeholder="Reações, observações..."
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleUpdate} disabled={isUpdating || !editName.trim()}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                        {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {isUpdating ? 'Salvando...' : 'Atualizar'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`px-6 py-3 flex items-center justify-between gap-4 ${overdue ? 'bg-red-50/50' : ''}`}>
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`mt-0.5 flex-shrink-0 ${overdue ? 'text-red-500' : 'text-emerald-500'}`}>
                        {overdue ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${overdue ? 'text-red-800' : 'text-slate-800'}`}>
                          {v.vaccine_name}
                          {v.dose_number != null && (
                            <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase">
                              Dose {v.dose_number}{v.dose_total ? `/${v.dose_total}` : ''}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500">Aplicada em {formatDate(v.date_administered)}</span>
                          {v.next_due_date && (
                            <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                              <Calendar className="h-3 w-3" />
                              {overdue ? 'Atrasada — ' : 'Próxima: '}
                              {formatDate(v.next_due_date)}
                            </span>
                          )}
                        </div>
                        {(v.vaccine_type || v.manufacturer || v.lot_number) && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {[v.vaccine_type, v.manufacturer, v.lot_number && `Lote ${v.lot_number}`].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        {v.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{v.notes}</p>}
                      </div>
                    </div>
                    {!isFinalized && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => startEditVaccine(v)} title="Editar vacina"
                          className="text-slate-300 hover:text-emerald-600 transition-colors p-1">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDelete(v.id)} disabled={deleting === v.id}
                          className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 disabled:opacity-50 p-1"
                          title="Remover vacina">
                          {deleting === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
