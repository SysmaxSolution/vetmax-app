'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Plus, Trash2, FileStack, Zap, ChevronLeft } from 'lucide-react'
import {
  listPrescriptionTemplates, createPrescriptionTemplate, deletePrescriptionTemplate,
  applyTemplateToHospitalization,
  type PrescriptionTemplateSummary, type TemplateItem,
} from '@/lib/actions/prescription-templates'

/**
 * ProtocolPicker — protocolos de prescrição reutilizáveis (Fase 2).
 * Aplica um protocolo a uma internação com 1 clique (unroll de todas as
 * medicações em hospitalization_prescriptions → Mapa de Execução). Também
 * permite criar novos protocolos.
 */

interface Props {
  hospitalizationId: string
  onClose:   () => void
  onApplied: () => void | Promise<void>
}

const FREQUENCY_OPTIONS: { value: number | null; label: string }[] = [
  { value: 4,    label: '4/4h' },
  { value: 6,    label: '6/6h' },
  { value: 8,    label: '8/8h' },
  { value: 12,   label: '12/12h' },
  { value: 24,   label: '1×/dia' },
  { value: 48,   label: '2/2 dias' },
  { value: null, label: 'SOS' },
]
const ROUTES = ['IV', 'IM', 'SC', 'Oral', 'Tópica', 'Inalatória', 'Retal']

type DraftItem = {
  medication_name: string; dose: string; route: string;
  frequency_hours: number | null; duration_hours: string
}
const emptyItem = (): DraftItem => ({ medication_name: '', dose: '', route: 'IV', frequency_hours: 8, duration_hours: '' })

export default function ProtocolPicker({ hospitalizationId, onClose, onApplied }: Props) {
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [templates, setTemplates] = useState<PrescriptionTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [toast, setToast]     = useState<string | null>(null)

  // create form
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [saving, setSaving] = useState(false)

  async function reload() {
    const res = await listPrescriptionTemplates()
    if (Array.isArray(res)) setTemplates(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  async function handleApply(id: string) {
    setBusyId(id); setError(null)
    const res = await applyTemplateToHospitalization(id, hospitalizationId)
    setBusyId(null)
    if ('error' in res) { setError(res.error); return }
    setToast(`${res.count} medicação(ões) lançada(s) no Mapa de Execução.`)
    await onApplied()
    setTimeout(() => { setToast(null); onClose() }, 1200)
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    await deletePrescriptionTemplate(id)
    setBusyId(null)
    await reload()
  }

  function setItem(idx: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  async function handleCreate() {
    setError(null)
    if (!name.trim()) { setError('Informe o nome do protocolo.'); return }
    const valid = items.filter(i => i.medication_name.trim())
    if (valid.length === 0) { setError('Adicione ao menos uma medicação.'); return }
    setSaving(true)
    const payload: { name: string; description: string | null; items: TemplateItem[] } = {
      name: name.trim(),
      description: desc.trim() || null,
      items: valid.map(i => ({
        medication_name:   i.medication_name.trim(),
        dose:              i.dose.trim() || null,
        route:             i.route || null,
        frequency_hours:   i.frequency_hours,
        duration_hours:    i.duration_hours ? parseInt(i.duration_hours, 10) || null : null,
        notes:             null,
        stock_item_id:     null,
        quantity_per_dose: null,
      })),
    }
    const res = await createPrescriptionTemplate(payload)
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    setName(''); setDesc(''); setItems([emptyItem()]); setMode('list')
    await reload()
  }

  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50/50">
          <div className="flex items-center gap-3">
            {mode === 'create' && (
              <button onClick={() => setMode('list')} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600"><FileStack className="h-5 w-5 text-white" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{mode === 'list' ? 'Protocolos de Prescrição' : 'Novo Protocolo'}</h2>
              <p className="text-[11px] text-slate-500">{mode === 'list' ? 'Aplique um protocolo de uma só vez' : 'Modelo reutilizável de medicações'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
          {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{toast}</div>}

          {mode === 'list' ? (
            loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-slate-200">
                <FileStack className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-500">Nenhum protocolo cadastrado</p>
                <p className="text-xs text-slate-400 mt-0.5">Crie um para aplicar em 1 clique.</p>
              </div>
            ) : (
              templates.map(t => (
                <div key={t.id} data-testid={`protocol-${t.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{t.item_count} medicação(ões){t.description ? ` · ${t.description}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleApply(t.id)} disabled={busyId !== null}
                    data-testid="protocol-apply"
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                    {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Aplicar
                  </button>
                  <button onClick={() => handleDelete(t.id)} disabled={busyId !== null} className="text-slate-300 hover:text-rose-500 disabled:opacity-50" title="Remover protocolo">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )
          ) : (
            // ── Create ──
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do protocolo (ex.: Analgesia Pós-Op)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição (opcional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={it.medication_name} onChange={e => setItem(idx, { medication_name: e.target.value })} placeholder="Medicação *"
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none" />
                      {items.length > 1 && (
                        <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500" title="Remover"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input value={it.dose} onChange={e => setItem(idx, { dose: e.target.value })} placeholder="Dose"
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none" />
                      <select value={it.route} onChange={e => setItem(idx, { route: e.target.value })}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none">
                        {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select value={it.frequency_hours === null ? 'null' : String(it.frequency_hours)}
                        onChange={e => setItem(idx, { frequency_hours: e.target.value === 'null' ? null : parseFloat(e.target.value) })}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none">
                        {FREQUENCY_OPTIONS.map(o => <option key={o.label} value={o.value === null ? 'null' : String(o.value)}>{o.label}</option>)}
                      </select>
                      <input type="number" min="1" value={it.duration_hours} onChange={e => setItem(idx, { duration_hours: e.target.value })} placeholder="Dur. (h)"
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none" />
                    </div>
                  </div>
                ))}
                <button onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  <Plus className="h-3.5 w-3.5" /> Adicionar medicação
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 px-5 py-3 border-t border-slate-100">
          {mode === 'list' ? (
            <button onClick={() => setMode('create')}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700">
              <Plus className="h-3.5 w-3.5" /> Novo Protocolo
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving}
              data-testid="protocol-save"
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</> : <><Plus className="h-3.5 w-3.5" /> Salvar Protocolo</>}
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
        </div>
      </div>
    </div>
  )
}
