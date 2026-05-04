'use client'

import { useState, useEffect } from 'react'
import { Syringe, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Calendar, X, Pencil, Check } from 'lucide-react'
import { addVaccine, deleteVaccine, updateVaccine, type PatientVaccine } from '@/lib/actions/vaccines'
import { DatePicker } from '@/components/ui/DatePicker'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false
  return new Date(nextDueDate) < new Date()
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

// ─── Inline Toast ─────────────────────────────────────────────────────────────

type ToastState = { type: 'success' | 'error'; message: string } | null

function InlineToast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium ${
      toast.type === 'success'
        ? 'bg-green-50 border border-green-200 text-green-800'
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

  // Edit state
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editName,       setEditName]       = useState('')
  const [editDate,       setEditDate]       = useState('')
  const [editNextDue,    setEditNextDue]    = useState('')
  const [editNotes,      setEditNotes]      = useState('')
  const [isUpdating,     setIsUpdating]     = useState(false)

  function startEditVaccine(v: PatientVaccine) {
    setEditingId(v.id)
    setEditName(v.vaccine_name)
    setEditDate(v.date_administered)
    setEditNextDue(v.next_due_date ?? '')
    setEditNotes(v.notes ?? '')
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
      })

      if ('error' in res) {
        setToast({ type: 'error', message: `Erro ao salvar: ${res.error}` })
        return
      }

      setVaccines(prev => [res, ...prev])
      setName(''); setDate(new Date().toISOString().split('T')[0])
      setNextDue(''); setNotes(''); setShowForm(false)
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
          <Syringe className="h-4 w-4 text-green-600" />
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
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
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
        <div className="px-6 py-4 border-b border-slate-100 bg-green-50/30 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nova Vacinação</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Vacina *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Ex: V10, Antirrábica, Giardia..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Data de Aplicação</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Próxima Dose</label>
              <DatePicker value={nextDue} onChange={setNextDue} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onKeyDown={e => blockEnter(e, handleAdd)}
                placeholder="Lote, fabricante, reações..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !name.trim()}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
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
                  <div className="px-6 py-4 bg-green-50/40 border-l-2 border-green-400 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Editar Vacina</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Vacina *</label>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUpdate() } }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Data de Aplicação</label>
                        <DatePicker value={editDate} onChange={setEditDate} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Próxima Dose</label>
                        <DatePicker value={editNextDue} onChange={setEditNextDue} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Observações</label>
                        <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          placeholder="Lote, fabricante, reações..."
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleUpdate} disabled={isUpdating || !editName.trim()}
                        className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50">
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
                      <div className={`mt-0.5 flex-shrink-0 ${overdue ? 'text-red-500' : 'text-green-500'}`}>
                        {overdue ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${overdue ? 'text-red-800' : 'text-slate-800'}`}>{v.vaccine_name}</p>
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
                        {v.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{v.notes}</p>}
                      </div>
                    </div>
                    {!isFinalized && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => startEditVaccine(v)} title="Editar vacina"
                          className="text-slate-300 hover:text-green-600 transition-colors p-1">
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
