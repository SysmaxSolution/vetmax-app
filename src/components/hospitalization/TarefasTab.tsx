'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Check, CircleStop, FlaskConical, Stethoscope, Utensils, ClipboardList, Pencil, Trash2, X } from 'lucide-react'
import {
  listHospitalizationTasks, createHospitalizationTask, markTaskDone, updateTaskStatus,
  updateHospitalizationTask, deleteHospitalizationTask,
  type HospTask, type TaskKind,
} from '@/lib/actions/hospitalization-tasks'

/**
 * Aba "Tarefas" do card de internação (Internação Completa). Agenda exames,
 * procedimentos e alimentação com frequência — entram no Mapa de Execução ao
 * lado das medicações.
 */

interface Props {
  hospitalizationId: string
  /** Refresh do board/Mapa após criar/marcar tarefa. */
  onChanged?: () => void
}

const KIND_OPTS: { value: TaskKind; label: string; icon: React.ReactNode }[] = [
  { value: 'feeding',   label: 'Alimentação', icon: <Utensils      className="h-3.5 w-3.5" /> },
  { value: 'exam',      label: 'Exame',       icon: <FlaskConical   className="h-3.5 w-3.5" /> },
  { value: 'procedure', label: 'Procedimento', icon: <Stethoscope   className="h-3.5 w-3.5" /> },
  { value: 'other',     label: 'Outro',       icon: <ClipboardList  className="h-3.5 w-3.5" /> },
]
const FREQ_OPTS: { value: number | null; label: string }[] = [
  { value: 4, label: '4/4h' }, { value: 6, label: '6/6h' }, { value: 8, label: '8/8h' },
  { value: 12, label: '12/12h' }, { value: 24, label: '1×/dia' }, { value: null, label: 'Única' },
]
const KIND_LABEL: Record<TaskKind, string> = { feeding: 'Alimentação', exam: 'Exame', procedure: 'Procedimento', other: 'Outro' }

export default function TarefasTab({ hospitalizationId, onChanged }: Props) {
  const [tasks, setTasks] = useState<HospTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [kind, setKind] = useState<TaskKind>('feeding')
  const [desc, setDesc] = useState('')
  const [freq, setFreq] = useState<number | null>(8)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function reload() {
    const res = await listHospitalizationTasks(hospitalizationId)
    if (Array.isArray(res)) setTasks(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [hospitalizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() { setEditingId(null); setKind('feeding'); setDesc(''); setFreq(8); setError(null) }
  function startEdit(t: HospTask) { setEditingId(t.id); setKind(t.kind); setDesc(t.description); setFreq(t.frequency_hours); setError(null) }

  async function handleSave() {
    setError(null)
    if (!desc.trim()) { setError('Descreva a tarefa.'); return }
    setBusy(true)
    const res = editingId
      ? await updateHospitalizationTask(editingId, { kind, description: desc.trim(), frequency_hours: freq })
      : await createHospitalizationTask({ hospitalization_id: hospitalizationId, kind, description: desc.trim(), frequency_hours: freq })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    resetForm(); await reload(); onChanged?.()
  }

  async function handleDone(id: string) { setBusy(true); await markTaskDone(id); setBusy(false); await reload(); onChanged?.() }
  async function handleFinish(id: string) { setBusy(true); await updateTaskStatus(id, 'done'); setBusy(false); await reload(); onChanged?.() }
  async function handleDelete(id: string) {
    if (!confirm('Remover esta tarefa?')) return
    setBusy(true); await deleteHospitalizationTask(id); setBusy(false)
    if (editingId === id) resetForm()
    await reload(); onChanged?.()
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4" data-testid="tarefas-tab">
      {/* Agendar tarefa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{editingId ? 'Editar Tarefa' : 'Agendar Tarefa'}</h3>
          {editingId && (
            <button type="button" onClick={resetForm} className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
              <X className="h-3 w-3" /> Cancelar edição
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_OPTS.map(k => (
            <button key={k.value} type="button" onClick={() => setKind(k.value)} data-testid={`task-kind-${k.value}`}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors ${kind === k.value ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex.: Ração úmida; Raio-X tórax; Curativo…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          <select value={freq === null ? 'null' : String(freq)} onChange={e => setFreq(e.target.value === 'null' ? null : Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-violet-500 focus:outline-none">
            {FREQ_OPTS.map(o => <option key={o.label} value={o.value === null ? 'null' : String(o.value)}>{o.label}</option>)}
          </select>
          <button onClick={handleSave} disabled={busy} data-testid="task-create-btn"
            className="flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {editingId ? 'Salvar' : 'Agendar'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-[11px] text-slate-400">As tarefas aparecem no Mapa de Execução junto com as medicações.</p>
      </div>

      {/* Lista */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Tarefas Ativas</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4">Nenhuma tarefa agendada.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className="font-semibold text-slate-500 w-24">{KIND_LABEL[t.kind]}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{t.description}</span>
                <span className="text-[10px] text-slate-400">{t.frequency_hours ? `${t.frequency_hours}/${t.frequency_hours}h` : 'única'}</span>
                <button onClick={() => handleDone(t.id)} disabled={busy} title="Marcar feito agora"
                  className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-1 font-semibold disabled:opacity-50">
                  <Check className="h-3 w-3" /> Feito
                </button>
                <button onClick={() => startEdit(t)} disabled={busy} title="Editar tarefa" data-testid={`task-edit-${t.id}`}
                  className="text-slate-300 hover:text-violet-600 disabled:opacity-50">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(t.id)} disabled={busy} title="Remover tarefa" data-testid={`task-delete-${t.id}`}
                  className="text-slate-300 hover:text-rose-600 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleFinish(t.id)} disabled={busy} title="Encerrar tarefa" className="text-slate-300 hover:text-slate-600 disabled:opacity-50">
                  <CircleStop className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
