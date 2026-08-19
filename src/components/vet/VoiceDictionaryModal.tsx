'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, X, Check, Trash2, Plus, Loader2, Sparkles, Pencil } from 'lucide-react'
import {
  listClinicCorrections,
  setCorrectionStatus,
  updateCorrectionTerms,
  addManualCorrection,
  deleteCorrection,
  type ClinicCorrection,
} from '@/lib/actions/voice-corrections'

export default function VoiceDictionaryModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ClinicCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [newWrong, setNewWrong] = useState('')
  const [newRight, setNewRight] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editRight, setEditRight] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await listClinicCorrections())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    try { await fn() } finally { setBusy(null); await load() }
  }

  const add = async () => {
    if (!newWrong.trim() || !newRight.trim()) return
    setBusy('add')
    try { await addManualCorrection(newWrong, newRight) }
    finally { setBusy(null); setNewWrong(''); setNewRight(''); await load() }
  }

  const suggested = items.filter(i => i.status === 'suggested')
  const active = items.filter(i => i.status === 'active')
  const rejected = items.filter(i => i.status === 'rejected')

  const sourceLabel = (s: ClinicCorrection['source']) =>
    s === 'learned' ? 'aprendida' : s === 'global' ? 'global' : 'manual'

  const Row = ({ c, tone }: { c: ClinicCorrection; tone: 'suggested' | 'active' | 'rejected' }) => {
    const isEditing = editId === c.id
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        tone === 'suggested' ? 'bg-violet-50 border-violet-200'
        : tone === 'rejected' ? 'bg-slate-50 border-slate-200 opacity-70'
        : 'bg-white border-slate-200'
      }`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-mono text-rose-600 line-through truncate">{c.wrong_term}</span>
            <span className="text-slate-400">→</span>
            {isEditing ? (
              <input
                value={editRight}
                onChange={e => setEditRight(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-1.5 py-0.5 text-sm font-mono focus:border-teal-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <span className="font-mono font-semibold text-emerald-700 truncate">{c.right_term}</span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {sourceLabel(c.source)} · {c.hits} ocorrência{c.hits === 1 ? '' : 's'}
          </p>
        </div>

        {busy === c.id ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : isEditing ? (
          <>
            <button onClick={() => run(c.id, () => updateCorrectionTerms(c.id, c.wrong_term, editRight)).then(() => setEditId(null))}
              className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-700">Salvar</button>
            <button onClick={() => setEditId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            {tone === 'suggested' && (
              <button title="Aprovar" onClick={() => run(c.id, () => setCorrectionStatus(c.id, 'active'))}
                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100"><Check className="h-4 w-4" /></button>
            )}
            {tone !== 'rejected' && (
              <button title="Editar correção" onClick={() => { setEditId(c.id); setEditRight(c.right_term) }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
            )}
            {tone !== 'rejected' ? (
              <button title="Rejeitar" onClick={() => run(c.id, () => setCorrectionStatus(c.id, 'rejected'))}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><X className="h-4 w-4" /></button>
            ) : (
              <button title="Reativar" onClick={() => run(c.id, () => setCorrectionStatus(c.id, 'active'))}
                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100"><Check className="h-4 w-4" /></button>
            )}
            <button title="Excluir" onClick={() => run(c.id, () => deleteCorrection(c.id))}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-teal-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Dicionário de Correção de Voz</h3>
              <p className="text-xs text-slate-500">Termos que o sistema corrige na transcrição antes da IA.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Adicionar manual */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Transcrito como</label>
              <input value={newWrong} onChange={e => setNewWrong(e.target.value)} placeholder="ex: tramado"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none" />
            </div>
            <span className="text-slate-300 pb-1.5">→</span>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Corrigir para</label>
              <input value={newRight} onChange={e => setNewRight(e.target.value)} placeholder="ex: tramadol"
                onKeyDown={e => { if (e.key === 'Enter') add() }}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none" />
            </div>
            <button onClick={add} disabled={busy === 'add' || !newWrong.trim() || !newRight.trim()}
              className="rounded-lg bg-teal-600 px-3 py-2 text-white hover:bg-teal-700 disabled:opacity-40">
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              {suggested.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                    <Sparkles className="h-3.5 w-3.5" /> Aprendidas — aguardando sua revisão ({suggested.length})
                  </p>
                  {suggested.map(c => <Row key={c.id} c={c} tone="suggested" />)}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Ativas ({active.length})</p>
                {active.length === 0
                  ? <p className="text-xs text-slate-400 italic">Nenhuma regra ativa ainda. O dicionário aprende sozinho conforme você corrige o prontuário.</p>
                  : active.map(c => <Row key={c.id} c={c} tone="active" />)}
              </div>

              {rejected.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400">Rejeitadas ({rejected.length})</p>
                  {rejected.map(c => <Row key={c.id} c={c} tone="rejected" />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
