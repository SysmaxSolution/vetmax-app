'use client'

import { useState, useEffect } from 'react'
import { FileText, Plus, Loader2, AlertTriangle, X, Heart, Skull, Trash2, Stethoscope, Brain } from 'lucide-react'
import { DateTimePicker } from '@/components/ui/DatePicker'
import {
  createPatientNote, listPatientNotes, recordPatientDeath, deletePatientNote,
  type PatientNote, type NoteType,
} from '@/lib/actions/patient-notes'

interface Props {
  patientId:   string
  patientName: string
  isDeceased:  boolean   // patient.deceased_at != null
  onDeathRecorded?: () => void
}

const NOTE_TYPE_LABEL: Record<NoteType, { label: string; icon: any; color: string }> = {
  observation: { label: 'Observação',         icon: FileText,   color: 'slate'  },
  clinical:    { label: 'Anotação clínica',   icon: Stethoscope, color: 'blue'   },
  behavior:    { label: 'Comportamento',      icon: Brain,      color: 'amber'  },
  other:       { label: 'Outra',              icon: FileText,   color: 'slate'  },
  death:       { label: 'Óbito',              icon: Heart,      color: 'violet' },
}

export default function PatientNotesPanel({ patientId, patientName, isDeceased, onDeathRecorded }: Props) {
  const [notes, setNotes]       = useState<PatientNote[]>([])
  const [loading, setLoading]   = useState(true)
  const [showSelector, setShowSelector] = useState(false)
  const [genericModal, setGenericModal] = useState<{ type: Exclude<NoteType, 'death'> } | null>(null)
  const [deathModal, setDeathModal]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPatientNotes(patientId).then(res => {
      if (cancelled) return
      if (!('error' in res)) setNotes(res)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [patientId])

  function reload() {
    listPatientNotes(patientId).then(res => {
      if (!('error' in res)) setNotes(res)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800">Notas do Pet</h3>
          {notes.length > 0 && (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              {notes.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova nota
        </button>
      </header>

      {loading ? (
        <div className="px-5 py-6 flex items-center justify-center text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : notes.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-slate-400">
          Nenhuma nota registrada ainda. Use o botão acima para a primeira anotação.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {notes.map(n => {
            const cfg = NOTE_TYPE_LABEL[n.note_type] ?? NOTE_TYPE_LABEL.other
            const Icon = cfg.icon
            const isDeath = n.note_type === 'death'
            return (
              <li key={n.id} className={`px-5 py-3 ${isDeath ? 'bg-violet-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 text-${cfg.color}-600`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-xs font-bold uppercase tracking-wide text-${cfg.color}-700`}>{cfg.label}</p>
                        {n.title && <p className="text-sm font-semibold text-slate-900 truncate">{n.title}</p>}
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{n.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(n.created_at).toLocaleString('pt-BR')}
                        {n.created_by_name ? ` · ${n.created_by_name}` : ''}
                      </p>
                    </div>
                  </div>
                  {!isDeath && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(n.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                      title="Remover nota"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Seletor de tipo */}
      {showSelector && (
        <NoteTypeSelector
          isDeceased={isDeceased}
          onClose={() => setShowSelector(false)}
          onPick={type => {
            setShowSelector(false)
            if (type === 'death') setDeathModal(true)
            else setGenericModal({ type })
          }}
        />
      )}

      {/* Modal genérico (observação/clínica/comportamento/outra) */}
      {genericModal && (
        <GenericNoteModal
          patientId={patientId}
          patientName={patientName}
          noteType={genericModal.type}
          onClose={() => setGenericModal(null)}
          onSaved={() => { setGenericModal(null); reload() }}
        />
      )}

      {/* Modal de óbito (caso especial, validações + aviso) */}
      {deathModal && (
        <DeathNoteModal
          patientId={patientId}
          patientName={patientName}
          onClose={() => setDeathModal(false)}
          onSaved={() => {
            setDeathModal(false)
            reload()
            onDeathRecorded?.()
          }}
        />
      )}

      {/* Confirmação de delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-900">Remover esta nota?</p>
            <p className="text-xs text-slate-500">A ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                onClick={async () => {
                  const id = confirmDelete
                  setConfirmDelete(null)
                  const res = await deletePatientNote(id)
                  if (!('error' in res)) reload()
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function NoteTypeSelector({
  isDeceased, onClose, onPick,
}: {
  isDeceased: boolean
  onClose: () => void
  onPick: (t: NoteType) => void
}) {
  const types: NoteType[] = ['observation', 'clinical', 'behavior', 'other', 'death']
  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Tipo de nota</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {types.map(t => {
            const cfg = NOTE_TYPE_LABEL[t]
            const Icon = cfg.icon
            const disabled = t === 'death' && isDeceased
            return (
              <button
                key={t}
                onClick={() => !disabled && onPick(t)}
                disabled={disabled}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-semibold transition-colors ${
                  t === 'death'
                    ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-5 w-5" />
                {cfg.label}
                {disabled && <span className="text-[10px] text-violet-500 font-normal">já registrado</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function GenericNoteModal({
  patientId, patientName, noteType, onClose, onSaved,
}: {
  patientId: string
  patientName: string
  noteType: Exclude<NoteType, 'death'>
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = NOTE_TYPE_LABEL[noteType].label

  async function handleSave() {
    if (!content.trim()) { setError('Conteúdo é obrigatório.'); return }
    setSubmitting(true); setError(null)
    const res = await createPatientNote({
      patient_id: patientId,
      note_type:  noteType,
      title:      title.trim() || null,
      content:    content.trim(),
    })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[10055] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Nova nota — {label}</h3>
            <p className="text-xs text-slate-500">{patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Título (opcional)</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ex: Preferência alimentar"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Conteúdo *</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Escreva a anotação…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
            />
            <p className="text-[10px] text-slate-400 text-right mt-0.5">{content.length}/5000</p>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
          <button onClick={handleSave} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar nota'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeathNoteModal({
  patientId, patientName, onClose, onSaved,
}: {
  patientId: string
  patientName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [deceasedAt, setDeceasedAt] = useState<string>('')
  const [cause, setCause]           = useState('')
  const [weight, setWeight]         = useState('')
  const [place, setPlace]           = useState<'clinic' | 'home' | 'other' | ''>('')
  const [bodyDestination, setBodyDestination] = useState('')
  const [necropsyDone, setNecropsyDone] = useState(false)
  const [observations, setObservations] = useState('')
  const [confirmStep, setConfirmStep] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!deceasedAt) { setError('Data do óbito é obrigatória.'); return }
    setSubmitting(true); setError(null)
    const res = await recordPatientDeath({
      patient_id:       patientId,
      deceased_at:      deceasedAt,
      cause:            cause.trim() || null,
      weight_at_death:  weight ? parseFloat(weight.replace(',', '.')) : null,
      place:            place || null,
      body_destination: bodyDestination.trim() || null,
      necropsy_done:    necropsyDone || null,
      observations:     observations.trim() || null,
    })
    setSubmitting(false)
    if ('error' in res) { setError(res.error); setConfirmStep(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[10055] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-violet-200 bg-gradient-to-br from-violet-50 to-white px-5 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Registrar óbito — {patientName}</h3>
              <p className="text-xs text-slate-500">Procedimento sensível. Todos os campos são opcionais, exceto a data.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aviso */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-violet-800 leading-relaxed">
              <p className="font-semibold mb-0.5">Antes de confirmar</p>
              <ul className="list-disc list-inside space-y-0.5 text-violet-700">
                <li>Após o registro, o pet não poderá mais ser incluído em atendimentos</li>
                <li><strong>Nenhuma mensagem é enviada ao tutor</strong> — comunique pessoalmente</li>
                <li>O cadastro permanece visível apenas para consulta de histórico</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Data e hora estimada do óbito *</label>
              <DateTimePicker value={deceasedAt} onChange={setDeceasedAt} placeholder="Selecionar" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Local</label>
              <select
                value={place}
                onChange={e => setPlace(e.target.value as any)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              >
                <option value="">— Não informado —</option>
                <option value="clinic">Clínica</option>
                <option value="home">Domicílio do tutor</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Causa / Motivo</label>
              <input
                value={cause}
                onChange={e => setCause(e.target.value)}
                maxLength={200}
                placeholder="Ex: parada cardíaca, eutanásia humanitária..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Peso no momento (kg)</label>
              <input
                value={weight}
                onChange={e => setWeight(e.target.value.replace(/[^0-9,.]/g, '').replace('.', ','))}
                inputMode="decimal"
                placeholder="Ex: 12,5"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Destino do corpo</label>
              <input
                value={bodyDestination}
                onChange={e => setBodyDestination(e.target.value)}
                maxLength={200}
                placeholder="Cremação individual / coletiva / sepultamento / entregue ao tutor"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              />
              <p className="text-[10px] text-slate-400 mt-1">Conforme exigência do MAPA para registros sanitários quando aplicável.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={necropsyDone}
                  onChange={e => setNecropsyDone(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Necropsia realizada
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Observações</label>
              <textarea
                value={observations}
                onChange={e => setObservations(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Notas adicionais para o prontuário (opcional)…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Cancelar
          </button>
          {!confirmStep ? (
            <button
              onClick={() => {
                if (!deceasedAt) { setError('Data do óbito é obrigatória.'); return }
                setError(null); setConfirmStep(true)
              }}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 flex items-center gap-2"
            >
              <Heart className="h-4 w-4" /> Continuar
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : <>Confirmar óbito definitivamente</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
