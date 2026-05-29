'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Check, X, User, Clock } from 'lucide-react'
import {
  listSurgeryRecords, createSurgeryRecord, updateSurgeryRecord, deleteSurgeryRecord,
  type SurgeryRecord, type SurgeryStage,
} from '@/lib/actions/surgery-records'
import { formatClinicShort } from '@/lib/time'

/**
 * Mini-feed cronológico por etapa do acordeão de cirurgia (preop / anesthesia /
 * report). Cada item: autor + carimbo + texto livre. O autor pode editar/excluir
 * os próprios enquanto a cirurgia não estiver finalizada.
 */

interface Props {
  surgeryId:    string
  stage:        SurgeryStage
  /** Se a cirurgia já está done/canceled, esconde os controles de edição. */
  locked?:      boolean
}

function fmt(iso: string): string {
  return formatClinicShort(iso)
}

export default function SurgeryStageFeed({ surgeryId, stage, locked = false }: Props) {
  const [records, setRecords] = useState<SurgeryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; notes: string } | null>(null)

  async function reload() {
    const res = await listSurgeryRecords(surgeryId, stage)
    if (Array.isArray(res)) setRecords(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [surgeryId, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!draft.trim()) return
    setBusy(true); setError(null)
    const res = await createSurgeryRecord({ surgery_id: surgeryId, stage, notes: draft })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDraft(''); await reload()
  }

  async function handleSaveEdit() {
    if (!editing) return
    setBusy(true); setError(null)
    const res = await updateSurgeryRecord(editing.id, editing.notes)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setEditing(null); await reload()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta anotação?')) return
    setBusy(true); setError(null)
    const res = await deleteSurgeryRecord(id)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    await reload()
  }

  return (
    <div className="space-y-2" data-testid={`surgery-feed-${stage}`}>
      {!locked && (
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Adicionar anotação cronológica…" rows={2}
            data-testid={`surgery-feed-input-${stage}`}
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-violet-500 focus:outline-none resize-y" />
          <button type="button" onClick={handleAdd} disabled={busy || !draft.trim()} data-testid={`surgery-feed-add-${stage}`}
            className="flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : records.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">Sem anotações nesta etapa.</p>
      ) : (
        <div className="space-y-1.5">
          {records.map(r => editing?.id === r.id ? (
            <div key={r.id} className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-1.5">
              <textarea value={editing.notes} onChange={e => setEditing({ id: r.id, notes: e.target.value })} rows={2}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
              <div className="flex gap-1.5">
                <button onClick={handleSaveEdit} disabled={busy} className="flex items-center gap-1 rounded bg-violet-600 hover:bg-violet-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"><Check className="h-3 w-3" /> Salvar</button>
                <button onClick={() => setEditing(null)} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500"><X className="h-3 w-3" /> Cancelar</button>
              </div>
            </div>
          ) : (
            <div key={r.id} data-testid={`surgery-feed-item-${r.id}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <Clock className="h-3 w-3" /> {fmt(r.created_at)}
                {r.author_name && <><span>·</span><User className="h-3 w-3" /> {r.author_name}</>}
                {r.updated_at !== r.created_at && <span className="text-slate-400 italic">(editado)</span>}
                {!locked && (
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => setEditing({ id: r.id, notes: r.notes })} data-testid={`surgery-feed-edit-${r.id}`} className="text-slate-300 hover:text-violet-600" title="Editar"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => handleDelete(r.id)} data-testid={`surgery-feed-del-${r.id}`} className="text-slate-300 hover:text-rose-600" title="Remover"><Trash2 className="h-3 w-3" /></button>
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{r.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
